use anyhow::{anyhow, Context, Result};
/// Proveedor Gemini via gRPC binario (protobuf) en vez de REST/JSON.
///
/// Ventajas vs REST:
///   - Payload ~40 % menor (binario vs texto JSON)
///   - HTTP/2 multiplexado: múltiples llamadas comparten un TLS session
///   - Sin overhead de parse/serialización JSON en CPU
///   - Un único `Channel` reutilizado en toda la vida del proceso
///
/// Los tipos proto se definen con `prost::Message` inline — sin protoc ni build.rs.
use async_trait::async_trait;
use std::time::Duration;
use tonic::transport::{Channel, ClientTlsConfig, Uri};
use tonic::Request;

use crate::config::Settings;
use crate::domain::repositories::tutor::AITutor;

// ─────────────────────────────────────────────────────────────────────────────
// Tipos protobuf inline (equivalentes al .proto de la API v1beta de Gemini)
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Clone, PartialEq, ::prost::Message)]
struct GeminiRequest {
    /// "models/gemini-3.1-flash-lite"
    #[prost(string, tag = "1")]
    model: String,
    #[prost(message, optional, tag = "8")]
    system_instruction: Option<GeminiContent>,
    #[prost(message, repeated, tag = "2")]
    contents: Vec<GeminiContent>,
    #[prost(message, optional, tag = "4")]
    generation_config: Option<GeminiGenerationConfig>,
}

#[derive(Clone, PartialEq, ::prost::Message)]
struct GeminiContent {
    #[prost(message, repeated, tag = "1")]
    parts: Vec<GeminiPart>,
    #[prost(string, tag = "2")]
    role: String,
}

#[derive(Clone, PartialEq, ::prost::Message)]
struct GeminiPart {
    #[prost(string, optional, tag = "2")]
    text: Option<String>,
}

#[derive(Clone, PartialEq, ::prost::Message)]
struct GeminiGenerationConfig {
    #[prost(float, optional, tag = "4")]
    temperature: Option<f32>,
    #[prost(int32, optional, tag = "5")]
    max_output_tokens: Option<i32>,
    #[prost(string, optional, tag = "13")]
    response_mime_type: Option<String>,
}

#[derive(Clone, PartialEq, ::prost::Message)]
struct GeminiResponse {
    #[prost(message, repeated, tag = "1")]
    candidates: Vec<GeminiCandidate>,
}

#[derive(Clone, PartialEq, ::prost::Message)]
struct GeminiCandidate {
    #[prost(message, optional, tag = "1")]
    content: Option<GeminiContent>,
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────────────────────────

pub struct GeminiGrpcProvider {
    /// Channel reutilizado: HTTP/2 multiplexado, TLS session persistente.
    channel: Channel,
    api_key: String,
}

impl GeminiGrpcProvider {
    pub fn new(settings: &Settings) -> Result<Self> {
        let api_key = settings
            .gemini_api_key
            .clone()
            .unwrap_or_else(|| "DISABLED".to_string());

        let uri = Uri::from_static("https://generativelanguage.googleapis.com");
        let tls = ClientTlsConfig::new().with_native_roots();

        let channel = Channel::builder(uri)
            .tls_config(tls)?
            // Keep-alive para mantener el TLS session caliente entre peticiones
            .http2_keep_alive_interval(Duration::from_secs(30))
            .keep_alive_timeout(Duration::from_secs(10))
            .keep_alive_while_idle(true)
            // Timeout por RPC individual
            .timeout(Duration::from_secs(90))
            .connect_lazy(); // no conecta hasta la primera llamada → 0 RAM en startup

        Ok(Self { channel, api_key })
    }

    async fn call(
        &self,
        system: &str,
        user: &str,
        temperature: f32,
        model: &str,
        mime: Option<&str>,
    ) -> Result<String> {
        use tonic::codec::ProstCodec;

        let request = GeminiRequest {
            model: format!("models/{}", model),
            system_instruction: Some(GeminiContent {
                role: "".into(),
                parts: vec![GeminiPart {
                    text: Some(system.into()),
                }],
            }),
            contents: vec![GeminiContent {
                role: "user".into(),
                parts: vec![GeminiPart {
                    text: Some(user.into()),
                }],
            }],
            generation_config: Some(GeminiGenerationConfig {
                temperature: Some(temperature),
                max_output_tokens: Some(1024),
                response_mime_type: mime.map(Into::into),
            }),
        };

        // Gemini solo acepta API key (no OAuth de service account de deploy).
        // Siempre usamos x-goog-api-key para evitar fallos de permisos en prod.
        let mut tonic_req = Request::new(request);
        tonic_req.metadata_mut().insert(
            "x-goog-api-key",
            self.api_key.parse().context("API key Gemini inválida")?,
        );

        let path = http::uri::PathAndQuery::from_static(
            "/google.ai.generativelanguage.v1beta.GenerativeService/GenerateContent",
        );
        let codec = ProstCodec::<GeminiRequest, GeminiResponse>::default();

        let mut grpc = tonic::client::Grpc::new(self.channel.clone());
        grpc.ready()
            .await
            .map_err(|e| anyhow!("Canal Gemini gRPC no listo: {}", e))?;

        let resp = grpc
            .unary(tonic_req, path, codec)
            .await
            .map_err(|s| anyhow!("Gemini gRPC error {}: {}", s.code(), s.message()))?;

        let candidate = resp
            .into_inner()
            .candidates
            .into_iter()
            .next()
            .context("Gemini: sin candidatos en respuesta")?;

        let text = candidate
            .content
            .and_then(|c| c.parts.into_iter().next())
            .and_then(|p| p.text)
            .context("Gemini: texto vacío en respuesta")?;

        Ok(text)
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Trait impl (idéntico al gemini_provider.rs anterior)
// ─────────────────────────────────────────────────────────────────────────────

#[async_trait]
impl AITutor for GeminiGrpcProvider {
    async fn analyze_error(
        &self,
        user_input: &str,
        correct_answer: &str,
        context_spanish: &str,
    ) -> Result<String> {
        if self.api_key == "DISABLED" {
            return Ok(r#"{"is_correct":false,"explanation":"La IA del sistema está desactivada.","error_code":"ai_disabled"}"#.to_string());
        }
        let system = r#"Eres un TUTOR DE INGLÉS experto. Valida si la frase del alumno es GRAMATICALMENTE CORRECTA.
RESPONDE EXCLUSIVAMENTE EN ESTE FORMATO JSON:
{"is_correct":true/false,"explanation":"máx 25 palabras en español","error_code":"slug_en_ingles"}"#;

        let user = format!(
            "Frase en Español: \"{}\"\nIntento: \"{}\"\nModelo: \"{}\"",
            context_spanish, user_input, correct_answer
        );
        self.call(
            system,
            &user,
            0.1,
            "gemini-3.1-flash-lite",
            Some("application/json"),
        )
        .await
    }

    async fn explain_like_child(
        &self,
        user_input: &str,
        correct_answer: &str,
        context_spanish: &str,
        original_explanation: Option<&str>,
    ) -> Result<String> {
        if self.api_key == "DISABLED" {
            return Ok("La IA está desactivada.".to_string());
        }
        let system = r#"Eres un TUTOR DE INGLÉS EMPÁTICO. Usa ELI5 sin términos técnicos, máx 70 palabras, texto plano."#;
        let mut user = format!(
            "Situación: '{}'\nEscribió: '{}'\nCorrecto: '{}'",
            context_spanish, user_input, correct_answer
        );
        if let Some(exp) = original_explanation {
            user.push_str(&format!("\nExplicación previa: '{}'", exp));
        }
        self.call(system, &user, 0.7, "gemini-3.1-flash-lite", None)
            .await
    }

    async fn improve_visual_prompts_batch(
        &self,
        story_data: &serde_json::Value,
        context: &str,
    ) -> Result<Vec<String>> {
        if self.api_key == "DISABLED" {
            return Ok(vec![]);
        }
        let system =
            r#"Eres un PROMPT ENGINEER para FLUX 2. Sin texto en imágenes. JSON array de strings."#;
        let user = format!("Contexto: {}\nPasos:\n{}", context, story_data);
        let raw = self
            .call(
                system,
                &user,
                0.2,
                "gemini-3.1-flash-lite",
                Some("application/json"),
            )
            .await?;
        serde_json::from_str(&raw).context("Error parseando JSON de prompts visuales")
    }

    async fn improve_prompt_for_image(
        &self,
        phrase: &str,
        pos_category: &str,
        meaning: Option<&str>,
        usage_example: Option<&str>,
    ) -> Result<String> {
        if self.api_key == "DISABLED" {
            return Ok(phrase.to_string());
        }
        let system = r#"You are a "Real-Life Context" Visual Prompt Engineer for FLUX 2.

INPUT FORMAT (always provided):
WORD/PHRASE: [word]
POS/CATEGORY: [category]
MEANING: [meaning]
EXAMPLE: [example sentence]

STEP 0 — SELECT VISUAL STRATEGY based on POS/CATEGORY:
- nouns (concrete)  -> show the object in natural human use (hands, body, setting)
- nouns (abstract)  -> show a scene that EMBODIES the concept emotionally
- verbs             -> freeze the person MID-ACTION — not before, not after
- adjectives        -> use contrast or an extreme example to make the quality unmistakable
- adverbs           -> show someone doing an action in that specific WAY
- pronouns/possessives -> The word has NO visual meaning alone. You MUST show PEOPLE and their RELATIONSHIP to the object:
                     1st person (my, our) = owners IN frame, seen from behind or reaching for it
                     2nd person (you, your) = subject looks directly at camera
                     3rd person (his, her, their) = owners OBSERVED from outside, at a distance
- prepositions      -> make the spatial/relational concept the visual star
- articles          -> show specificity (the) vs generality (a) through selection/pointing

If the POS is not perfectly matched by the category, infer the best visual strategy.

STEP 1 — BRAINSTORM: What is the most common, everyday slice-of-life scenario using the strategy above?
STEP 2 — DESCRIBE: Write a candid, unposed photograph description.
- Focus on EXPRESSIONS, authentic DETAILS (messy rooms, real textures), and realistic lighting.
- Avoid studio perfection. Look like a candid documentary shot.
- Absolutely NO TEXT, words, signs, or labels in the image.

Output ONLY the final scene description (60-85 words) in English."#;

        let mut user = format!(
            "WORD/PHRASE: \"{}\"\nPOS/CATEGORY: \"{}\"",
            phrase, pos_category
        );
        if let Some(m) = meaning {
            user.push_str(&format!("\nMEANING: \"{}\"", m));
        }
        if let Some(u) = usage_example {
            user.push_str(&format!("\nEXAMPLE: \"{}\"", u));
        }
        self.call(system, &user, 0.5, "gemini-3.1-flash-lite", None)
            .await
    }

    async fn improve_prompt_for_landing_demo_image(
        &self,
        phrase: &str,
        pos_category: &str,
        meaning: Option<&str>,
        usage_example: Option<&str>,
        _scene_complement: Option<&str>,
    ) -> Result<String> {
        if self.api_key == "DISABLED" {
            return Ok(phrase.to_string());
        }
        #[cfg(feature = "flashcards")]
        {
            use mod_flashcards::landing_demo_image_prompt::{
                build_complement_mode_user_message, build_gemini_user_message_with_complement,
                gemini_system_for_landing, GEMINI_SYSTEM_COMPLEMENT_MODE,
            };

            if let Some(comp) = _scene_complement.map(str::trim).filter(|s| !s.is_empty()) {
                let example = usage_example.filter(|s| !s.is_empty()).unwrap_or(phrase);
                let user = build_complement_mode_user_message(example, meaning, comp);
                return self
                    .call(
                        GEMINI_SYSTEM_COMPLEMENT_MODE,
                        &user,
                        0.35,
                        "gemini-3.1-flash-lite",
                        None,
                    )
                    .await;
            }

            let user = build_gemini_user_message_with_complement(
                phrase,
                pos_category,
                meaning,
                usage_example,
                _scene_complement,
            );
            let system = gemini_system_for_landing(_scene_complement);
            return self
                .call(&system, &user, 0.5, "gemini-3.1-flash-lite", None)
                .await;
        }
        #[cfg(not(feature = "flashcards"))]
        {
            self.improve_prompt_for_image(phrase, pos_category, meaning, usage_example)
                .await
        }
    }

    async fn refine_audio_ssml(&self, text: &str, tone: &str) -> Result<String> {
        if self.api_key == "DISABLED" {
            return Ok(format!("<speak>{}</speak>", text));
        }
        let system = r#"Speech Synthesis Engineer. Solo responde con SSML <speak>...</speak>. Usa el texto EXACTO, sin añadir palabras."#;
        let user = format!("Text: \"{}\"\nTone: \"{}\"", text, tone);
        self.call(system, &user, 0.5, "gemini-3.1-flash-lite", None)
            .await
    }

    async fn guide_onboarding_step(
        &self,
        locale: &str,
        step_id: &str,
        step_index: u32,
        step_total: u32,
        event: &str,
        target_label: &str,
        target_hint: &str,
        wrong_target_label: Option<&str>,
        user_name: Option<&str>,
        ui_state: Option<&str>,
    ) -> Result<String> {
        if self.api_key == "DISABLED" {
            return Ok(format!(
                r#"{{"message":"{}"}}"#,
                target_hint.replace('"', "\\\"")
            ));
        }

        let language_rule = if locale == "es" {
            "Responde SIEMPRE en español claro, motivador y conciso."
        } else {
            "Always respond in clear, motivating, concise English."
        };

        let greeting = user_name
            .map(|name| {
                format!("Saluda al usuario por su nombre ({name}) solo en event=enter y paso 1.")
            })
            .unwrap_or_default();

        let system = format!(
            r#"Eres Gemini actuando como agente de navegación inteligente dentro de Fluency, módulo Flashcards.

IDENTIFICACIÓN HTML (ignora clases CSS decorativas):
- data-tour: nombre del componente en el mapa (menu-hamburguesa, categoria-item, boton-voltear-tarjeta…)
- data-categoria: categoría gramatical (pronombres, verbos…)
- aria-expanded / aria-current: estado de menús y selección
- ui_state.visible_targets: elementos visibles que el usuario puede tocar ahora

REGLAS:
1. Usa ui_state y visible_targets para explicar la acción correcta como si estuvieras mirando la pantalla.
2. El frontend ya marca el target correcto; tú solo dices qué hacer y por qué, sin repetir textos técnicos.
3. Si el paso abre navegación, explica cuál opción debe marcar/cargar y cómo reconocerla.
4. Solo sugiere acciones sobre el target_hint actual; no saltes pasos.
5. No copies literalmente target_label ni target_hint; son contexto para entender la navegación.
6. Si event=element_missing, advierte que el elemento aún no está en pantalla.
7. Si event=state_timeout, indica que la vista no cambió y repite la acción esperada.
8. Si event=wrong_tap, corrige señalando el elemento correcto en lenguaje natural.
9. Máximo 55 palabras en "message". Tono claro, práctico y natural.
{language_rule}
{greeting}
RESPONDE SOLO JSON: {{"message":"..."}}"#,
        );

        let mut user = format!(
            "step_id={}\nstep={}/{}\nevent={}\ntarget_label={}\ntarget_hint={}",
            step_id, step_index, step_total, event, target_label, target_hint
        );
        if let Some(wrong) = wrong_target_label {
            user.push_str(&format!("\nwrong_target_label={}", wrong));
        }
        if let Some(state) = ui_state {
            user.push_str(&format!("\nui_state={}", state));
        }

        self.call(
            &system,
            &user,
            if event == "wrong_tap" || event == "state_timeout" {
                0.35
            } else {
                0.5
            },
            "gemini-3.1-flash-lite",
            Some("application/json"),
        )
        .await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_gemini_provider() {
        let settings = Settings::from_env().unwrap();
        if settings.gemini_api_key.is_none()
            || settings.gemini_api_key.as_deref() == Some("DISABLED")
        {
            println!("Saltando test de Gemini porque no hay API Key configurada.");
            return;
        }
        let provider = GeminiGrpcProvider::new(&settings).unwrap();
        let res = provider
            .analyze_error("I goes to school", "I go to school", "Yo voy a la escuela")
            .await;
        println!("Resultado de prueba de Gemini: {:?}", res);
        assert!(res.is_ok(), "Error llamando a Gemini: {:?}", res.err());
        let response_text = res.unwrap();
        assert!(
            response_text.contains("is_correct"),
            "Respuesta inesperada: {}",
            response_text
        );
    }

    #[tokio::test]
    async fn test_gemini_hola() {
        let settings = Settings::from_env().unwrap();
        if settings.gemini_api_key.is_none()
            || settings.gemini_api_key.as_deref() == Some("DISABLED")
        {
            println!("Saltando test de Gemini porque no hay API Key configurada.");
            return;
        }
        let provider = GeminiGrpcProvider::new(&settings).unwrap();
        let res = provider
            .call(
                "Eres un asistente de IA muy amigable y hablas español.",
                "Hola, ¿cómo estás?",
                0.7,
                "gemini-3.1-flash-lite",
                None,
            )
            .await;
        println!("Respuesta de Gemini al saludo: {:?}", res);
        assert!(res.is_ok(), "Error enviando saludo: {:?}", res.err());
    }

    #[tokio::test]
    async fn test_gemini_hora() {
        let settings = Settings::from_env().unwrap();
        if settings.gemini_api_key.is_none()
            || settings.gemini_api_key.as_deref() == Some("DISABLED")
        {
            println!("Saltando test de Gemini porque no hay API Key configurada.");
            return;
        }
        let provider = GeminiGrpcProvider::new(&settings).unwrap();
        let prompt = "Dime qué hora es. Como contexto, mi hora local actual es 18:10 (6:10 PM) del 10 de junio de 2026.";
        let res = provider.call("Eres un asistente servicial y respondes de forma natural indicando la hora que te provee el usuario.", prompt, 0.7, "gemini-3.1-flash-lite", None).await;
        println!("Respuesta de Gemini sobre la hora: {:?}", res);
        assert!(res.is_ok(), "Error consultando la hora: {:?}", res.err());
    }
}
