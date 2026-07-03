use anyhow::Result;
use fluency_core::ports::image::ImageGenerator;
use fluency_core::ports::image_compressor::ImageCompressor;
use fluency_core::ports::storage::StorageRepository;
use fluency_core::ports::tutor::AITutor;
use std::sync::Arc;

use crate::{
    is_landing_demo_namespace, safe_deck_prefix, safe_form_suffix, safe_storage_segment,
    FlashcardsConfig,
};

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

fn normalize_role(role: &str) -> String {
    role.trim().to_ascii_lowercase()
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
    /// Demo landing: texto extra del usuario (complemento visual, no reemplaza el ejemplo).
    pub scene_complement: Option<String>,
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
    landing_demo_image_gen: Arc<dyn ImageGenerator>,
    image_compressor: Arc<dyn ImageCompressor>,
    ai_tutor: Arc<dyn AITutor>,
    config: Arc<FlashcardsConfig>,
}

impl ImageUseCases {
    pub fn new(
        storage_repo: Arc<dyn StorageRepository>,
        image_gen: Arc<dyn ImageGenerator>,
        landing_demo_image_gen: Arc<dyn ImageGenerator>,
        image_compressor: Arc<dyn ImageCompressor>,
        ai_tutor: Arc<dyn AITutor>,
        config: Arc<FlashcardsConfig>,
    ) -> Self {
        Self {
            storage_repo,
            image_gen,
            landing_demo_image_gen,
            image_compressor,
            ai_tutor,
            config,
        }
    }

    async fn versioned_image_url(&self, file_name: &str, blob_path: &str) -> String {
        match self.storage_repo.blob_version(blob_path).await {
            Ok(Some(version)) if !version.is_empty() => {
                format!("/card_images/{}?v={}", file_name, version)
            }
            _ => format!("/card_images/{}", file_name),
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

        let role = normalize_role(role);
        let is_admin = role == "admin";
        let is_premium = role == "premium";
        let is_demo = is_landing_demo_namespace(&req.category);

        // Premium/admin en app; invitados solo en namespace landing-demo.
        if !is_admin && !is_premium && !is_demo {
            tracing::warn!("🚫 Intento de generación de imagen por IA bloqueado: el usuario '{}' con rol '{}' no está autorizado.", user_email, role);
            return Err(anyhow::anyhow!(
                "No autorizado para generar imágenes por IA (requiere plan Premium)"
            ));
        }

        let category = safe_storage_segment(&req.category, "category")?;
        let deck_prefix = safe_deck_prefix(&req.deck)?;
        let form_suffix = safe_form_suffix(req.form.as_deref())?;
        let user_segment = if is_admin || is_demo {
            None
        } else {
            Some(user_path_segment(user_email))
        };

        let base_pattern = match &user_segment {
            Some(seg) => format!(
                "users/{}/{}/{}/{}_card_{}_def{}{}",
                seg, category, deck_prefix, deck_prefix, req.index, req.def_index, form_suffix
            ),
            None => format!(
                "{}/{}/{}_card_{}_def{}{}",
                category, deck_prefix, deck_prefix, req.index, req.def_index, form_suffix
            ),
        };

        if !req.force_generation {
            let avif_path = format!("{}/{}.avif", self.config.gcs_images_prefix, base_pattern);
            if let Ok(true) = self.storage_repo.blob_exists(&avif_path).await {
                return Ok((
                    self.versioned_image_url(&format!("{}.avif", base_pattern), &avif_path)
                        .await,
                    false,
                ));
            }

            // Para usuarios normales: fallback a capa global antes de generar
            if !is_admin {
                let global_base = format!(
                    "{}/{}/{}_card_{}_def{}{}",
                    category, deck_prefix, deck_prefix, req.index, req.def_index, form_suffix
                );
                let global_avif = format!("{}/{}.avif", self.config.gcs_images_prefix, global_base);
                if let Ok(true) = self.storage_repo.blob_exists(&global_avif).await {
                    return Ok((
                        self.versioned_image_url(&format!("{}.avif", global_base), &global_avif)
                            .await,
                        false,
                    ));
                }
            }

            // v2/v3 sin imagen propia → usar v1 antes de generar (app interna; demo landing: cada tiempo aparte)
            if !form_suffix.is_empty() && !is_demo {
                if let Some(seg) = &user_segment {
                    let v1_personal = format!(
                        "users/{}/{}/{}/{}_card_{}_def{}",
                        seg, category, deck_prefix, deck_prefix, req.index, req.def_index
                    );
                    let v1_personal_avif =
                        format!("{}/{}.avif", self.config.gcs_images_prefix, v1_personal);
                    if let Ok(true) = self.storage_repo.blob_exists(&v1_personal_avif).await {
                        tracing::info!(
                            "↩️ v2/v3 sin imagen propia, reutilizando v1 personal: {}",
                            v1_personal_avif
                        );
                        return Ok((
                            self.versioned_image_url(
                                &format!("{}.avif", v1_personal),
                                &v1_personal_avif,
                            )
                            .await,
                            false,
                        ));
                    }
                }
                let v1_global = format!(
                    "{}/{}/{}_card_{}_def{}",
                    category, deck_prefix, deck_prefix, req.index, req.def_index
                );
                let v1_global_avif =
                    format!("{}/{}.avif", self.config.gcs_images_prefix, v1_global);
                if let Ok(true) = self.storage_repo.blob_exists(&v1_global_avif).await {
                    tracing::info!(
                        "↩️ v2/v3 sin imagen propia, reutilizando v1 global: {}",
                        v1_global_avif
                    );
                    return Ok((
                        self.versioned_image_url(&format!("{}.avif", v1_global), &v1_global_avif)
                            .await,
                        false,
                    ));
                }
            }
        }

        if !self.config.gemini_api_enabled {
            return Err(anyhow::anyhow!(
                "La generación de imagen por IA está deshabilitada."
            ));
        }

        let file_name = format!("{}.avif", base_pattern);
        let blob_path = format!("{}/{}", self.config.gcs_images_prefix, file_name);
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

        let visual_description = match if is_demo {
            self.ai_tutor.improve_prompt_for_landing_demo_image(
                &req.prompt,
                &category,
                req.meaning.as_deref(),
                req.usage_example.as_deref(),
                req.scene_complement.as_deref(),
            )
        } else {
            self.ai_tutor.improve_prompt_for_image(
                &req.prompt,
                &category,
                req.meaning.as_deref(),
                req.usage_example.as_deref(),
            )
        }
        .await
        {
            Ok(desc) => {
                tracing::info!(
                    trace_id = %trace_short,
                    gemini_output = %desc,
                    landing_demo = is_demo,
                    "img-gen:gemini-ok"
                );
                desc
            }
            Err(e) => {
                tracing::warn!(
                    trace_id = %trace_short,
                    error = %e,
                    fallback_phrase = %req.prompt,
                    landing_demo = is_demo,
                    "img-gen:gemini-fallback"
                );
                if is_demo {
                    let example = req.usage_example.as_deref().unwrap_or(&req.prompt);
                    crate::landing_demo_image_prompt::fallback_demo_visual_description(
                        example,
                        req.scene_complement.as_deref(),
                    )
                } else {
                    req.prompt.clone()
                }
            }
        };

        let final_prompt = if is_demo {
            crate::landing_demo_image_prompt::build_demo_image_prompt(
                &visual_description,
                req.scene_complement.as_deref(),
            )
        } else {
            format!(
                "Candid photorealistic DSLR photograph, 512x512, natural indoor lighting, authentic textures: {}. \
                A realistic, unposed, everyday life scene. No text, no words, no letters, no captions, no signage, no watermarks.",
                visual_description
            )
        };

        tracing::info!(
            trace_id = %trace_short,
            comfy_prompt = %final_prompt,
            landing_demo = is_demo,
            image_model = if is_demo { crate::landing_demo_image_prompt::GEMINI_IMAGE_MODEL } else { "comfyui/flux" },
            "img-gen:model-request"
        );

        let image_generator = if is_demo {
            &self.landing_demo_image_gen
        } else {
            &self.image_gen
        };

        let raw_bytes = image_generator.generate(&final_prompt).await.map_err(|e| {
            tracing::error!(trace_id = %trace_short, error = %e, "img-gen:model-failed");
            anyhow::anyhow!("[trace={trace_short}] image model: {e}")
        })?;

        tracing::info!(
            trace_id = %trace_short,
            raw_bytes = raw_bytes.len(),
            landing_demo = is_demo,
            "img-gen:model-ok"
        );

        // Compresión a AVIF 512×512 (misma calidad que Flux)
        let avif_quality = if is_demo {
            crate::landing_demo_image_prompt::CARD_IMAGE_AVIF_QUALITY
        } else {
            80
        };
        let compressed_bytes = self
            .image_compressor
            .compress_to_avif(&raw_bytes, avif_quality)
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
        Ok((self.versioned_image_url(&file_name, &blob_path).await, true))
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
        let category = safe_storage_segment(category, "category")?;
        let deck_prefix = safe_deck_prefix(deck)?;
        let form_suffix = safe_form_suffix(form)?;

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
            let blob_path = format!("{}/{}{}", self.config.gcs_images_prefix, base_pattern, ext);
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
        let category = safe_storage_segment(category, "category")?;
        let deck_prefix = safe_deck_prefix(deck)?;
        let form_suffix = safe_form_suffix(form)?;
        let images_prefix = &self.config.gcs_images_prefix;

        let role = normalize_role(role);
        let is_demo = is_landing_demo_namespace(&category);

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
                return Ok(Some(
                    self.versioned_image_url(&format!("{}.avif", personal_base), &personal_avif)
                        .await,
                ));
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
            return Ok(Some(
                self.versioned_image_url(&format!("{}.avif", global_base), &global_avif)
                    .await,
            ));
        }

        // v2/v3 sin imagen propia → fallback a v1 (app interna; demo landing: cada tiempo aparte)
        if !form_suffix.is_empty() && !is_demo {
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
                    return Ok(Some(
                        self.versioned_image_url(
                            &format!("{}.avif", personal_base),
                            &personal_v1_path,
                        )
                        .await,
                    ));
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
                return Ok(Some(
                    self.versioned_image_url(&format!("{}.avif", global_v1_base), &global_v1_path)
                        .await,
                ));
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
        let category = safe_storage_segment(&req.category, "category")?;
        let deck_prefix = safe_deck_prefix(&req.deck)?;
        let form_suffix = safe_form_suffix(req.form.as_deref())?;

        let extension = std::path::Path::new(&req.file_name)
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("png");
        let extension = match extension.to_ascii_lowercase().as_str() {
            "avif" | "jpg" | "jpeg" | "png" | "webp" => extension.to_ascii_lowercase(),
            _ => anyhow::bail!("Extensión de imagen no permitida"),
        };

        let final_name = if is_admin {
            format!(
                "{}/{}/{}_card_{}_def{}{}.{}",
                category,
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
                category,
                deck_prefix,
                deck_prefix,
                req.card_index,
                req.def_index,
                form_suffix,
                extension
            )
        };
        let blob_path = format!("{}/{}", self.config.gcs_images_prefix, final_name);

        tracing::info!("📤 Uploading manual image to: {}", blob_path);
        self.storage_repo
            .upload_blob(&blob_path, req.file_data, &req.content_type)
            .await?;

        Ok(self.versioned_image_url(&final_name, &blob_path).await)
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
}
