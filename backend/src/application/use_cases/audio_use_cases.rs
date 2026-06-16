use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::sync::Arc;
use anyhow::Result;
use rand::seq::SliceRandom;
use serde::{Deserialize, Serialize};

use crate::application::use_cases::auth::AuthUseCases;
use crate::config::Settings;
use crate::domain::repositories::audio::AudioGenerator;
use crate::domain::repositories::storage::StorageRepository;
use crate::infrastructure::ai::gemini_tts_provider::GEMINI_TTS_MODEL;
use crate::infrastructure::ai::gemini_voices::{GEMINI_FEMALE_VOICES, GEMINI_MALE_VOICES, GEMINI_VOICE_POOL};
use crate::infrastructure::ai::routing_tts_provider::SPANISH_TTS_BACKEND;

/// Bump al cambiar esquema de caché de audio.
const UNIFIED_AUDIO_FORMAT: &str = "random-voice-v2";

/// Convierte un email en un segmento de path seguro para URL/filesystem.
fn user_path_segment(email: &str) -> String {
    email
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '-' { c.to_ascii_lowercase() } else { '_' })
        .collect()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct AudioMeta {
    voice: String,
}

pub struct AudioSynthResult {
    pub audio_url: String,
    pub voice_name: String,
}

// ---------------------------------------------------------------------------
// Application-layer DTOs (no serde, no HTTP concerns)
// ---------------------------------------------------------------------------

pub struct AudioSynthRequest {
    pub category: String,
    pub deck: String,
    pub text: String,
    pub voice_name: String,
    pub verb_name: Option<String>,
    pub tone: Option<String>,
    pub lang: Option<String>,
    /// Voz a excluir al generar (p. ej. tras rotar).
    pub exclude_voice: Option<String>,
    /// Tras rotar voz: ignorar caché y regenerar TTS.
    pub force_regenerate: bool,
}

pub struct AudioUseCases {
    storage_repo: Arc<dyn StorageRepository>,
    audio_gen: Arc<dyn AudioGenerator>,
    settings: Arc<Settings>,
}

impl AudioUseCases {
    pub fn new(
        storage_repo: Arc<dyn StorageRepository>,
        audio_gen: Arc<dyn AudioGenerator>,
        _ai_tutor: Arc<dyn crate::domain::repositories::tutor::AITutor>,
        settings: Arc<Settings>,
    ) -> Self {
        Self {
            storage_repo,
            audio_gen,
            settings,
        }
    }

    /// Misma instancia con otro generador TTS (p. ej. batch local con clave de respaldo).
    pub fn with_audio_generator(&self, audio_gen: Arc<dyn AudioGenerator>) -> Self {
        Self {
            storage_repo: Arc::clone(&self.storage_repo),
            audio_gen,
            settings: Arc::clone(&self.settings),
        }
    }

    /// Comprueba si el audio global (capa admin) ya está en storage.
    pub async fn global_audio_exists(&self, req: &AudioSynthRequest) -> Result<bool> {
        let blob_path = self.global_audio_blob_path(req);
        self.storage_repo.blob_exists(&blob_path).await
    }

    /// Nombre de archivo OGG global (sin prefijo `card_audio/`).
    pub fn global_audio_basename(&self, req: &AudioSynthRequest) -> String {
        self.deterministic_audio_filename(req, None)
            .rsplit('/')
            .next()
            .unwrap_or("")
            .to_string()
    }

    /// Ruta completa del blob global (p. ej. para logs del batch).
    pub fn global_audio_blob_path(&self, req: &AudioSynthRequest) -> String {
        let file_name = self.deterministic_audio_filename(req, None);
        format!("{}/{}", self.settings.gcs_audio_prefix, file_name)
    }

    /// Precarga audio en la **capa global compartida** (misma ruta que si un admin lo genera desde la UI).
    ///
    /// - Guarda bajo `card_audio/{category}/{deck}/...` (sin `users/…`).
    /// - Viewer / premium lo reciben vía fallback global en `get_or_synthesize_audio`.
    /// - Equivalente al batch de imágenes con rol `admin`.
    pub async fn get_or_synthesize_shared_global_audio(
        &self,
        req: &AudioSynthRequest,
    ) -> Result<(AudioSynthResult, bool)> {
        let is_new = !self.global_audio_exists(req).await.unwrap_or(false);
        let result = self.get_or_synthesize_audio(req, "batch", "admin").await?;
        Ok((result, is_new))
    }

    /// Devuelve URL + voz activa. Si existe audio, no regenera.
    pub async fn get_or_synthesize_audio(
        &self,
        req: &AudioSynthRequest,
        user_email: &str,
        role: &str,
    ) -> Result<AudioSynthResult> {
        tracing::info!(
            "🎧 Audio request: lang='{}', category='{}', deck='{}', verb='{:?}', text='{}', user='{}', role='{}'",
            req.lang.as_deref().unwrap_or("(none)"),
            req.category,
            req.deck,
            req.verb_name,
            req.text,
            user_email,
            role,
        );

        let role = AuthUseCases::normalize_role(role);
        let is_admin = role == "admin";
        let is_premium = role == "premium";
        let user_segment = if is_admin { None } else { Some(user_path_segment(user_email)) };
        let file_name = self.deterministic_audio_filename(req, user_segment.as_deref());
        let blob_path = format!("{}/{}", self.settings.gcs_audio_prefix, file_name);

        let force_new = req.force_regenerate || req.exclude_voice.is_some();

        if !force_new {
            if let Ok(true) = self.storage_repo.blob_exists(&blob_path).await {
                let voice = self.read_voice_meta(&blob_path).await.unwrap_or_else(|| "Unknown".into());
                tracing::info!("✅ Audio activo encontrado: {} (voz={})", blob_path, voice);
                return Ok(self.build_result(&file_name, &voice));
            }
        } else {
            tracing::info!("🔄 Regeneración forzada (sin caché) para: {}", blob_path);
        }

        let deck_prefix = req.deck.replace(".json", "");
        let verb_slug = self.slugify(&req.verb_name.as_deref().unwrap_or("none"), 40);
        let text_slug = self.slugify(&req.text, 40);
        let lang_suffix = match req.lang.as_deref() {
            Some(l) if !l.is_empty() && l != "en" => format!("_{}", l),
            _ => "".to_string(),
        };
        let skip_legacy = Self::is_non_english_lang(req.lang.as_deref()) || force_new;

        if !force_new {
            if !is_admin {
                let global_file = self.deterministic_audio_filename(req, None);
                let global_path = format!("{}/{}", self.settings.gcs_audio_prefix, global_file);
                if let Ok(true) = self.storage_repo.blob_exists(&global_path).await {
                    let voice = self.read_voice_meta(&global_path).await.unwrap_or_else(|| "Legacy".into());
                    tracing::info!("✅ Audio global fallback: {} (voz={})", global_path, voice);
                    return Ok(self.build_result(&global_file, &voice));
                }

                if !skip_legacy {
                    if let Some(found) = self.find_legacy_audio(req, &deck_prefix, &verb_slug, &text_slug, &lang_suffix).await? {
                        tracing::info!("✅ Audio legacy global: {}", found);
                        let rel = found.strip_prefix(&self.settings.gcs_audio_prefix).unwrap_or(&found).trim_start_matches('/');
                        return Ok(self.build_result(rel, "Legacy"));
                    }
                }
            } else if !skip_legacy {
                if let Some(found) = self.find_legacy_audio(req, &deck_prefix, &verb_slug, &text_slug, &lang_suffix).await? {
                    tracing::info!("✅ Audio legacy: {}", found);
                    let rel = found.strip_prefix(&self.settings.gcs_audio_prefix).unwrap_or(&found).trim_start_matches('/');
                    return Ok(self.build_result(rel, "Legacy"));
                }
            }
        }

        if !is_admin && !is_premium {
            tracing::warn!(
                "🚫 Generación bloqueada: user='{}' role='{}' text='{}'",
                user_email,
                role,
                req.text
            );
            return Err(anyhow::anyhow!("audio_not_found"));
        }

        let voice = self.pick_random_voice(req.exclude_voice.as_deref());
        tracing::info!("✨ Generando audio → {} (voz aleatoria={})", blob_path, voice);

        let audio_bytes = self
            .audio_gen
            .synthesize(&req.text, &voice, req.lang.as_deref())
            .await?;

        self.storage_repo
            .upload_blob(&blob_path, audio_bytes, Self::audio_mime_type())
            .await?;
        self.write_voice_meta(&blob_path, &voice).await?;

        Ok(self.build_result(&file_name, &voice))
    }

    /// Archiva el audio activo (no borra del disco) para permitir otra voz aleatoria.
    pub async fn rotate_audio(&self, req: &AudioSynthRequest, user_email: &str, is_admin: bool) -> Result<Option<String>> {
        let user_segment = if is_admin {
            None
        } else {
            Some(user_path_segment(user_email))
        };
        let file_name = self.deterministic_audio_filename(req, user_segment.as_deref());
        let blob_path = format!("{}/{}", self.settings.gcs_audio_prefix, file_name);

        if self.storage_repo.blob_exists(&blob_path).await.unwrap_or(false) {
            return self.archive_active_blob(&blob_path).await;
        }

        let deck_prefix = req.deck.replace(".json", "");
        let verb_slug = self.slugify(&req.verb_name.as_deref().unwrap_or("none"), 40);
        let text_slug = self.slugify(&req.text, 40);
        let lang_suffix = match req.lang.as_deref() {
            Some(l) if !l.is_empty() && l != "en" => format!("_{}", l),
            _ => "".to_string(),
        };

        if let Some(legacy) = self.find_legacy_audio(req, &deck_prefix, &verb_slug, &text_slug, &lang_suffix).await? {
            tracing::info!("📦 Archivando audio legacy: {}", legacy);
            return self.archive_active_blob(&legacy).await;
        }

        Ok(None)
    }

    async fn archive_active_blob(&self, blob_path: &str) -> Result<Option<String>> {
        let meta_path = Self::meta_blob_path(blob_path);
        let voice = self
            .read_voice_meta(blob_path)
            .await
            .unwrap_or_else(|| "Legacy".into());
        let ts = chrono::Utc::now().timestamp();
        let archive_audio = Self::archive_blob_path(blob_path, &voice, ts);
        let archive_meta = Self::archive_meta_path(blob_path, &voice, ts);

        self.storage_repo.rename_blob(blob_path, &archive_audio).await?;
        if self.storage_repo.blob_exists(&meta_path).await.unwrap_or(false) {
            let _ = self.storage_repo.rename_blob(&meta_path, &archive_meta).await;
        }

        tracing::info!(
            "📦 Audio archivado (sin borrar): {} → {} (voz anterior={})",
            blob_path,
            archive_audio,
            voice
        );
        Ok(Some(voice))
    }

    pub async fn synthesize(&self, text: &str, voice_name: &str, lang: Option<&str>) -> Result<Vec<u8>> {
        self.audio_gen.synthesize(text, voice_name, lang).await
    }

    pub async fn download_blob(&self, blob_path: &str) -> Result<Vec<u8>> {
        self.storage_repo.download_blob(blob_path).await
    }

    fn build_result(&self, file_name: &str, voice: &str) -> AudioSynthResult {
        AudioSynthResult {
            audio_url: format!("/card_audio/{}?v={}", file_name, uuid::Uuid::new_v4()),
            voice_name: voice.to_string(),
        }
    }

    fn pick_random_voice(&self, exclude: Option<&str>) -> String {
        use rand::Rng;
        let mut rng = rand::thread_rng();
        // 50/50 masculino/femenino — la lista original tenía 10F vs 2M.
        let pool: &[&str] = if rng.gen_bool(0.5) {
            GEMINI_MALE_VOICES
        } else {
            GEMINI_FEMALE_VOICES
        };
        let candidates: Vec<&str> = pool
            .iter()
            .copied()
            .filter(|v| exclude.map(|e| !v.eq_ignore_ascii_case(e)).unwrap_or(true))
            .collect();
        if let Some(v) = candidates.choose(&mut rng) {
            return (*v).to_string();
        }
        // Fallback si exclude agotó un pool entero
        GEMINI_VOICE_POOL
            .iter()
            .copied()
            .filter(|v| exclude.map(|e| !v.eq_ignore_ascii_case(e)).unwrap_or(true))
            .collect::<Vec<_>>()
            .choose(&mut rng)
            .copied()
            .unwrap_or("Charon")
            .to_string()
    }

    fn meta_blob_path(audio_blob_path: &str) -> String {
        audio_blob_path.replace(".ogg", ".meta.json")
    }

    fn archive_blob_path(audio_blob_path: &str, voice: &str, ts: i64) -> String {
        audio_blob_path.replace(".ogg", &format!(".archive.{voice}_{ts}.ogg"))
    }

    fn archive_meta_path(audio_blob_path: &str, voice: &str, ts: i64) -> String {
        audio_blob_path.replace(".ogg", &format!(".archive.{voice}_{ts}.meta.json"))
    }

    async fn read_voice_meta(&self, audio_blob_path: &str) -> Option<String> {
        let meta_path = Self::meta_blob_path(audio_blob_path);
        let bytes = self.storage_repo.download_blob(&meta_path).await.ok()?;
        let meta: AudioMeta = serde_json::from_slice(&bytes).ok()?;
        Some(meta.voice)
    }

    async fn write_voice_meta(&self, audio_blob_path: &str, voice: &str) -> Result<()> {
        let meta_path = Self::meta_blob_path(audio_blob_path);
        let meta = AudioMeta {
            voice: voice.to_string(),
        };
        let json = serde_json::to_vec(&meta)?;
        self.storage_repo
            .upload_blob(&meta_path, json, "application/json")
            .await
    }

    async fn find_legacy_audio(
        &self,
        req: &AudioSynthRequest,
        deck_prefix: &str,
        verb_slug: &str,
        text_slug: &str,
        lang_suffix: &str,
    ) -> Result<Option<String>> {
        let legacy_prefix = format!(
            "{}/{}/{}/{}_{}_{}{}",
            self.settings.gcs_audio_prefix,
            req.category,
            deck_prefix,
            deck_prefix,
            verb_slug,
            text_slug,
            lang_suffix
        )
        .replace("//", "/");
        if let Ok(Some(found)) = self.storage_repo.find_blob_by_prefix(&legacy_prefix).await {
            return Ok(Some(found));
        }
        let alt_prefix = format!(
            "{}/{}/{}_{}_{}{}",
            self.settings.gcs_audio_prefix,
            req.category,
            deck_prefix,
            verb_slug,
            text_slug,
            lang_suffix
        )
        .replace("//", "/");
        self.storage_repo.find_blob_by_prefix(&alt_prefix).await
    }

    fn is_non_english_lang(lang: Option<&str>) -> bool {
        lang.map(|l| !l.is_empty() && !l.eq_ignore_ascii_case("en"))
            .unwrap_or(false)
    }

    fn audio_mime_type() -> &'static str {
        "audio/ogg"
    }

    fn slugify(&self, text: &str, max_len: usize) -> String {
        let slug: String = text
            .chars()
            .take(max_len)
            .map(|c| if c.is_alphanumeric() { c.to_ascii_lowercase() } else { '_' })
            .collect();
        let parts: Vec<_> = slug.split('_').filter(|s| !s.is_empty()).collect();
        parts.join("_")
    }

    fn deterministic_audio_filename(&self, req: &AudioSynthRequest, user_segment: Option<&str>) -> String {
        let verb_norm = req.verb_name.as_deref().filter(|s| !s.is_empty()).unwrap_or("none");
        let base_slug = self.slugify(&req.text, 40);
        let deck_prefix = req.deck.replace(".json", "");

        let mut hasher = DefaultHasher::new();
        req.text.hash(&mut hasher);
        if let Some(seg) = user_segment {
            seg.hash(&mut hasher);
        }
        if let Some(lang) = req.lang.as_deref().filter(|s| !s.is_empty()) {
            lang.hash(&mut hasher);
            if lang.eq_ignore_ascii_case("es") || lang.starts_with("es-") {
                SPANISH_TTS_BACKEND.hash(&mut hasher);
            }
        }
        GEMINI_TTS_MODEL.hash(&mut hasher);
        UNIFIED_AUDIO_FORMAT.hash(&mut hasher);
        let hash = hasher.finish();

        let lang_suffix = match req.lang.as_deref() {
            Some(l) if !l.is_empty() && l != "en" => format!("_{}", l),
            _ => "".to_string(),
        };

        let rel = format!(
            "{}/{}/{}_{}_{}{}_{:x}.ogg",
            req.category, deck_prefix, deck_prefix, verb_norm, base_slug, lang_suffix, hash
        );
        match user_segment {
            Some(seg) => format!("users/{}/{}", seg, rel),
            None => rel,
        }
    }
}
