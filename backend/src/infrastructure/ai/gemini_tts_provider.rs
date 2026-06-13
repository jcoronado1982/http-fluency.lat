/// Gemini 2.5 Flash Preview TTS via REST generateContent.
use async_trait::async_trait;
use anyhow::{anyhow, Context, Result};
use base64::{engine::general_purpose::STANDARD, Engine};
use serde::{Deserialize, Serialize};

use crate::config::Settings;
use crate::domain::repositories::audio::AudioGenerator;
use crate::infrastructure::ai::pcm_ogg::pcm_s16le_mono_to_ogg;
use crate::infrastructure::ai::gemini_voices::normalize_gemini_voice;

pub const GEMINI_TTS_MODEL: &str = "gemini-2.5-flash-preview-tts";
const SAMPLE_RATE: u32 = 24000;

pub struct GeminiTtsProvider {
    client: reqwest::Client,
    api_key: String,
}

#[derive(Serialize)]
struct GenerateContentRequest {
    contents: Vec<Content>,
    #[serde(rename = "generationConfig")]
    generation_config: GenerationConfig,
}

#[derive(Serialize)]
struct Content {
    parts: Vec<Part>,
}

#[derive(Serialize)]
struct Part {
    text: String,
}

#[derive(Serialize)]
struct GenerationConfig {
    #[serde(rename = "responseModalities")]
    response_modalities: Vec<String>,
    #[serde(rename = "speechConfig")]
    speech_config: SpeechConfig,
}

#[derive(Serialize)]
struct SpeechConfig {
    #[serde(rename = "voiceConfig")]
    voice_config: VoiceConfig,
}

#[derive(Serialize)]
struct VoiceConfig {
    #[serde(rename = "prebuiltVoiceConfig")]
    prebuilt_voice_config: PrebuiltVoiceConfig,
}

#[derive(Serialize)]
struct PrebuiltVoiceConfig {
    #[serde(rename = "voiceName")]
    voice_name: String,
}

#[derive(Deserialize)]
struct GenerateContentResponse {
    candidates: Option<Vec<Candidate>>,
}

#[derive(Deserialize)]
struct Candidate {
    content: Option<ResponseContent>,
}

#[derive(Deserialize)]
struct ResponseContent {
    parts: Option<Vec<ResponsePart>>,
}

#[derive(Deserialize)]
struct ResponsePart {
    #[serde(rename = "inlineData")]
    inline_data: Option<InlineData>,
}

#[derive(Deserialize)]
struct InlineData {
    data: Option<String>,
}

impl GeminiTtsProvider {
    pub fn new(settings: &Settings) -> Result<Self> {
        let api_key = settings
            .gemini_tts_api_key
            .clone()
            .or(settings.gemini_api_key.clone())
            .or(settings.gcp_api_key.clone())
            .filter(|k| k != "DISABLED")
            .context("GEMINI_TTS_API_KEY o GEMINI_API_KEY requerida para Gemini TTS")?;

        Ok(Self {
            client: reqwest::Client::new(),
            api_key,
        })
    }

    fn strip_ssml(ssml: &str) -> String {
        let mut out = String::with_capacity(ssml.len());
        let mut in_tag = false;
        for ch in ssml.chars() {
            match ch {
                '<' => in_tag = true,
                '>' => in_tag = false,
                _ if !in_tag => out.push(ch),
                _ => {}
            }
        }
        out.split_whitespace().collect::<Vec<_>>().join(" ")
    }

    async fn synthesize_internal(&self, text: &str, voice_name: &str) -> Result<Vec<u8>> {
        let voice = normalize_gemini_voice(voice_name);
        let url = format!(
            "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent",
            GEMINI_TTS_MODEL
        );

        let body = GenerateContentRequest {
            contents: vec![Content {
                parts: vec![Part {
                    text: text.to_string(),
                }],
            }],
            generation_config: GenerationConfig {
                response_modalities: vec!["AUDIO".into()],
                speech_config: SpeechConfig {
                    voice_config: VoiceConfig {
                        prebuilt_voice_config: PrebuiltVoiceConfig {
                            voice_name: voice.into(),
                        },
                    },
                },
            },
        };

        let resp = self
            .client
            .post(&url)
            .header("x-goog-api-key", &self.api_key)
            .json(&body)
            .send()
            .await
            .context("Gemini TTS request failed")?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(anyhow!("Gemini TTS error {}: {}", status, body));
        }

        let parsed: GenerateContentResponse = resp.json().await.context("Gemini TTS parse failed")?;
        let b64 = parsed
            .candidates
            .and_then(|c| c.into_iter().next())
            .and_then(|c| c.content)
            .and_then(|c| c.parts)
            .and_then(|p| p.into_iter().next())
            .and_then(|p| p.inline_data)
            .and_then(|d| d.data)
            .ok_or_else(|| anyhow!("Gemini TTS: no audio in response"))?;

        let pcm = STANDARD.decode(b64).context("Gemini TTS base64 decode failed")?;
        if pcm.is_empty() {
            return Err(anyhow!("Gemini TTS: audio vacío"));
        }

        pcm_s16le_mono_to_ogg(&pcm, SAMPLE_RATE).context("Gemini TTS OGG encode failed")
    }
}

#[async_trait]
impl AudioGenerator for GeminiTtsProvider {
    async fn synthesize(&self, text: &str, voice_name: &str, _lang: Option<&str>) -> Result<Vec<u8>> {
        self.synthesize_internal(text, voice_name).await
    }

    async fn synthesize_ssml(&self, ssml: &str, voice_name: &str, lang: Option<&str>) -> Result<Vec<u8>> {
        let text = Self::strip_ssml(ssml);
        self.synthesize(&text, voice_name, lang).await
    }
}
