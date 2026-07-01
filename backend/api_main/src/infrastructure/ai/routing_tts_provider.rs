use anyhow::Result;
/// Routes TTS to Gemini AI Studio for all supported languages.
use async_trait::async_trait;

use crate::config::Settings;
use crate::domain::repositories::audio::AudioGenerator;
use crate::infrastructure::ai::gemini_tts_provider::GeminiTtsProvider;

/// Bump when changing the Gemini TTS routing policy so cached ES audio is regenerated.
pub const SPANISH_TTS_BACKEND: &str = "ai-studio-gemini-es-419-v1";

pub struct RoutingTtsProvider {
    gemini: GeminiTtsProvider,
}

impl RoutingTtsProvider {
    pub async fn new(settings: &Settings) -> Result<Self> {
        Ok(Self {
            gemini: GeminiTtsProvider::new(settings)?,
        })
    }
}

#[async_trait]
impl AudioGenerator for RoutingTtsProvider {
    async fn synthesize(
        &self,
        text: &str,
        voice_name: &str,
        lang: Option<&str>,
    ) -> Result<Vec<u8>> {
        tracing::info!(
            "🎙️ TTS Gemini AI Studio → backend='{}', lang='{}', texto='{}'",
            SPANISH_TTS_BACKEND,
            lang.unwrap_or("en"),
            text
        );
        self.gemini.synthesize(text, voice_name, lang).await
    }

    async fn synthesize_ssml(
        &self,
        ssml: &str,
        voice_name: &str,
        lang: Option<&str>,
    ) -> Result<Vec<u8>> {
        tracing::info!(
            "🎙️ TTS Gemini AI Studio (SSML) → backend='{}', lang='{}'",
            SPANISH_TTS_BACKEND,
            lang.unwrap_or("en")
        );
        self.gemini.synthesize_ssml(ssml, voice_name, lang).await
    }
}
