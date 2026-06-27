use crate::config::Settings;
use crate::domain::repositories::image::ImageGenerator;
use anyhow::{anyhow, Context, Result};
use async_trait::async_trait;
use base64::Engine;
use reqwest::Client;
use serde_json::{json, Value};
use std::time::Duration;
use tracing::info;

/// Generación de imagen vía Interactions API (Nano Banana Pro / gemini-3-pro-image).
/// Solo se usa en el landing demo; la app interna sigue con ComfyUI/Flux.
pub struct GeminiInteractionsImageProvider {
    client: Client,
    api_key: String,
    model: String,
    aspect_ratio: String,
    image_size: String,
}

impl GeminiInteractionsImageProvider {
    pub fn new(settings: &Settings) -> Self {
        let client = Client::builder()
            .timeout(Duration::from_secs(300))
            .build()
            .expect("Error building Gemini image HTTP client");

        #[cfg(feature = "flashcards")]
        let (model, aspect_ratio, image_size) = {
            use mod_flashcards::landing_demo_image_prompt::{
                GEMINI_IMAGE_ASPECT_RATIO, GEMINI_IMAGE_MODEL, GEMINI_IMAGE_SIZE,
            };
            (
                GEMINI_IMAGE_MODEL.to_string(),
                GEMINI_IMAGE_ASPECT_RATIO.to_string(),
                GEMINI_IMAGE_SIZE.to_string(),
            )
        };

        #[cfg(not(feature = "flashcards"))]
        let (model, aspect_ratio, image_size) = (
            "gemini-3-pro-image".to_string(),
            "1:1".to_string(),
            "1K".to_string(),
        );

        Self {
            client,
            api_key: settings
                .gemini_api_key
                .clone()
                .unwrap_or_else(|| "DISABLED".to_string()),
            model,
            aspect_ratio,
            image_size,
        }
    }

    fn extract_image_bytes(body: &Value) -> Result<Vec<u8>> {
        if let Some(data) = body
            .get("output_image")
            .and_then(|o| o.get("data"))
            .and_then(|d| d.as_str())
        {
            return decode_image_b64(data);
        }

        if let Some(steps) = body.get("steps").and_then(|s| s.as_array()) {
            for step in steps {
                if step.get("type").and_then(|t| t.as_str()) != Some("model_output") {
                    continue;
                }
                if let Some(blocks) = step.get("content").and_then(|c| c.as_array()) {
                    for block in blocks {
                        if block.get("type").and_then(|t| t.as_str()) == Some("image") {
                            if let Some(data) = block.get("data").and_then(|d| d.as_str()) {
                                return decode_image_b64(data);
                            }
                        }
                    }
                }
            }
        }

        Err(anyhow!(
            "Gemini image: no image block in interaction response"
        ))
    }
}

fn decode_image_b64(data: &str) -> Result<Vec<u8>> {
    base64::engine::general_purpose::STANDARD
        .decode(data)
        .context("Gemini image: base64 decode failed")
}

#[async_trait]
impl ImageGenerator for GeminiInteractionsImageProvider {
    async fn generate(&self, prompt: &str) -> Result<Vec<u8>> {
        if self.api_key.is_empty() || self.api_key == "DISABLED" {
            return Err(anyhow!(
                "Gemini API key no configurada para imágenes del demo"
            ));
        }

        info!(
            model = %self.model,
            prompt_len = prompt.len(),
            "gemini-image:request"
        );

        let body = json!({
            "model": self.model,
            "input": prompt,
            "response_format": {
                "type": "image",
                "aspect_ratio": self.aspect_ratio,
                "image_size": self.image_size,
            }
        });

        let resp = self
            .client
            .post("https://generativelanguage.googleapis.com/v1beta/interactions")
            .header("x-goog-api-key", &self.api_key)
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .context("Gemini image: HTTP request failed")?;

        let status = resp.status();
        let text = resp
            .text()
            .await
            .context("Gemini image: read body failed")?;

        if !status.is_success() {
            return Err(anyhow!(
                "Gemini image API {}: {}",
                status,
                &text[..text.len().min(500)]
            ));
        }

        let json: Value = serde_json::from_str(&text).context("Gemini image: invalid JSON")?;

        if json.get("status").and_then(|s| s.as_str()) != Some("completed") {
            return Err(anyhow!(
                "Gemini image: interaction not completed (status={:?})",
                json.get("status")
            ));
        }

        let bytes = Self::extract_image_bytes(&json)?;
        info!(bytes = bytes.len(), "gemini-image:ok");
        Ok(bytes)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn extracts_image_from_model_output_step() {
        let body = json!({
            "status": "completed",
            "steps": [
                {"type": "thought", "signature": "x"},
                {
                    "type": "model_output",
                    "content": [{
                        "type": "image",
                        "mime_type": "image/jpeg",
                        "data": "aGVsbG8="
                    }]
                }
            ]
        });
        let bytes = GeminiInteractionsImageProvider::extract_image_bytes(&body).unwrap();
        assert_eq!(bytes, b"hello");
    }
}
