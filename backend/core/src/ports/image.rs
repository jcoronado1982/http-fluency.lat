use anyhow::Result;
use async_trait::async_trait;

#[async_trait]
#[allow(dead_code)]
pub trait ImageGenerator: Send + Sync {
    async fn generate(&self, prompt: &str) -> Result<Vec<u8>>;
}
