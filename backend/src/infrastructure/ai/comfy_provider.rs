use async_trait::async_trait;
use crate::domain::repositories::image::ImageGenerator;
use crate::config::Settings;
use anyhow::{Result, Context, anyhow};
use serde_json::json;
use reqwest::Client;
use tracing::info;
use tokio::time::{sleep, Duration};

pub struct ComfyUIProvider {
    client: Client,
    url: String,
}

impl ComfyUIProvider {
    pub fn new(settings: &Settings) -> Self {
        // ComfyUI corre en localhost: TCP_NODELAY elimina el delay Nagle
        // que de otro modo añade ~40 ms en loopback.
        let client = Client::builder()
            .pool_max_idle_per_host(4)
            .tcp_nodelay(true)
            .timeout(std::time::Duration::from_secs(300))
            .build()
            .expect("Error building ComfyUI HTTP client");
        Self {
            client,
            url: settings.comfy_url.clone(),
        }
    }

    async fn is_available(&self) -> bool {
        let url = format!("{}/system_stats", self.url);
        self.client.get(&url).timeout(Duration::from_secs(1)).send().await.is_ok()
    }
}

#[async_trait]
impl ImageGenerator for ComfyUIProvider {
    async fn generate(&self, prompt: &str) -> Result<Vec<u8>> {
        // Robustness: Wait for ComfyUI to be available if it's still booting
        let mut attempts = 0;
        while !self.is_available().await {
            if attempts >= 30 {
                return Err(anyhow!("ComfyUI not available at {} after 30 seconds", self.url));
            }
            info!("⏳ Waiting for ComfyUI to be ready at {} (attempt {}/30)...", self.url, attempts + 1);
            sleep(Duration::from_secs(1)).await;
            attempts += 1;
        }

        let client_id = uuid::Uuid::new_v4().to_string();
        
        let workflow = json!({
            "prompt": {
                "3": {
                    "class_type": "KSampler",
                    "inputs": {
                        "cfg": 1,
                        "denoise": 1,
                        "latent_image": ["5", 0],
                        "model": ["10", 0],
                        "negative": ["21", 0],
                        "positive": ["20", 0],
                        "sampler_name": "euler",
                        "scheduler": "simple",
                        "seed": rand::random::<u32>(),
                        "steps": 8
                    }
                },
                "5": {
                    "class_type": "EmptyLatentImage",
                    "inputs": {
                        "batch_size": 1,
                        "height": 512,
                        "width": 512
                    }
                },
                "8": {
                    "class_type": "VAEDecode",
                    "inputs": {
                        "samples": ["3", 0],
                        "vae": ["12", 0]
                    }
                },
                "9": {
                    "class_type": "SaveImage",
                    "inputs": {
                        "filename_prefix": format!("rust_gen_{}", client_id),
                        "images": ["8", 0]
                    }
                },
                "10": {
                    "class_type": "UnetLoaderGGUF",
                    "inputs": {
                        "unet_name": "flux-2-klein-9b-Q8_0.gguf"
                    }
                },
                "11": {
                    "class_type": "CLIPLoaderGGUF",
                    "inputs": {
                        "clip_name": "Qwen_Qwen3-8B-Q8_0.gguf",
                        "type": "flux2"
                    }
                },
                "12": {
                    "class_type": "VAELoader",
                    "inputs": {
                        "vae_name": "flux2-vae.safetensors"
                    }
                },
                "20": {
                    "class_type": "CLIPTextEncode",
                    "inputs": {
                        "clip": ["11", 0],
                        "text": prompt
                    }
                },
                "21": {
                    "class_type": "CLIPTextEncode",
                    "inputs": {
                        "clip": ["11", 0],
                        "text": "text, words, letters, font, typography, watermark, signature, blurry, low quality"
                    }
                }
            }
        });

        /*
        let workflow = json!({
            "prompt": {
                "3": {
                    "class_type": "KSampler",
                    "inputs": {
                        "cfg": 3.0,
                        "denoise": 1.0,
                        "latent_image": ["5", 0],
                        "model": ["10", 0],
                        "negative": ["23", 0],
                        "positive": ["22", 0],
                        "sampler_name": "euler",
                        "scheduler": "simple",
                        "seed": rand::random::<u32>(),
                        "steps": 25
                    }
                },
                "5": {
                    "class_type": "EmptySanaLatentImage",
                    "inputs": {
                        "batch_size": 1,
                        "height": 1024,
                        "width": 1024
                    }
                },
                "8": {
                    "class_type": "VAEDecode",
                    "inputs": {
                        "samples": ["3", 0],
                        "vae": ["12", 0]
                    }
                },
                "9": {
                    "class_type": "SaveImage",
                    "inputs": {
                        "filename_prefix": format!("rust_gen_{}", client_id),
                        "images": ["8", 0]
                    }
                },
                "10": {
                    "class_type": "SanaCheckpointLoader",
                    "inputs": {
                        "ckpt_name": "Sana_1600M_1024px.pth",
                        "model": "SanaMS_1600M_P1_D20"
                    }
                },
                "11": {
                    "class_type": "GemmaLoader",
                    "inputs": {
                        "model_name": "Efficient-Large-Model/gemma-2-2b-it",
                        "device": "cpu",
                        "dtype": "default"
                    }
                },
                "12": {
                    "class_type": "ExtraVAELoader",
                    "inputs": {
                        "vae_name": "sana_vae.safetensors",
                        "vae_type": "dcae-f32c32-sana-1.0",
                        "dtype": "auto"
                    }
                },
                "20": {
                    "class_type": "SanaTextEncode",
                    "inputs": {
                        "text": prompt,
                        "GEMMA": ["11", 0]
                    }
                },
                "21": {
                    "class_type": "SanaTextEncode",
                    "inputs": {
                        "text": "cartoon, illustration, drawing, painting, anime, graphic, digital art, vector, 3d render, CGI, outline, white outline, text, words, letters, font, typography, watermark, signature, blurry, low quality",
                        "GEMMA": ["11", 0]
                    }
                },
                "22": {
                    "class_type": "SanaResolutionCond",
                    "inputs": {
                        "cond": ["20", 0],
                        "width": 1024,
                        "height": 1024
                    }
                },
                "23": {
                    "class_type": "SanaResolutionCond",
                    "inputs": {
                        "cond": ["21", 0],
                        "width": 1024,
                        "height": 1024
                    }
                }
            }
        });
        */

        let url = format!("{}/prompt", self.url);
        let resp = self.client.post(&url)
            .json(&workflow)
            .send()
            .await?
            .error_for_status()?;
            
        let json: serde_json::Value = resp.json().await?;
        let prompt_id = json["prompt_id"].as_str().context("No prompt_id in response")?;

        // Polling for completion using /history/{prompt_id}
        let history_url = format!("{}/history/{}", self.url, prompt_id);
        let mut attempts = 0;
        while attempts < 60 {
            let h_resp = self.client.get(&history_url).send().await?;
            if h_resp.status().is_success() {
                let h_json: serde_json::Value = h_resp.json().await?;
                if !h_json[prompt_id].is_null() {
                    // Completed!
                    let outputs = &h_json[prompt_id]["outputs"];
                    // Node 9 is SaveImage
                    let filename = outputs["9"]["images"][0]["filename"].as_str().context("No filename in output")?;
                    let subfolder = outputs["9"]["images"][0]["subfolder"].as_str().unwrap_or("");
                    
                    // Download the image
                    let view_url = format!("{}/view?filename={}&subfolder={}&type=output", self.url, filename, subfolder);
                    let img_resp = self.client.get(&view_url).send().await?;
                    let bytes = img_resp.bytes().await?;
                    return Ok(bytes.to_vec());
                }
            }
            sleep(Duration::from_secs(1)).await;
            attempts += 1;
        }

        Err(anyhow!("ComfyUI timeout for prompt {}", prompt_id))
    }
}
