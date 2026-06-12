use flashcard::config::Settings;
use flashcard::infrastructure::storage::gcs_repository::GCSStorageRepository;
use flashcard::domain::repositories::storage::StorageRepository;
use std::sync::Arc;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();
    let settings = Settings::from_env()?;
    let storage_repo = GCSStorageRepository::new(&settings).await?;
    
    println!("Listing images in prefix: card_images/verbs/1-basic/");
    // We can't call list directly if it's not in the trait, but find_blob_by_prefix is.
    // Let's just try to find one.
    if let Ok(Some(blob)) = storage_repo.find_blob_by_prefix("card_images/verbs/1-basic/").await {
        println!("Found blob: {}", blob);
    } else {
        println!("No blobs found in that prefix.");
    }

    Ok(())
}
