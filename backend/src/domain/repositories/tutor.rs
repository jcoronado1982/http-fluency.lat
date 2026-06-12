use async_trait::async_trait;
use anyhow::Result;

#[async_trait]
pub trait AITutor: Send + Sync {
    async fn analyze_error(&self, user_input: &str, correct_answer: &str, context_spanish: &str) -> Result<String>;
    async fn explain_like_child(&self, user_input: &str, correct_answer: &str, context_spanish: &str, original_explanation: Option<&str>) -> Result<String>;
    async fn improve_visual_prompts_batch(&self, story_data: &serde_json::Value, context: &str) -> Result<Vec<String>>;
    async fn improve_prompt_for_image(&self, phrase: &str, meaning: Option<&str>, usage_example: Option<&str>) -> Result<String>;
    async fn refine_audio_ssml(&self, text: &str, tone: &str) -> Result<String>;
}
