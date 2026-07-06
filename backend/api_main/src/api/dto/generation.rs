use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
pub struct SynthesizeSpeechBody {
    pub category: String,
    pub deck: String,
    pub text: String,
    pub voice_name: String,
    pub verb_name: Option<String>,
    pub tone: Option<String>,
    pub lang: Option<String>,
    #[serde(default)]
    pub exclude_voice: Option<String>,
    #[serde(default)]
    pub force_regenerate: Option<bool>,
}

#[derive(Serialize)]
pub struct SynthesizeSpeechResponse {
    pub audio_url: String,
    pub voice_name: String,
    pub from_cache: bool,
}

#[derive(Deserialize)]
pub struct GenerateImageBody {
    pub category: String,
    pub deck: String,
    pub index: usize,
    pub def_index: usize,
    pub prompt: String,
    pub meaning: Option<String>,
    pub usage_example: Option<String>,
    #[serde(default)]
    pub usage_context: Option<String>,
    #[serde(default)]
    pub alternative_example: Option<String>,
    #[serde(default)]
    pub force_generation: bool,
    #[serde(default)]
    pub form: Option<String>,
    #[serde(default)]
    pub legacy_image_path: Option<String>,
    /// Demo landing: complemento visual opcional (no sustituye usage_example).
    #[serde(default)]
    pub scene_complement: Option<String>,
}

#[derive(Serialize)]
pub struct GenerateImageResponse {
    pub path: String,
}

#[derive(Deserialize)]
pub struct ResolveImageBody {
    pub category: String,
    pub deck: String,
    pub index: usize,
    pub def_index: usize,
    #[serde(default)]
    pub form: Option<String>,
}

#[derive(Deserialize)]
pub struct DeleteAudioBody {
    pub category: String,
    pub deck: String,
    pub text: String,
    pub voice_name: String,
    pub verb_name: Option<String>,
    pub tone: Option<String>,
    pub lang: Option<String>,
    #[serde(default)]
    pub exclude_voice: Option<String>,
}

#[derive(Deserialize)]
pub struct DeleteImageBody {
    pub category: String,
    pub deck: String,
    pub index: usize,
    pub def_index: usize,
    #[serde(default)]
    pub form: Option<String>,
}
