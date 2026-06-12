use std::sync::Arc;
use crate::domain::repositories::storage::StorageRepository;
use crate::domain::repositories::db_repository::CardProgressRepository;
use crate::domain::models::flashcard::DeckData;
use anyhow::Result;

pub struct DeckUseCases {
    storage_repo: Arc<dyn StorageRepository>,
    db_repo: Arc<dyn CardProgressRepository>,
}

impl DeckUseCases {
    pub fn new(storage_repo: Arc<dyn StorageRepository>, db_repo: Arc<dyn CardProgressRepository>) -> Self {
        Self { storage_repo, db_repo }
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

    /// Carga el deck desde GCS y sobreescribe el campo `learned`
    /// con el progreso real guardado en SurrealDB.
    pub async fn get_deck_data(&self, user_id: &str, category: &str, deck_name: &str) -> Result<DeckData> {
        let deck_key = deck_name.replace(".json", "");
        let mut data = self.storage_repo.get_deck_data(category, deck_name).await?;

        // Forzar todas las tarjetas a 'no aprendidas' inicialmente.
        for card in data.flashcards_mut() {
            card.learned = false;
        }

        // Obtener los índices aprendidos desde SurrealDB
        match self.db_repo.get_learned_cards(user_id, category, &deck_key).await {
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
                tracing::warn!("⚠️ No se pudo obtener progreso de DB: {}. Usando solo GCS.", e);
            }
        }

        Ok(data)
    }

    /// Guarda el estado aprendido en SurrealDB. NO modifica el JSON de GCS.
    pub async fn update_card_status(&self, user_id: &str, category: &str, deck_name: &str, index: usize, learned: bool) -> Result<()> {
        let deck_key = deck_name.replace(".json", "");
        tracing::info!("🔄 Guardando progreso: {}/{} user={} index={} learned={}", category, deck_key, user_id, index, learned);
        self.db_repo.upsert_card_progress(user_id, category, &deck_key, index as i32, learned).await?;
        Ok(())
    }

    /// Resetea el progreso del deck eliminando las filas de card_progress. NO modifica GCS.
    pub async fn reset_deck_status(&self, user_id: &str, category: &str, deck_name: &str) -> Result<()> {
        let deck_key = deck_name.replace(".json", "");
        self.db_repo.reset_card_progress(user_id, category, &deck_key).await
    }

    pub async fn get_phonics_data(&self) -> Result<serde_json::Value> {
        self.storage_repo.get_phonics_data().await
    }

    /// Lee el JSON del mazo tal cual está en almacenamiento (sin overlay de progreso DB).
    pub async fn get_deck_json(&self, category: &str, deck_name: &str) -> Result<DeckData> {
        self.storage_repo.get_deck_data(category, deck_name).await
    }

    /// Persiste el JSON del mazo (local y/o Oracle vía SCP según configuración).
    pub async fn save_deck_json(&self, category: &str, deck_name: &str, data: &DeckData) -> Result<()> {
        self.storage_repo.save_deck_data(category, deck_name, data).await
    }

    pub async fn blob_exists(&self, blob_path: &str) -> Result<bool> {
        self.storage_repo.blob_exists(blob_path).await
    }

    pub async fn list_files_in_dir(&self, rel_dir: &str) -> Result<Vec<String>> {
        self.storage_repo.list_files_in_dir(rel_dir).await
    }
}
