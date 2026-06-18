use anyhow::Result;
use std::sync::Arc;

use crate::application::use_cases::auth::AuthUseCases;
use crate::config::Settings;
use crate::domain::repositories::image::ImageGenerator;
use crate::domain::repositories::image_compressor::ImageCompressor;
use crate::domain::repositories::storage::StorageRepository;
use crate::domain::repositories::tutor::AITutor;

/// Convierte un email en un segmento de path seguro para URL/filesystem.
/// Ejemplo: "user@example.com" → "user_example_com"
fn user_path_segment(email: &str) -> String {
    email
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '-' {
                c.to_ascii_lowercase()
            } else {
                '_'
            }
        })
        .collect()
}

// ---------------------------------------------------------------------------
// Application-layer DTOs (no serde, no HTTP concerns)
// ---------------------------------------------------------------------------

pub struct ImageGenRequest {
    pub category: String,
    pub deck: String,
    pub index: usize,
    pub def_index: usize,
    pub prompt: String,
    pub meaning: Option<String>,
    pub usage_example: Option<String>,
    pub force_generation: bool,
    pub form: Option<String>,
}

pub struct UploadImageRequest {
    pub category: String,
    pub deck: String,
    pub card_index: usize,
    pub def_index: usize,
    pub form: Option<String>,
    pub file_data: Vec<u8>,
    pub file_name: String,
    pub content_type: String,
}

// ---------------------------------------------------------------------------
// ImageUseCases
// ---------------------------------------------------------------------------

pub struct ImageUseCases {
    storage_repo: Arc<dyn StorageRepository>,
    image_gen: Arc<dyn ImageGenerator>,
    image_compressor: Arc<dyn ImageCompressor>,
    ai_tutor: Arc<dyn AITutor>,
    settings: Arc<Settings>,
}

impl ImageUseCases {
    pub fn new(
        storage_repo: Arc<dyn StorageRepository>,
        image_gen: Arc<dyn ImageGenerator>,
        image_compressor: Arc<dyn ImageCompressor>,
        ai_tutor: Arc<dyn AITutor>,
        settings: Arc<Settings>,
    ) -> Self {
        Self {
            storage_repo,
            image_gen,
            image_compressor,
            ai_tutor,
            settings,
        }
    }

    /// Devuelve (url, is_nueva), generando si no existe.
    /// - Admin → capa global; usuario normal → personal primero, fallback a global, genera en personal.
    pub async fn get_or_generate_image(
        &self,
        req: &ImageGenRequest,
        user_email: &str,
        role: &str,
    ) -> Result<(String, bool)> {
        tracing::info!(
            "🖼️ Solicitud de imagen: email='{}', rol='{}', deck='{}', index='{}', prompt='{}'",
            user_email,
            role,
            req.deck,
            req.index,
            req.prompt
        );

        let role = AuthUseCases::normalize_role(role);
        let is_admin = role == "admin";
        let is_premium = role == "premium";

        // Control extra de seguridad: solo premium o admin pueden generar imágenes con IA
        if !is_admin && !is_premium {
            tracing::warn!("🚫 Intento de generación de imagen por IA bloqueado: el usuario '{}' con rol '{}' no está autorizado.", user_email, role);
            return Err(anyhow::anyhow!(
                "No autorizado para generar imágenes por IA (requiere plan Premium)"
            ));
        }

        let deck_prefix = req.deck.replace(".json", "");
        let form_suffix = self.form_suffix(req.form.as_deref());
        let user_segment = if is_admin {
            None
        } else {
            Some(user_path_segment(user_email))
        };

        let base_pattern = match &user_segment {
            Some(seg) => format!(
                "users/{}/{}/{}/{}_card_{}_def{}{}",
                seg, req.category, deck_prefix, deck_prefix, req.index, req.def_index, form_suffix
            ),
            None => format!(
                "{}/{}/{}_card_{}_def{}{}",
                req.category, deck_prefix, deck_prefix, req.index, req.def_index, form_suffix
            ),
        };

        if !req.force_generation {
            let avif_path = format!("{}/{}.avif", self.settings.gcs_images_prefix, base_pattern);
            if let Ok(true) = self.storage_repo.blob_exists(&avif_path).await {
                return Ok((
                    format!(
                        "/card_images/{}.avif?v={}",
                        base_pattern,
                        uuid::Uuid::new_v4()
                    ),
                    false,
                ));
            }

            // Para usuarios normales: fallback a capa global antes de generar
            if !is_admin {
                let global_base = format!(
                    "{}/{}/{}_card_{}_def{}{}",
                    req.category, deck_prefix, deck_prefix, req.index, req.def_index, form_suffix
                );
                let global_avif =
                    format!("{}/{}.avif", self.settings.gcs_images_prefix, global_base);
                if let Ok(true) = self.storage_repo.blob_exists(&global_avif).await {
                    return Ok((
                        format!(
                            "/card_images/{}.avif?v={}",
                            global_base,
                            uuid::Uuid::new_v4()
                        ),
                        false,
                    ));
                }
            }

            // Bug 5: v2/v3 sin imagen propia → usar v1 antes de generar una nueva con IA
            if !form_suffix.is_empty() {
                if let Some(seg) = &user_segment {
                    let v1_personal = format!(
                        "users/{}/{}/{}/{}_card_{}_def{}",
                        seg, req.category, deck_prefix, deck_prefix, req.index, req.def_index
                    );
                    let v1_personal_avif =
                        format!("{}/{}.avif", self.settings.gcs_images_prefix, v1_personal);
                    if let Ok(true) = self.storage_repo.blob_exists(&v1_personal_avif).await {
                        tracing::info!(
                            "↩️ v2/v3 sin imagen propia, reutilizando v1 personal: {}",
                            v1_personal_avif
                        );
                        return Ok((
                            format!(
                                "/card_images/{}.avif?v={}",
                                v1_personal,
                                uuid::Uuid::new_v4()
                            ),
                            false,
                        ));
                    }
                }
                let v1_global = format!(
                    "{}/{}/{}_card_{}_def{}",
                    req.category, deck_prefix, deck_prefix, req.index, req.def_index
                );
                let v1_global_avif =
                    format!("{}/{}.avif", self.settings.gcs_images_prefix, v1_global);
                if let Ok(true) = self.storage_repo.blob_exists(&v1_global_avif).await {
                    tracing::info!(
                        "↩️ v2/v3 sin imagen propia, reutilizando v1 global: {}",
                        v1_global_avif
                    );
                    return Ok((
                        format!("/card_images/{}.avif?v={}", v1_global, uuid::Uuid::new_v4()),
                        false,
                    ));
                }
            }
        }

        if self.settings.gemini_api_key.is_none() {
            return Err(anyhow::anyhow!(
                "La generación de imagen por IA está deshabilitada."
            ));
        }

        let file_name = format!("{}.avif", base_pattern);
        let blob_path = format!("{}/{}", self.settings.gcs_images_prefix, file_name);
        let trace_id = uuid::Uuid::new_v4().to_string();
        let trace_short = &trace_id[..8];

        tracing::info!(
            trace_id = %trace_short,
            category = %req.category,
            deck = %req.deck,
            card_index = req.index,
            def_index = req.def_index,
            force_generation = req.force_generation,
            gemini_input_phrase = %req.prompt,
            gemini_input_meaning = ?req.meaning,
            gemini_input_example = ?req.usage_example,
            blob_path = %blob_path,
            "img-gen:start"
        );

        let visual_description = match self
            .ai_tutor
            .improve_prompt_for_image(
                &req.prompt,
                &req.category,
                req.meaning.as_deref(),
                req.usage_example.as_deref(),
            )
            .await
        {
            Ok(desc) => {
                tracing::info!(
                    trace_id = %trace_short,
                    gemini_output = %desc,
                    "img-gen:gemini-ok"
                );
                desc
            }
            Err(e) => {
                tracing::warn!(
                    trace_id = %trace_short,
                    error = %e,
                    fallback_phrase = %req.prompt,
                    "img-gen:gemini-fallback"
                );
                req.prompt.clone()
            }
        };

        let final_prompt = format!(
            "Candid photorealistic DSLR photograph, 512x512, natural indoor lighting, authentic textures: {}. \
            A realistic, unposed, everyday life scene. No text, no words, no letters, no captions, no signage, no watermarks.",
            visual_description
        );

        tracing::info!(
            trace_id = %trace_short,
            comfy_prompt = %final_prompt,
            "img-gen:comfy-request"
        );

        let raw_bytes = self.image_gen.generate(&final_prompt).await.map_err(|e| {
            tracing::error!(trace_id = %trace_short, error = %e, "img-gen:comfy-failed");
            anyhow::anyhow!("[trace={trace_short}] ComfyUI: {e}")
        })?;

        tracing::info!(
            trace_id = %trace_short,
            raw_bytes = raw_bytes.len(),
            "img-gen:comfy-ok"
        );

        // Compresión a AVIF para optimización de almacenamiento en Oracle
        let compressed_bytes = self
            .image_compressor
            .compress_to_avif(&raw_bytes, 80) // 80 es un buen balance calidad/peso
            .map_err(|e| {
                tracing::error!(trace_id = %trace_short, error = %e, "img-gen:compression-failed");
                anyhow::anyhow!("[trace={trace_short}] compression: {e}")
            })?;

        tracing::info!(
            trace_id = %trace_short,
            compressed_bytes = compressed_bytes.len(),
            "img-gen:compression-ok"
        );

        self.storage_repo.upload_blob(&blob_path, compressed_bytes, "image/avif").await.map_err(|e| {
            tracing::error!(trace_id = %trace_short, error = %e, blob_path = %blob_path, "img-gen:upload-failed");
            anyhow::anyhow!("[trace={trace_short}] upload: {e}")
        })?;

        tracing::info!(
            trace_id = %trace_short,
            blob_path = %blob_path,
            "img-gen:done"
        );
        Ok((
            format!("/card_images/{}?v={}", file_name, uuid::Uuid::new_v4()),
            true,
        ))
    }

    /// Borra imágenes. Admin borra capa global; usuario normal borra solo su capa personal.
    pub async fn delete_image(
        &self,
        category: &str,
        deck: &str,
        index: usize,
        def_index: usize,
        form: Option<&str>,
        user_email: &str,
        is_admin: bool,
    ) -> Result<bool> {
        let deck_prefix = deck.replace(".json", "");
        let form_suffix = self.form_suffix(form);

        let base_pattern = if is_admin {
            format!(
                "{}/{}/{}_card_{}_def{}{}",
                category, deck_prefix, deck_prefix, index, def_index, form_suffix
            )
        } else {
            let seg = user_path_segment(user_email);
            format!(
                "users/{}/{}/{}/{}_card_{}_def{}{}",
                seg, category, deck_prefix, deck_prefix, index, def_index, form_suffix
            )
        };

        let mut deleted_any = false;
        for ext in [".avif", ".jpg", ".png", ".jpeg"] {
            let blob_path = format!(
                "{}/{}{}",
                self.settings.gcs_images_prefix, base_pattern, ext
            );
            if let Ok(true) = self.storage_repo.blob_exists(&blob_path).await {
                if self.storage_repo.delete_blob(&blob_path).await.is_ok() {
                    tracing::info!("✅ Deleted: {}", blob_path);
                    deleted_any = true;
                }
            }
        }

        Ok(deleted_any)
    }

    /// Resuelve la mejor ruta de imagen sin generar.
    /// - viewer → capa global (predeterminada)
    /// - premium → capa personal primero, fallback a global
    /// - admin → capa global (las subidas de admin son globales)
    pub async fn resolve_image_path(
        &self,
        category: &str,
        deck: &str,
        index: usize,
        def_index: usize,
        form: Option<&str>,
        user_email: &str,
        role: &str,
    ) -> Result<Option<String>> {
        let deck_prefix = deck.replace(".json", "");
        let form_suffix = self.form_suffix(form);
        let images_prefix = &self.settings.gcs_images_prefix;

        let role = AuthUseCases::normalize_role(role);

        tracing::info!(
            "🔍 resolve_image: category={} deck={} index={} def={} form={:?} role={}",
            category,
            deck,
            index,
            def_index,
            form,
            role
        );

        // Premium (no admin): capa personal primero
        if role == "premium" {
            let seg = user_path_segment(user_email);
            let personal_base = format!(
                "users/{}/{}/{}/{}_card_{}_def{}{}",
                seg, category, deck_prefix, deck_prefix, index, def_index, form_suffix
            );
            let personal_avif = format!("{}/{}.avif", images_prefix, personal_base);
            tracing::info!("  → check personal: {}", personal_avif);
            if self.storage_repo.blob_exists(&personal_avif).await? {
                tracing::info!("  ✔️ found personal: {}", personal_avif);
                return Ok(Some(format!("/card_images/{}.avif", personal_base)));
            }
        }

        // Capa global predeterminada (todos los roles)
        let global_base = format!(
            "{}/{}/{}_card_{}_def{}{}",
            category, deck_prefix, deck_prefix, index, def_index, form_suffix
        );
        let global_avif = format!("{}/{}.avif", images_prefix, global_base);
        tracing::info!("  → check global: {}", global_avif);
        if self.storage_repo.blob_exists(&global_avif).await? {
            tracing::info!("  ✔️ found global: {}", global_avif);
            return Ok(Some(format!("/card_images/{}.avif", global_base)));
        }

        // v2/v3 sin imagen propia → fallback a v1 (misma tarjeta/def)
        if !form_suffix.is_empty() {
            if role == "premium" {
                let seg = user_path_segment(user_email);
                let personal_base = format!(
                    "users/{}/{}/{}/{}_card_{}_def{}",
                    seg, category, deck_prefix, deck_prefix, index, def_index
                );
                let personal_v1_path = format!("{}/{}.avif", images_prefix, personal_base);
                tracing::info!("  → check personal v1-fallback: {}", personal_v1_path);
                if self.storage_repo.blob_exists(&personal_v1_path).await? {
                    tracing::info!("  ✔️ found personal v1-fallback: {}", personal_v1_path);
                    return Ok(Some(format!("/card_images/{}.avif", personal_base)));
                }
            }

            let global_v1_base = format!(
                "{}/{}/{}_card_{}_def{}",
                category, deck_prefix, deck_prefix, index, def_index
            );
            let global_v1_path = format!("{}/{}.avif", images_prefix, global_v1_base);
            tracing::info!("  → check global v1-fallback: {}", global_v1_path);
            if self.storage_repo.blob_exists(&global_v1_path).await? {
                tracing::info!("  ✔️ found global v1-fallback: {}", global_v1_path);
                return Ok(Some(format!("/card_images/{}.avif", global_v1_base)));
            }
        }

        tracing::info!(
            "  ❌ no image found for {}/{}_card_{}_def{}{}",
            category,
            deck_prefix,
            index,
            def_index,
            form_suffix
        );
        Ok(None)
    }

    /// Downloads raw bytes for any blob (used by asset-serving handlers).
    pub async fn download_blob(&self, blob_path: &str) -> Result<Vec<u8>> {
        self.storage_repo.download_blob(blob_path).await
    }

    /// Sube una imagen manualmente. Admin → capa global; usuario normal → capa personal.
    pub async fn upload_image(
        &self,
        req: UploadImageRequest,
        user_email: &str,
        is_admin: bool,
    ) -> Result<String> {
        let deck_prefix = req.deck.replace(".json", "");
        let form_suffix = self.form_suffix(req.form.as_deref());

        let extension = std::path::Path::new(&req.file_name)
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("png");

        let final_name = if is_admin {
            format!(
                "{}/{}/{}_card_{}_def{}{}.{}",
                req.category,
                deck_prefix,
                deck_prefix,
                req.card_index,
                req.def_index,
                form_suffix,
                extension
            )
        } else {
            let seg = user_path_segment(user_email);
            format!(
                "users/{}/{}/{}/{}_card_{}_def{}{}.{}",
                seg,
                req.category,
                deck_prefix,
                deck_prefix,
                req.card_index,
                req.def_index,
                form_suffix,
                extension
            )
        };
        let blob_path = format!("{}/{}", self.settings.gcs_images_prefix, final_name);

        tracing::info!("📤 Uploading manual image to: {}", blob_path);
        self.storage_repo
            .upload_blob(&blob_path, req.file_data, &req.content_type)
            .await?;

        Ok(format!(
            "/card_images/{}?v={}",
            final_name,
            uuid::Uuid::new_v4()
        ))
    }

    #[allow(dead_code)]
    fn slugify(&self, text: &str, max_len: usize) -> String {
        let slug: String = text
            .chars()
            .take(max_len)
            .map(|c| {
                if c.is_alphanumeric() {
                    c.to_ascii_lowercase()
                } else {
                    '_'
                }
            })
            .collect();
        let parts: Vec<_> = slug.split('_').filter(|s| !s.is_empty()).collect();
        parts.join("_")
    }

    fn form_suffix(&self, form: Option<&str>) -> String {
        match form {
            Some("v1") | None | Some("") => String::new(),
            Some(f) => format!("_{}", f),
        }
    }
}
