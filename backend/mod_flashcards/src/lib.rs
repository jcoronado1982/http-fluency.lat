use anyhow::Result;
use fluency_core::domain::models::flashcard::DeckData;
use fluency_core::domain::models::user_activity::{LearningStats, B2_VOCABULARY_TARGET};
use fluency_core::ports::db_repository::{CardProgressRepository, UserActivityRepository};
use fluency_core::ports::storage::StorageRepository;
use std::sync::Arc;

pub mod audio_use_cases;
pub mod batch;
pub mod image_use_cases;
pub mod landing_demo_image_prompt;

/// Categoría de storage para el demo del landing (aislada del sistema interno).
pub const LANDING_DEMO_CATEGORY: &str = "landing-demo";

pub fn is_landing_demo_namespace(category: &str) -> bool {
    category == LANDING_DEMO_CATEGORY
}

#[derive(Clone)]
pub struct FlashcardsConfig {
    pub gcs_audio_prefix: String,
    pub gcs_images_prefix: String,
    pub gemini_api_enabled: bool,
}

pub struct DeckUseCases {
    storage_repo: Arc<dyn StorageRepository>,
    db_repo: Arc<dyn CardProgressRepository>,
    activity_repo: Arc<dyn UserActivityRepository>,
}

impl DeckUseCases {
    pub fn new(
        storage_repo: Arc<dyn StorageRepository>,
        db_repo: Arc<dyn CardProgressRepository>,
        activity_repo: Arc<dyn UserActivityRepository>,
    ) -> Self {
        Self {
            storage_repo,
            db_repo,
            activity_repo,
        }
    }

    pub async fn list_categories(&self) -> Result<Vec<String>> {
        self.storage_repo.list_categories().await
    }

    /// Devuelve cada categoría con el total real de tarjetas sumando todos sus decks.
    pub async fn list_categories_with_counts(&self) -> Result<Vec<serde_json::Value>> {
        let categories = self.storage_repo.list_categories().await?;
        let mut result = Vec::new();
        for cat in categories {
            let decks = self.storage_repo.list_decks(&cat).await.unwrap_or_default();
            let mut total: usize = 0;
            for deck in &decks {
                if let Ok(data) = self.storage_repo.get_deck_data(&cat, deck).await {
                    total += data.flashcards().len();
                }
            }
            result.push(serde_json::json!({ "name": cat, "total": total }));
        }
        Ok(result)
    }

    pub async fn list_decks(&self, category: &str) -> Result<Vec<String>> {
        self.storage_repo.list_decks(category).await
    }

    /// Carga el deck desde almacenamiento y sobreescribe `learned`
    /// con el progreso real guardado en la base de datos.
    pub async fn get_deck_data(
        &self,
        user_id: &str,
        category: &str,
        deck_name: &str,
    ) -> Result<DeckData> {
        let deck_key = deck_name.replace(".json", "");
        let mut data = self.storage_repo.get_deck_data(category, deck_name).await?;

        for card in data.flashcards_mut() {
            card.learned = false;
        }

        match self
            .db_repo
            .get_learned_cards(user_id, category, &deck_key)
            .await
        {
            Ok(learned_indices) => {
                if !learned_indices.is_empty() {
                    let cards = data.flashcards_mut();
                    for idx in learned_indices {
                        if let Some(card) = cards.get_mut(idx as usize) {
                            card.learned = true;
                        }
                    }
                }
            }
            Err(e) => {
                tracing::warn!(
                    "No se pudo obtener progreso de DB: {}. Usando solo almacenamiento.",
                    e
                );
            }
        }

        Ok(data)
    }

    /// Guarda el estado aprendido en la base de datos. No modifica el JSON fuente.
    pub async fn update_card_status(
        &self,
        user_id: &str,
        category: &str,
        deck_name: &str,
        index: usize,
        learned: bool,
    ) -> Result<()> {
        let deck_key = deck_name.replace(".json", "");
        tracing::info!(
            "Guardando progreso: {}/{} user={} index={} learned={}",
            category,
            deck_key,
            user_id,
            index,
            learned
        );
        self.db_repo
            .upsert_card_progress(user_id, category, &deck_key, index as i32, learned)
            .await?;
        if learned {
            self.activity_repo.record_study_day(user_id).await?;
        }
        Ok(())
    }

    /// Resetea el progreso del deck eliminando las filas de progreso.
    pub async fn reset_deck_status(
        &self,
        user_id: &str,
        category: &str,
        deck_name: &str,
    ) -> Result<()> {
        let deck_key = deck_name.replace(".json", "");
        self.db_repo
            .reset_card_progress(user_id, category, &deck_key)
            .await
    }

    pub async fn get_phonics_data(&self) -> Result<serde_json::Value> {
        self.storage_repo.get_phonics_data().await
    }

    pub async fn get_deck_json(&self, category: &str, deck_name: &str) -> Result<DeckData> {
        self.storage_repo.get_deck_data(category, deck_name).await
    }

    pub async fn save_deck_json(
        &self,
        category: &str,
        deck_name: &str,
        data: &DeckData,
    ) -> Result<()> {
        self.storage_repo
            .save_deck_data(category, deck_name, data)
            .await
    }

    pub async fn blob_exists(&self, blob_path: &str) -> Result<bool> {
        self.storage_repo.blob_exists(blob_path).await
    }

    pub async fn list_files_in_dir(&self, rel_dir: &str) -> Result<Vec<String>> {
        self.storage_repo.list_files_in_dir(rel_dir).await
    }

    pub async fn touch_study_day(&self, user_id: &str) -> Result<()> {
        self.activity_repo.record_study_day(user_id).await
    }

    pub async fn get_learning_stats(&self, user_id: &str) -> Result<LearningStats> {
        let mastered_count = self.db_repo.count_learned_cards(user_id).await?;
        self.activity_repo
            .get_learning_stats(user_id, mastered_count, B2_VOCABULARY_TARGET)
            .await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn landing_demo_namespace_is_isolated() {
        assert!(is_landing_demo_namespace("landing-demo"));
        assert!(!is_landing_demo_namespace("verbs"));
    }
}
