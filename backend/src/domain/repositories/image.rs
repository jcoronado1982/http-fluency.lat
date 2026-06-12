use async_trait::async_trait;
use anyhow::Result;

#[async_trait]
#[allow(dead_code)]
pub trait ImageGenerator: Send + Sync {
    async fn generate(&self, prompt: &str) -> Result<Vec<u8>>;
}
