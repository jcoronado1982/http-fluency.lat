/// Proveedor Google TTS via gRPC binario.
///
/// El endpoint gRPC de Cloud TTS es texttospeech.googleapis.com:443.
/// Ventaja vs REST:
///   - Audio OGG llega como bytes directamente en el mensaje proto (sin base64)
///   - base64 REST añade ~33% overhead de payload y CPU para decode
///   - HTTP/2 con TLS session persistente entre síntesis consecutivas
use async_trait::async_trait;
use anyhow::{anyhow, Context, Result};
use std::time::Duration;
use tonic::transport::{Channel, ClientTlsConfig, Uri};
use tonic::Request;

use crate::config::Settings;
use crate::domain::repositories::audio::AudioGenerator;

// ─────────────────────────────────────────────────────────────────────────────
// Tipos protobuf inline  (google.cloud.texttospeech.v1)
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Clone, PartialEq, ::prost::Message)]
struct TtsSynthRequest {
    #[prost(message, optional, tag = "1")]
    input: Option<TtsSynthInput>,
    #[prost(message, optional, tag = "2")]
    voice: Option<TtsVoiceParams>,
    #[prost(message, optional, tag = "3")]
    audio_config: Option<TtsAudioConfig>,
}

#[derive(Clone, PartialEq, ::prost::Message)]
struct TtsSynthInput {
    /// oneof input_source: text=1 | ssml=2
    #[prost(string, optional, tag = "1")]
    text: Option<String>,
    #[prost(string, optional, tag = "2")]
    ssml: Option<String>,
}

#[derive(Clone, PartialEq, ::prost::Message)]
struct TtsVoiceParams {
    #[prost(string, tag = "1")]
    language_code: String,
    #[prost(string, tag = "2")]
    name: String,
}

#[derive(Clone, PartialEq, ::prost::Message)]
struct TtsAudioConfig {
    /// OGG_OPUS = 3
    #[prost(int32, tag = "1")]
    audio_encoding: i32,
}

#[derive(Clone, PartialEq, ::prost::Message)]
struct TtsSynthResponse {
    /// Audio binario directo — sin base64, sin CPU de decode
    #[prost(bytes = "vec", tag = "1")]
    audio_content: Vec<u8>,
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────────────────────────

pub struct TtsGrpcProvider {
    channel: Channel,
    api_key: Option<String>,
}

impl TtsGrpcProvider {
    pub async fn new(settings: &Settings) -> Result<Self> {
        let uri = Uri::from_static("https://texttospeech.googleapis.com");
        let tls = ClientTlsConfig::new().with_native_roots();

        let channel = Channel::builder(uri)
            .tls_config(tls)?
            .http2_keep_alive_interval(Duration::from_secs(30))
            .keep_alive_timeout(Duration::from_secs(10))
            .keep_alive_while_idle(true)
            .timeout(Duration::from_secs(45))
            .connect_lazy();

        // Preferir GCP_API_KEY (unrestricted) sobre GEMINI_API_KEY (restringida a AI Studio)
        let api_key = settings.gcp_api_key.clone().or_else(|| settings.gemini_api_key.clone());

        Ok(Self {
            channel,
            api_key,
        })
    }

    fn map_voice(voice_name: &str) -> &'static str {
        match voice_name {
            "Aoede" | "Callirrhoe" | "Gacrux" => "en-US-Standard-C",
            "Zephyr" | "Iapetus" | "Achernar" => "en-US-Standard-B",
            "Charon" => "en-US-Standard-D",
            _ => "en-US-Standard-A",
        }
    }

    async fn synthesize_raw(&self, input: TtsSynthInput, voice_name: &str) -> Result<Vec<u8>> {
        use tonic::codec::ProstCodec;
        use tonic::Code;

        let proto_req = TtsSynthRequest {
            input: Some(input),
            voice: Some(TtsVoiceParams {
                language_code: "en-US".into(),
                name: Self::map_voice(voice_name).into(),
            }),
            audio_config: Some(TtsAudioConfig {
                audio_encoding: 3, // OGG_OPUS
            }),
        };

        let path = http::uri::PathAndQuery::from_static(
            "/google.cloud.texttospeech.v1.TextToSpeech/SynthesizeSpeech",
        );

        // Intento 1: OAuth (si hay GOOGLE_APPLICATION_CREDENTIALS)
        let oauth_result = if let Ok(Some(token)) = self.get_oauth_token().await {
            let mut req = Request::new(proto_req.clone());
            if let Ok(meta) = format!("Bearer {}", token).parse() {
                req.metadata_mut().insert("authorization", meta);
                let mut grpc = tonic::client::Grpc::new(self.channel.clone());
                grpc.ready().await.ok();
                let r = grpc.unary(req, path.clone(), ProstCodec::<TtsSynthRequest, TtsSynthResponse>::default()).await;
                match r {
                    // Auth exitoso
                    Ok(resp) => Some(Ok(resp.into_inner().audio_content)),
                    // Error de permisos: la clave de deploy no tiene TTS habilitado → fallback
                    Err(ref s) if matches!(s.code(), Code::Unauthenticated | Code::PermissionDenied) => {
                        tracing::warn!("⚠️ TTS OAuth sin permisos TTS ({}), usando API key como fallback", s.code());
                        None
                    }
                    // Otro error real
                    Err(s) => Some(Err(anyhow!("TTS gRPC (OAuth) error {}: {}", s.code(), s.message()))),
                }
            } else { None }
        } else { None };

        // Si OAuth tuvo éxito o falló con error no-auth, retorna aquí
        if let Some(result) = oauth_result {
            let bytes = result?;
            if bytes.is_empty() { return Err(anyhow!("TTS: audio vacío (OAuth)")); }
            return Ok(bytes);
        }

        // Intento 2: API key
        let api_key = self.api_key.as_ref()
            .context("TTS: ni OAuth (con permisos) ni API key disponibles")?;

        let mut req = Request::new(proto_req);
        req.metadata_mut().insert(
            "x-goog-api-key",
            api_key.parse().context("API key TTS inválida")?,
        );

        let mut grpc = tonic::client::Grpc::new(self.channel.clone());
        grpc.ready().await.map_err(|e| anyhow!("Canal TTS gRPC no listo: {}", e))?;

        let resp = grpc.unary(req, path, ProstCodec::<TtsSynthRequest, TtsSynthResponse>::default()).await
            .map_err(|s| anyhow!("TTS gRPC (API key) error {}: {}", s.code(), s.message()))?;

        let bytes = resp.into_inner().audio_content;
        if bytes.is_empty() { return Err(anyhow!("TTS: audio vacío (API key)")); }
        Ok(bytes)
    }

    async fn get_oauth_token(&self) -> Result<Option<String>> {
        // En Cloud Run, gcp_auth usa automáticamente el metadata server (no necesita archivo).
        // En local con GOOGLE_APPLICATION_CREDENTIALS, usa el service account key.
        // Si no hay ningún mecanismo disponible, retorna None para usar API key como fallback.
        match gcp_auth::provider().await {
            Ok(provider) => {
                match provider.token(&["https://www.googleapis.com/auth/cloud-platform"]).await {
                    Ok(token) => Ok(Some(token.as_str().to_string())),
                    Err(e) => {
                        tracing::debug!("TTS: no se pudo obtener token OAuth: {}", e);
                        Ok(None)
                    }
                }
            }
            Err(e) => {
                tracing::debug!("TTS: gcp_auth provider no disponible: {}", e);
                Ok(None)
            }
        }
    }
}

#[async_trait]
impl AudioGenerator for TtsGrpcProvider {
    async fn synthesize(&self, text: &str, voice_name: &str) -> Result<Vec<u8>> {
        self.synthesize_raw(TtsSynthInput { text: Some(text.into()), ssml: None }, voice_name).await
    }

    async fn synthesize_ssml(&self, ssml: &str, voice_name: &str) -> Result<Vec<u8>> {
        self.synthesize_raw(TtsSynthInput { text: None, ssml: Some(ssml.into()) }, voice_name).await
    }
}
