/// Routes TTS by language: Spanish → Gemini-TTS Cloud (es-419), English → Gemini AI Studio.
use async_trait::async_trait;
use anyhow::Result;

use crate::config::Settings;
use crate::domain::repositories::audio::AudioGenerator;
use crate::infrastructure::ai::gemini_tts_provider::GeminiTtsProvider;
use crate::infrastructure::ai::tts_grpc_provider::TtsGrpcProvider;

/// Bump when changing Spanish TTS backend so cached ES audio is regenerated.
pub const SPANISH_TTS_BACKEND: &str = "cloud-gemini-es-419-v1";

pub struct RoutingTtsProvider {
    gemini: GeminiTtsProvider,
    cloud: TtsGrpcProvider,
}

impl RoutingTtsProvider {
    pub async fn new(settings: &Settings) -> Result<Self> {
        Ok(Self {
            gemini: GeminiTtsProvider::new(settings)?,
            cloud: TtsGrpcProvider::new(settings).await?,
        })
    }

    fn is_spanish(lang: Option<&str>) -> bool {
        lang.map(|l| l.eq_ignore_ascii_case("es") || l.starts_with("es-"))
            .unwrap_or(false)
    }
}

#[async_trait]
impl AudioGenerator for RoutingTtsProvider {
    async fn synthesize(&self, text: &str, voice_name: &str, lang: Option<&str>) -> Result<Vec<u8>> {
        if Self::is_spanish(lang) {
            tracing::info!(
                "🇪🇸 TTS español → Gemini-TTS Cloud locale='es-419', backend='{}', texto='{}'",
                SPANISH_TTS_BACKEND,
                text
            );
            self.cloud.synthesize(text, voice_name, lang).await
        } else {
            match self.gemini.synthesize(text, voice_name, lang).await {
                Ok(bytes) => Ok(bytes),
                Err(e) => {
                    tracing::warn!("⚠️ Gemini TTS EN falló ({}), fallback Cloud TTS", e);
                    self.cloud.synthesize(text, voice_name, lang).await
                }
            }
        }
    }

    async fn synthesize_ssml(&self, ssml: &str, voice_name: &str, lang: Option<&str>) -> Result<Vec<u8>> {
        if Self::is_spanish(lang) {
            tracing::info!(
                "🇪🇸 TTS español (SSML) → Gemini-TTS Cloud locale='es-419', backend='{}'",
                SPANISH_TTS_BACKEND
            );
            self.cloud.synthesize_ssml(ssml, voice_name, lang).await
        } else {
            match self.gemini.synthesize_ssml(ssml, voice_name, lang).await {
                Ok(bytes) => Ok(bytes),
                Err(e) => {
                    tracing::warn!("⚠️ Gemini TTS EN (SSML) falló ({}), fallback Cloud TTS", e);
                    self.cloud.synthesize_ssml(ssml, voice_name, lang).await
                }
            }
        }
    }
}
