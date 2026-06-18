use crate::domain::models::flashcard::DeckData;
use anyhow::Result;
use async_trait::async_trait;

#[async_trait]
pub trait StorageRepository: Send + Sync {
    async fn list_categories(&self) -> Result<Vec<String>>;
    async fn list_decks(&self, category: &str) -> Result<Vec<String>>;
    async fn get_deck_data(&self, category: &str, deck_name: &str) -> Result<DeckData>;
    async fn save_deck_data(&self, category: &str, deck_name: &str, data: &DeckData) -> Result<()>;
    async fn get_phonics_data(&self) -> Result<serde_json::Value>;
    async fn download_blob(&self, blob_path: &str) -> Result<Vec<u8>>;
    async fn upload_blob(
        &self,
        blob_path: &str,
        content: Vec<u8>,
        content_type: &str,
    ) -> Result<()>;
    async fn blob_exists(&self, blob_path: &str) -> Result<bool>;
    async fn find_blob_by_prefix(&self, prefix: &str) -> Result<Option<String>>;
    async fn delete_blob(&self, blob_path: &str) -> Result<()>;
    /// Mueve/renombra un blob (p. ej. archivar audio activo sin borrarlo).
    async fn rename_blob(&self, from_path: &str, to_path: &str) -> Result<()>;
    /// Lista nombres de archivo en un directorio relativo (sin HEAD por archivo).
    async fn list_files_in_dir(&self, rel_dir: &str) -> Result<Vec<String>>;
}
