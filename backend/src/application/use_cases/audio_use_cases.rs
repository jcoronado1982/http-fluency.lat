use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::sync::Arc;
use anyhow::Result;

use crate::application::use_cases::auth::AuthUseCases;
use crate::config::Settings;
use crate::domain::repositories::audio::AudioGenerator;
use crate::domain::repositories::storage::StorageRepository;
use crate::domain::repositories::tutor::AITutor;

/// Convierte un email en un segmento de path seguro para URL/filesystem.
/// Ejemplo: "user@example.com" → "user_example_com"
fn user_path_segment(email: &str) -> String {
    email
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '-' { c.to_ascii_lowercase() } else { '_' })
        .collect()
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
}

// ---------------------------------------------------------------------------
// AudioUseCases
// ---------------------------------------------------------------------------

pub struct AudioUseCases {
    storage_repo: Arc<dyn StorageRepository>,
    audio_gen: Arc<dyn AudioGenerator>,
    ai_tutor: Arc<dyn AITutor>,
    settings: Arc<Settings>,
}

impl AudioUseCases {
    pub fn new(
        storage_repo: Arc<dyn StorageRepository>,
        audio_gen: Arc<dyn AudioGenerator>,
        ai_tutor: Arc<dyn AITutor>,
        settings: Arc<Settings>,
    ) -> Self {
        Self {
            storage_repo,
            audio_gen,
            ai_tutor,
            settings,
        }
    }

    /// Devuelve la URL del audio.
    /// - `can_generate=false` (viewer): solo retorna audio existente global, sin generar.
    /// - Admin → capa global; premium → personal primero, fallback a global, genera en personal.
    pub async fn get_or_synthesize_audio(&self, req: &AudioSynthRequest, user_email: &str, role: &str) -> Result<String> {
        tracing::info!(
            "🎧 Solicitud de audio: email='{}', rol='{}', text='{}', tone='{:?}', voice='{}'",
            user_email, role, req.text, req.tone, req.voice_name
        );

        let role = AuthUseCases::normalize_role(role);
        let is_admin = role == "admin";
        let is_premium = role == "premium";
        let user_segment = if is_admin { None } else { Some(user_path_segment(user_email)) };
        let file_name = self.deterministic_audio_filename(req, user_segment.as_deref());
        let blob_path = format!("{}/{}", self.settings.gcs_audio_prefix, file_name);

        // 1. Verificar capa objetivo (personal para users, global para admin)
        if let Ok(true) = self.storage_repo.blob_exists(&blob_path).await {
            tracing::info!("✅ Audio encontrado: {}", blob_path);
            return Ok(format!("/card_audio/{}?v={}", file_name, uuid::Uuid::new_v4()));
        }

        let deck_prefix = req.deck.replace(".json", "");
        let verb_slug = self.slugify(&req.verb_name.as_deref().unwrap_or("none"), 40);
        let text_slug = self.slugify(&req.text, 40);
        let tone_slug = req.tone.as_deref()
            .filter(|s| !s.is_empty())
            .map(|t| format!("_{}", self.slugify(t, 40)))
            .unwrap_or_default();

        // 2. Para usuarios normales: buscar en capa global como fallback (sin generar copia)
        if !is_admin {
            let global_file = self.deterministic_audio_filename(req, None);
            let global_path = format!("{}/{}", self.settings.gcs_audio_prefix, global_file);
            if let Ok(true) = self.storage_repo.blob_exists(&global_path).await {
                tracing::info!("✅ Audio encontrado (global fallback): {}", global_path);
                return Ok(format!("/card_audio/{}?v={}", global_file, uuid::Uuid::new_v4()));
            }

            // Legacy search en capa global
            let legacy_prefix = format!(
                "{}/{}/{}/{}_{}_{}{}", 
                self.settings.gcs_audio_prefix, req.category, deck_prefix, deck_prefix, verb_slug, text_slug, tone_slug
            ).replace("//", "/");
            if let Ok(Some(found)) = self.storage_repo.find_blob_by_prefix(&legacy_prefix).await {
                tracing::info!("✅ Audio legacy global encontrado: {}", found);
                let rel = found.strip_prefix(&self.settings.gcs_audio_prefix).unwrap_or(&found).trim_start_matches('/');
                return Ok(format!("/card_audio/{}?v={}", rel, uuid::Uuid::new_v4()));
            }
            let alt_prefix = format!(
                "{}/{}/{}_{}_{}{}", 
                self.settings.gcs_audio_prefix, req.category, deck_prefix, verb_slug, text_slug, tone_slug
            ).replace("//", "/");
            if let Ok(Some(found)) = self.storage_repo.find_blob_by_prefix(&alt_prefix).await {
                tracing::info!("✅ Audio alt global encontrado: {}", found);
                let rel = found.strip_prefix(&self.settings.gcs_audio_prefix).unwrap_or(&found).trim_start_matches('/');
                return Ok(format!("/card_audio/{}?v={}", rel, uuid::Uuid::new_v4()));
            }
        } else {
            // Admin: legacy search en capa global
            let legacy_prefix = format!(
                "{}/{}/{}/{}_{}_{}{}", 
                self.settings.gcs_audio_prefix, req.category, deck_prefix, deck_prefix, verb_slug, text_slug, tone_slug
            ).replace("//", "/");
            tracing::info!("🔍 Legacy audio search: {}", legacy_prefix);
            if let Ok(Some(found)) = self.storage_repo.find_blob_by_prefix(&legacy_prefix).await {
                tracing::info!("✅ Legacy audio found: {}", found);
                let rel = found.strip_prefix(&self.settings.gcs_audio_prefix).unwrap_or(&found).trim_start_matches('/');
                return Ok(format!("/card_audio/{}?v={}", rel, uuid::Uuid::new_v4()));
            }
            let alt_prefix = format!(
                "{}/{}/{}_{}_{}{}", 
                self.settings.gcs_audio_prefix, req.category, deck_prefix, verb_slug, text_slug, tone_slug
            ).replace("//", "/");
            if let Ok(Some(found)) = self.storage_repo.find_blob_by_prefix(&alt_prefix).await {
                tracing::info!("✅ Audio found (alt search): {}", found);
                let rel = found.strip_prefix(&self.settings.gcs_audio_prefix).unwrap_or(&found).trim_start_matches('/');
                return Ok(format!("/card_audio/{}?v={}", rel, uuid::Uuid::new_v4()));
            }
        }

        // 3. Audio no encontrado en ninguna capa.
        // Control extra de seguridad: si no es premium ni admin, no puede generar audio por IA (TTS)
        if !is_admin && !is_premium {
            tracing::warn!("🚫 Intento de generación de audio por IA bloqueado: el usuario '{}' con rol '{}' no está autorizado (se requiere admin o premium) para el texto '{}'", user_email, role, req.text);
            return Err(anyhow::anyhow!("audio_not_found"));
        }

        tracing::info!("✨ Generando audio → {}", blob_path);
        let audio_bytes = if let Some(tone) = req.tone.as_deref().filter(|t| !t.is_empty()) {
            match self.ai_tutor.refine_audio_ssml(&req.text, tone).await {
                Ok(ssml) => self.audio_gen.synthesize_ssml(&ssml, &req.voice_name).await?,
                Err(e) => {
                    tracing::warn!("⚠️ SSML refinement failed: {}. Using plain text.", e);
                    self.audio_gen.synthesize(&req.text, &req.voice_name).await?
                }
            }
        } else {
            self.audio_gen.synthesize(&req.text, &req.voice_name).await?
        };

        self.storage_repo.upload_blob(&blob_path, audio_bytes, "audio/ogg").await?;
        Ok(format!("/card_audio/{}?v={}", file_name, uuid::Uuid::new_v4()))
    }

    /// Borra audio. Admin borra capa global; usuario normal borra solo su capa personal.
    pub async fn delete_audio(&self, req: &AudioSynthRequest, user_email: &str, is_admin: bool) -> Result<bool> {
        if !is_admin {
            let user_segment = user_path_segment(user_email);
            let file_name = self.deterministic_audio_filename(req, Some(&user_segment));
            let blob_path = format!("{}/{}", self.settings.gcs_audio_prefix, file_name);
            if let Ok(true) = self.storage_repo.blob_exists(&blob_path).await {
                self.storage_repo.delete_blob(&blob_path).await?;
                tracing::info!("✅ Audio personal eliminado: {}", blob_path);
                return Ok(true);
            }
            return Ok(false);
        }

        // Admin: eliminar de capa global (comportamiento original)
        let deck_prefix = req.deck.replace(".json", "");
        let verb_slug = self.slugify(req.verb_name.as_deref().unwrap_or("none"), 40);
        let text_slug = self.slugify(&req.text, 40);
        let tone_slug = req.tone.as_deref()
            .filter(|s| !s.is_empty())
            .map(|t| format!("_{}", self.slugify(t, 40)))
            .unwrap_or_default();

        let file_name = self.deterministic_audio_filename(req, None);
        let blob_path = format!("{}/{}", self.settings.gcs_audio_prefix, file_name);
        let mut deleted_any = false;

        if let Ok(true) = self.storage_repo.blob_exists(&blob_path).await {
            if self.storage_repo.delete_blob(&blob_path).await.is_ok() {
                tracing::info!("✅ Global audio deleted: {}", blob_path);
                deleted_any = true;
            }
        }

        let legacy_prefix = format!(
            "{}/{}/{}/{}_{}_{}{}", 
            self.settings.gcs_audio_prefix, req.category, deck_prefix, deck_prefix, verb_slug, text_slug, tone_slug
        ).replace("//", "/");
        if let Ok(Some(found)) = self.storage_repo.find_blob_by_prefix(&legacy_prefix).await {
            if self.storage_repo.delete_blob(&found).await.is_ok() {
                tracing::info!("✅ Legacy audio deleted: {}", found);
                deleted_any = true;
            }
        }

        Ok(deleted_any)
    }

    /// Legacy / simple synthesis method if needed.
    pub async fn synthesize(&self, text: &str, voice_name: &str) -> Result<Vec<u8>> {
        self.audio_gen.synthesize(text, voice_name).await
    }

    /// Legacy / simple synthesis with SSML method if needed.
    pub async fn synthesize_ssml(&self, ssml: &str, voice_name: &str) -> Result<Vec<u8>> {
        self.audio_gen.synthesize_ssml(ssml, voice_name).await
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

    /// Genera el nombre de archivo determinista para audio.
    /// Si se pasa `user_segment`, el hash incluye al usuario y el path lleva el prefijo `users/{segment}/`.
    fn deterministic_audio_filename(&self, req: &AudioSynthRequest, user_segment: Option<&str>) -> String {
        let verb_norm = req.verb_name.as_deref().filter(|s| !s.is_empty()).unwrap_or("none");
        let base_slug = self.slugify(&req.text, 40);
        let deck_prefix = req.deck.replace(".json", "");

        let mut hasher = DefaultHasher::new();
        req.text.hash(&mut hasher);
        req.voice_name.hash(&mut hasher);
        if let Some(seg) = user_segment {
            seg.hash(&mut hasher);
        }
        if let Some(tone) = req.tone.as_deref().filter(|s| !s.is_empty()) {
            tone.hash(&mut hasher);
        }
        let hash = hasher.finish();

        let rel = format!("{}/{}/{}_{}_{}_{:x}.ogg", req.category, deck_prefix, deck_prefix, verb_norm, base_slug, hash);
        match user_segment {
            Some(seg) => format!("users/{}/{}", seg, rel),
            None      => rel,
        }
    }
}
