use async_trait::async_trait;
use anyhow::Result;

#[async_trait]
pub trait AudioGenerator: Send + Sync {
    async fn synthesize(&self, text: &str, voice_name: &str, lang: Option<&str>) -> Result<Vec<u8>>;
    async fn synthesize_ssml(&self, ssml: &str, voice_name: &str, lang: Option<&str>) -> Result<Vec<u8>>;
}
