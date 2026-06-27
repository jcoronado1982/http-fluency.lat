use anyhow::Result;
use dashmap::DashMap;
use fluency_core::domain::models::story::{ProgressResponse, ProgressUpdate, StoryScreen};
use fluency_core::ports::db_repository::PronounPracticeRepository;
use fluency_core::ports::image::ImageGenerator;
use fluency_core::ports::image_compressor::ImageCompressor;
use fluency_core::ports::storage::StorageRepository;
use fluency_core::ports::tutor::AITutor;
use serde_json::json;
use std::sync::Arc;
use tokio::sync::broadcast;
use tracing::{error, info};

pub struct StoryUseCases {
    db_repo: Arc<dyn PronounPracticeRepository>,
    image_gen: Option<Arc<dyn ImageGenerator>>,
    image_compressor: Option<Arc<dyn ImageCompressor>>,
    ai_tutor: Option<Arc<dyn AITutor>>,
    storage_repo: Option<Arc<dyn StorageRepository>>,
    notification_sender: Option<broadcast::Sender<String>>,
    gcs_prefix: String,
    public_base_url: String,
    active_prefetches: Arc<DashMap<i32, bool>>,
}

impl StoryUseCases {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        db_repo: Arc<dyn PronounPracticeRepository>,
        image_gen: Option<Arc<dyn ImageGenerator>>,
        image_compressor: Option<Arc<dyn ImageCompressor>>,
        ai_tutor: Option<Arc<dyn AITutor>>,
        storage_repo: Option<Arc<dyn StorageRepository>>,
        notification_sender: Option<broadcast::Sender<String>>,
        gcs_prefix: String,
        public_base_url: String,
    ) -> Self {
        Self {
            db_repo,
            image_gen,
            image_compressor,
            ai_tutor,
            storage_repo,
            notification_sender,
            gcs_prefix,
            public_base_url,
            active_prefetches: Arc::new(DashMap::new()),
        }
    }

    pub async fn get_progress(&self, user_id: &str, story_id: i32) -> Result<ProgressResponse> {
        let progress = match self.db_repo.get_progress(user_id, story_id).await? {
            Some(p) => p,
            None => {
                let first_ep_id = self.db_repo.get_first_episode_id(story_id).await?;
                self.db_repo
                    .create_progress(user_id, story_id, first_ep_id)
                    .await?
            }
        };

        let story_id_clone = story_id;
        let db_repo = self.db_repo.clone();
        let image_gen = self.image_gen.clone();
        let image_compressor = self.image_compressor.clone();
        let ai_tutor = self.ai_tutor.clone();
        let storage_repo = self.storage_repo.clone();
        let sender = self.notification_sender.clone();
        let gcs_prefix = self.gcs_prefix.clone();
        let public_base_url = self.public_base_url.clone();
        let active_prefetches = self.active_prefetches.clone();

        tokio::spawn(async move {
            if active_prefetches.contains_key(&story_id_clone) {
                return;
            }
            active_prefetches.insert(story_id_clone, true);

            if let (Some(gen), Some(comp), Some(tutor), Some(storage)) =
                (image_gen, image_compressor, ai_tutor, storage_repo)
            {
                if let Err(e) = Self::prefetch_images_internal(
                    story_id_clone,
                    db_repo,
                    gen,
                    comp,
                    tutor,
                    storage,
                    sender,
                    gcs_prefix,
                    public_base_url,
                )
                .await
                {
                    error!("Error in prefetch_images: {}", e);
                }
            }
            active_prefetches.remove(&story_id_clone);
        });

        let story_title = self.db_repo.get_story_title(story_id).await?;
        let episode_title = self
            .db_repo
            .get_episode_title(progress.current_episode_id)
            .await?;

        Ok(ProgressResponse {
            user_id: progress.user_id,
            story_id: progress.story_id,
            current_episode_id: progress.current_episode_id,
            story_title,
            current_episode_title: episode_title,
            current_step_order: progress.current_step_order,
            total_score: progress.total_score,
            status: progress.status,
            last_updated: progress.last_updated,
        })
    }

    #[allow(clippy::too_many_arguments)]
    async fn prefetch_images_internal(
        story_id: i32,
        db_repo: Arc<dyn PronounPracticeRepository>,
        image_gen: Arc<dyn ImageGenerator>,
        image_compressor: Arc<dyn ImageCompressor>,
        ai_tutor: Arc<dyn AITutor>,
        storage_repo: Arc<dyn StorageRepository>,
        sender: Option<broadcast::Sender<String>>,
        gcs_prefix: String,
        _public_base_url: String,
    ) -> Result<()> {
        info!(
            "Starting proactive image generation for all episodes of story {}",
            story_id
        );

        let episodes = db_repo.get_episodes_by_story(story_id).await?;

        for (ep_id, ep_title) in episodes {
            info!("Checking images for Episode {} ({})", ep_id, ep_title);
            let screens = db_repo.get_episode_screens(ep_id).await?;

            let mut screens_to_gen = Vec::new();
            let mut story_data_for_ai = Vec::new();

            for screen in screens {
                let img_url = screen.content["image_url"].as_str().unwrap_or("");
                let missing = Self::needs_image_regeneration(img_url)
                    || !Self::image_exists_in_storage(&storage_repo, &gcs_prefix, img_url).await;
                if missing {
                    screens_to_gen.push(screen.clone());
                    story_data_for_ai.push(json!({
                        "step": screen.step_order,
                        "narrative": screen.content["narrative_en"],
                        "action_to_evaluate": screen.content["correct_answer"],
                        "context_spanish": screen.content["challenge_text"]
                    }));
                }
            }

            if screens_to_gen.is_empty() {
                info!(
                    "All images for story {} / ep {} are already generated.",
                    story_id, ep_id
                );
                continue;
            }

            info!(
                "Requesting {} consistent prompts from Gemini for Ep {}...",
                story_data_for_ai.len(),
                ep_id
            );
            let prompts_list = ai_tutor
                .improve_visual_prompts_batch(&json!(story_data_for_ai), &ep_title)
                .await?;

            for (i, screen) in screens_to_gen.iter().enumerate() {
                let visual_prompt = prompts_list
                    .get(i)
                    .cloned()
                    .or_else(|| {
                        screen.content["ai_visual_prompt"]
                            .as_str()
                            .map(str::to_string)
                    })
                    .or_else(|| screen.content["ai_prompt"].as_str().map(str::to_string))
                    .unwrap_or_else(|| "professional office scene, cinematic lighting".to_string());

                info!(
                    "Generating image for Screen {} (Step {}) with prompt: {}",
                    screen.id, screen.step_order, visual_prompt
                );

                match image_gen.generate(&visual_prompt).await {
                    Ok(raw_bytes) => {
                        let final_bytes = match image_compressor.compress_to_avif(&raw_bytes, 80) {
                            Ok(avif) => avif,
                            Err(e) => {
                                error!(
                                    "Compression failed for story image screen {}; AVIF-only contract prevents fallback: {}",
                                    screen.id, e
                                );
                                continue;
                            }
                        };

                        let blob_path = format!(
                            "{}/pronoun/story_{}/ep_{}_step_{}.avif",
                            gcs_prefix, story_id, screen.episode_id, screen.step_order
                        );

                        storage_repo
                            .upload_blob(&blob_path, final_bytes, "image/avif")
                            .await?;

                        let public_url = format!(
                            "/card_images/pronoun/story_{}/ep_{}_step_{}.avif",
                            story_id, screen.episode_id, screen.step_order
                        );

                        let mut new_content = screen.content.clone();
                        new_content["image_url"] = json!(public_url);
                        new_content["ai_prompt"] = json!(visual_prompt);
                        db_repo
                            .update_screen_content(screen.id, new_content)
                            .await?;

                        if let Some(s) = &sender {
                            let _ = s.send(
                                json!({
                                    "type": "SCREEN_UPDATED",
                                    "screen_id": screen.id,
                                    "story_id": story_id,
                                    "episode_id": screen.episode_id,
                                    "image_url": public_url
                                })
                                .to_string(),
                            );
                        }
                        info!("Successfully updated screen {}.", screen.id);
                    }
                    Err(e) => error!("Failed to generate image for screen {}: {}", screen.id, e),
                }
            }
        }

        Ok(())
    }

    pub async fn get_episode_screens(&self, episode_id: i32) -> Result<Vec<StoryScreen>> {
        self.db_repo.get_episode_screens(episode_id).await
    }

    pub async fn update_progress(&self, update: ProgressUpdate) -> Result<ProgressResponse> {
        let progress = self.db_repo.update_progress(update).await?;
        let story_title = self.db_repo.get_story_title(progress.story_id).await?;
        let episode_title = self
            .db_repo
            .get_episode_title(progress.current_episode_id)
            .await?;

        Ok(ProgressResponse {
            user_id: progress.user_id,
            story_id: progress.story_id,
            current_episode_id: progress.current_episode_id,
            story_title,
            current_episode_title: episode_title,
            current_step_order: progress.current_step_order,
            total_score: progress.total_score,
            status: progress.status,
            last_updated: progress.last_updated,
        })
    }

    pub async fn get_next_episode_id(&self, current_episode_id: i32) -> Result<Option<i32>> {
        self.db_repo.get_next_episode_id(current_episode_id).await
    }

    pub async fn get_story_full_history(&self, story_id: i32) -> Result<serde_json::Value> {
        self.db_repo.get_story_full_history(story_id).await
    }

    pub async fn reset_progress(&self, user_id: &str, story_id: i32) -> Result<()> {
        self.db_repo.reset_progress(user_id, story_id).await
    }

    fn needs_image_regeneration(img_url: &str) -> bool {
        img_url.is_empty()
            || img_url.contains("unsplash.com")
            || img_url.contains("storage.googleapis.com")
            || img_url.ends_with(".png")
            || img_url.ends_with(".jpg")
            || img_url.ends_with(".jpeg")
    }

    fn image_url_to_blob_path(gcs_prefix: &str, img_url: &str) -> String {
        let rel = img_url
            .trim_start_matches("/card_images/")
            .trim_start_matches('/');
        format!("{}/{}", gcs_prefix, rel)
    }

    async fn image_exists_in_storage(
        storage: &Arc<dyn StorageRepository>,
        gcs_prefix: &str,
        img_url: &str,
    ) -> bool {
        if img_url.is_empty() {
            return false;
        }
        let blob_path = Self::image_url_to_blob_path(gcs_prefix, img_url);
        storage.blob_exists(&blob_path).await.unwrap_or(false)
    }
}
