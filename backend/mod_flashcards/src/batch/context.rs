use std::sync::Arc;

use crate::audio_use_cases::AudioUseCases;
use crate::image_use_cases::ImageUseCases;
use crate::DeckUseCases;

#[derive(Clone, Default)]
pub struct BatchFilter {
    pub category: Option<String>,
    pub deck: Option<String>,
}

pub fn parse_batch_filter(args: &[String], flag: &str) -> BatchFilter {
    let pos = args.iter().position(|a| a == flag);
    BatchFilter {
        category: pos.and_then(|i| args.get(i + 1).cloned()),
        deck: pos.and_then(|i| args.get(i + 2).cloned()),
    }
}

#[derive(Clone)]
pub struct BatchSettings {
    pub gcs_images_prefix: String,
    pub gcs_audio_prefix: String,
    pub sync_to_oracle: bool,
    pub oracle_host: String,
    pub local_storage_path: String,
    pub gemini_tts_api_key_backup: Option<String>,
}

pub struct ImageBatchContext {
    pub deck: Arc<DeckUseCases>,
    pub image: Arc<ImageUseCases>,
    pub settings: BatchSettings,
}

pub struct AudioBatchContext {
    pub deck: Arc<DeckUseCases>,
    pub audio: AudioUseCases,
    pub settings: BatchSettings,
}
