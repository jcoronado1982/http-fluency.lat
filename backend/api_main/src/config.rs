use dotenvy::dotenv;
use serde::Deserialize;
use std::env;

#[derive(Debug, Clone, Deserialize)]
pub struct Settings {
    pub project_id: String,
    pub region: String,
    pub gcs_json_prefix: String,
    pub gcs_images_prefix: String,
    pub gcs_audio_prefix: String,
    pub database_url: String,
    pub gemini_api_key: Option<String>,
    /// Activa generación de imágenes (Gemini prompt + ComfyUI). Default: true si hay GEMINI_API_KEY.
    pub image_ai_enabled: bool,
    /// Clave AI Studio solo para Gemini TTS (inglés). Si falta, cae en gemini_api_key.
    pub gemini_tts_api_key: Option<String>,
    /// Respaldo TTS solo para `--batch-gen-audio` local (`GeminiTtsProvider::new_for_batch`).
    /// No se usa en producción ni en el API HTTP.
    pub gemini_tts_api_key_backup: Option<String>,
    /// API key de Google Cloud Platform con permiso para Text-to-Speech.
    /// Si no se define, se usa gemini_api_key como fallback.
    pub gcp_api_key: Option<String>,
    pub comfy_url: String,
    pub local_storage_path: String,
    pub sync_to_oracle: bool,
    pub oracle_repository_only: bool,
    pub oracle_host: String,
    pub oracle_ssh_password: String,
    pub oracle_remote_path: String,
    /// Public base URL used to build absolute URLs for stored assets (e.g. story images).
    pub public_base_url: String,
    /// ElevenLabs — solo TTS del landing demo (`landing-demo`).
    pub elevenlabs_api_key: Option<String>,
    pub elevenlabs_model_id: Option<String>,
}

impl Settings {
    pub fn from_env() -> anyhow::Result<Self> {
        dotenv().ok();

        let gemini_api_key = env::var("GEMINI_API_KEY").ok();
        let image_ai_enabled = env::var("IMAGE_AI_ENABLED")
            .unwrap_or_else(|_| "true".to_string())
            .parse::<bool>()
            .unwrap_or(true);

        let settings = Settings {
            project_id: env::var("PROJECT_ID").unwrap_or_else(|_| "xrubi-fd22e".to_string()),
            region: env::var("REGION").unwrap_or_else(|_| "us-east1".to_string()),
            gcs_json_prefix: env::var("GCS_JSON_PREFIX").unwrap_or_else(|_| "json".to_string()),
            gcs_images_prefix: env::var("GCS_IMAGES_PREFIX")
                .unwrap_or_else(|_| "card_images".to_string()),
            gcs_audio_prefix: env::var("GCS_AUDIO_PREFIX")
                .unwrap_or_else(|_| "card_audio".to_string()),
            database_url: env::var("DATABASE_URL").unwrap_or_else(|_| {
                "postgresql://postgres:postgres@localhost:5432/flashcard_db".to_string()
            }),
            gemini_api_key: gemini_api_key.clone(),
            image_ai_enabled: image_ai_enabled
                && gemini_api_key
                    .as_deref()
                    .map(|k| !k.is_empty() && k != "DISABLED")
                    .unwrap_or(false),
            gemini_tts_api_key: env::var("GEMINI_TTS_API_KEY").ok(),
            gemini_tts_api_key_backup: env::var("GEMINI_TTS_API_KEY_BACKUP").ok(),
            gcp_api_key: env::var("GCP_API_KEY").ok(),
            comfy_url: env::var("COMFY_URL")
                .unwrap_or_else(|_| "http://localhost:8188".to_string()),
            local_storage_path: env::var("LOCAL_STORAGE_PATH").unwrap_or_else(|_| ".".to_string()),
            sync_to_oracle: env::var("SYNC_TO_ORACLE")
                .unwrap_or_else(|_| "false".to_string())
                .parse::<bool>()
                .unwrap_or(false),
            oracle_repository_only: env::var("ORACLE_REPOSITORY_ONLY")
                .unwrap_or_else(|_| "true".to_string())
                .parse::<bool>()
                .unwrap_or(true),
            oracle_host: env::var("ORACLE_HOST").unwrap_or_else(|_| "157.151.199.170".to_string()),
            oracle_ssh_password: env::var("ORACLE_SSH_PASSWORD").unwrap_or_else(|_| "".to_string()),
            oracle_remote_path: env::var("ORACLE_REMOTE_PATH")
                .unwrap_or_else(|_| "/root/smart-proxy/repository/flashcard".to_string()),
            public_base_url: env::var("PUBLIC_BASE_URL")
                .unwrap_or_else(|_| "https://fluency.lat".to_string()),
            elevenlabs_api_key: env::var("ELEVENLABS_API_KEY").ok(),
            elevenlabs_model_id: env::var("ELEVENLABS_MODEL_ID").ok(),
        };

        Ok(settings)
    }
}
