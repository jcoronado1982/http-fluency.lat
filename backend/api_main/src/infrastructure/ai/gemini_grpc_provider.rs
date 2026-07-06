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
use serde::Deserialize;
use std::time::Duration;
use tonic::transport::{Channel, ClientTlsConfig, Uri};
use tonic::Request;
use tracing::{debug, info, warn};

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

#[derive(Deserialize)]
struct OllamaChatResponse {
    message: OllamaMessage,
}

#[derive(Deserialize)]
struct OllamaMessage {
    #[serde(default)]
    content: String,
    #[serde(default)]
    thinking: String,
}

fn clean_ollama_prompt_output(text: &str) -> String {
    let mut cleaned = text.trim();
    if let Some((_, after_thinking)) = cleaned.rsplit_once("</think>") {
        cleaned = after_thinking.trim();
    }

    let lowered = cleaned.to_ascii_lowercase();
    if lowered.ends_with(" words)") {
        if let Some(start) = cleaned.rfind('(') {
            let suffix = &lowered[start..];
            let count = suffix
                .trim_start_matches('(')
                .trim_end_matches(" words)")
                .trim();
            if !count.is_empty() && count.chars().all(|c| c.is_ascii_digit()) {
                cleaned = cleaned[..start].trim_end();
            }
        }
    }

    cleaned.to_string()
}

fn preview_for_log(text: &str, max_chars: usize) -> String {
    let compact = text.split_whitespace().collect::<Vec<_>>().join(" ");
    let mut preview = String::new();
    for ch in compact.chars().take(max_chars) {
        preview.push(ch);
    }
    if compact.chars().count() > max_chars {
        preview.push_str("...");
    }
    preview
}

const FLASHCARD_TARGET_WIDTH: u32 = 896;
const FLASHCARD_TARGET_HEIGHT: u32 = 512;

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
            // Timeout por RPC individual.
            // Mantenerlo por encima del timeout global del backend.
            .timeout(Duration::from_secs(180))
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

    async fn call_ollama_prompt_llm(
        &self,
        system: &str,
        user: &str,
        temperature: f32,
    ) -> Result<String> {
        let url = std::env::var("OLLAMA_URL").unwrap_or_else(|_| "http://127.0.0.1:11434".into());
        let model = std::env::var("OLLAMA_PROMPT_MODEL").unwrap_or_else(|_| "qwen3.5:9b".into());
        let endpoint = format!("{}/api/chat", url.trim_end_matches('/'));
        let request_started_at = std::time::Instant::now();
        info!(
            model = %model,
            temperature,
            system_len = system.len(),
            user_len = user.len(),
            system_preview = %preview_for_log(system, 140),
            user_preview = %preview_for_log(user, 220),
            "prompt-llm:ollama-start"
        );
        let response = reqwest::Client::new()
            .post(endpoint)
            .timeout(Duration::from_secs(180))
            .json(&serde_json::json!({
                "model": model,
                "stream": false,
                "think": false,
                "options": {
                    "temperature": temperature,
                    "num_ctx": 4096,
                    "num_predict": 720
                },
                "messages": [
                    { "role": "system", "content": system },
                    { "role": "user", "content": user }
                ]
            }))
            .send()
            .await
            .context("Ollama prompt LLM request failed")?;

        info!(
            model = %model,
            elapsed_ms = request_started_at.elapsed().as_millis() as u64,
            "prompt-llm:ollama-http-ok"
        );

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            warn!(
                model = %model,
                status = %status,
                response_preview = %preview_for_log(&body, 240),
                elapsed_ms = request_started_at.elapsed().as_millis() as u64,
                "prompt-llm:ollama-http-error"
            );
            return Err(anyhow!("Ollama prompt LLM error {status}: {body}"));
        }

        let parsed: OllamaChatResponse = response
            .json()
            .await
            .context("Ollama prompt LLM returned invalid JSON")?;
        let mut text = clean_ollama_prompt_output(&parsed.message.content);
        if text.is_empty() && !parsed.message.thinking.trim().is_empty() {
            debug!("prompt-llm:ollama-fallback-thinking");
            text = clean_ollama_prompt_output(&parsed.message.thinking);
        }
        if text.is_empty() {
            warn!(
                model = %model,
                content_len = parsed.message.content.len(),
                thinking_len = parsed.message.thinking.len(),
                elapsed_ms = request_started_at.elapsed().as_millis() as u64,
                "prompt-llm:ollama-empty"
            );
            return Err(anyhow!("Ollama prompt LLM returned empty content"));
        }
        info!(
            model = %model,
            output_len = text.len(),
            output_preview = %preview_for_log(&text, 220),
            total_elapsed_ms = request_started_at.elapsed().as_millis() as u64,
            "prompt-llm:ollama-ok"
        );
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
        let system = r#"You are a "Real-Life Context" Visual Prompt Engineer for FLUX 2.

INPUT FORMAT (always provided):
WORD/PHRASE: [word]
POS/CATEGORY: [category]
MEANING: [meaning]
CONTEXT_TYPE: [usage context, if present]
SUPPORTING_EXAMPLE: [second example, if present]
EXAMPLE: [example sentence]
OUTPUT MEDIUM: English-learning flashcard image
FINAL CANVAS: 896x512 pixels, wide landscape orientation
COMPOSITION GOAL: immediately understandable at small card size
TEACHING GOAL: the image must explain the target meaning by itself, before the learner reads the sentence

STEP 0 — SELECT VISUAL STRATEGY based on POS/CATEGORY:
- nouns (concrete)  -> make the object the clear visual subject, in natural daily use
- nouns (abstract)  -> show a simple everyday situation that EMBODIES the concept
- verbs             -> make the target action, state, change, or event visually obvious. Do not show people merely sitting, posing, or talking unless the verb meaning is communication.
- multi-word verbs, phrasal verbs, idioms, and full example sentences -> identify the core teachable meaning from MEANING and EXAMPLE first, then visualize that meaning. Do not illustrate the words literally if the phrase means something else. Supporting events or objects may appear only as evidence for the target meaning, not as the main subject unless they are the target meaning.
- verbs of appearance/state (seem, appear, be) -> show visual evidence that leads to the impression or state; do not add random body parts or hidden people.
- adjectives        -> make the quality unmistakable through one clear subject or contrast
- adverbs           -> show someone doing an action in that specific WAY
- pronouns/possessives -> The word has NO visual meaning alone. You MUST show PEOPLE and their RELATIONSHIP to the object or action:
                     1st person (my, our) = owner(s) clearly IN frame, with hands, body position, gaze, or proximity showing ownership
                     2nd person (you, your) = the addressed person is visibly central, often facing the camera or receiving attention from another person
                     3rd person (his, her, their) = owner(s) observed from outside, with facial features, clothing, posture, and nearby object making the relationship clear
- prepositions      -> make the spatial/relational concept the visual star; the relative positions must be readable at a glance
- articles          -> show specificity (the) vs generality (a) through selection/pointing

If the POS is not perfectly matched by the category, infer the best visual strategy.

STEP 1 — BRAINSTORM: What is the most common, boring, everyday situation where a person would naturally use this exact phrase?
STEP 2 — PLAN INTERNALLY using this JSON-shaped checklist. Do not output the checklist.
{
  "CORE_EVENT": "the concrete physical action, event, state, relation, or absence actually being taught",
  "TRIGGER": "what starts, causes, reveals, or times the event; if CONTEXT_TYPE mentions timing, coincidence, surprise, absence, evidence, questions, or negation, the scene must visibly show that cue",
  "SUBJECT_STATE": "the person's visible physical or emotional state as a result of CORE_EVENT and TRIGGER"
}
STEP 3 — DESCRIBE: Write a candid, unposed photograph description that physically shows CORE_EVENT + TRIGGER + SUBJECT_STATE.
- Use the EXAMPLE as the main visual source when it exists; represent the phrase as it would appear in daily life, not as an abstract symbol, movie scene, disaster, or dramatic event.
- If MEANING includes usage context or a similar everyday example, use it to disambiguate the exact sense being taught.
- Before choosing the scene, name internally the single target idea being taught: object, action, state, relationship, quality, frequency, direction, time, cause, chance, absence, possession, or contrast. The final image must make that one idea visually dominant.
- The learner should understand the target idea from the image alone. Avoid generic social scenes where the target verb/action is not visible.
- Never default to two people sitting and talking seriously, a generic handshake, people looking at documents or laptops, or a static posed conversation unless the meaning is explicitly about conversation itself.
- Do not default to a living room, couch, sofa, neutral apartment, or generic indoor home scene unless the EXAMPLE clearly happens there. Prefer the most natural setting for the exact phrase: kitchen, bathroom, doorway, office, classroom, bus stop, sidewalk, store, restaurant, gym, park, car, street, yard, workplace, or other specific location.
- Vary the setting according to the phrase. If the same meaning can happen in multiple places, choose the place where the action becomes clearest instead of the safest indoor room.
- If the action is better understood outdoors, in transit, at work, or in a public place, choose that setting over a home interior.
- Include concrete people details: approximate age, face visibility, expression, gaze direction, posture, hand placement, clothing, and who owns or interacts with what.
- Include concrete environment details: room or street type, time of day, background objects, realistic surfaces, and lived-in imperfections.
- Compose for a WIDE horizontal frame. Keep the main subject large, central, and fully visible.
- Keep all essential faces, torsos, arms, hands, and legs completely inside frame. Never show isolated limbs, cropped half-people, or bodies cut by furniture or image borders.
- Keep critical story information inside the central 80% of the frame. Do not place key objects or people at the extreme left or right edges.
- Prefer one clear scene with 1-3 important subjects. Avoid clutter, tiny distant people, and overlapping bodies.
- If the sentence implies absence, emptiness, or uncertainty, show a believable empty scene with evidence of absence. Do not invent hidden people, body parts, or figures partially visible off-frame.
- Focus on EXPRESSIONS, authentic DETAILS (messy rooms, real textures), and realistic lighting.
- Facial expressions must be neutral by default. Only show obvious emotions like crying, laughter, fear, anger, or sadness if the sentence explicitly requires them.
- Avoid studio perfection. Look like a candid documentary shot.
- GEOMETRIC PLAUSIBILITY & LOGIC: Never place backgrounds, screens, blackboards, whiteboards, presentation slides, or other key setting elements behind the subjects if doing so violates the real-world logic or layout of the location. For example, in a movie theater, the screen is always in front of the audience, NEVER behind them. Do not describe the movie screen behind the audience's seats just to show it. Instead, show the audience facing forward in their theater seats, holding popcorn, and let the lighting, theater seats, and popcorn establish the cinema context. If the camera faces the subjects to capture their expressions, any background setting elements must either be omitted or shown from a plausible side angle, rather than physically impossible placements.
- Before writing the final answer, silently check: is this scene too generic, too indoor-by-default, or too similar to a couch/living-room stock photo? If yes, replace it with a more specific environment that better teaches the phrase.
- Absolutely NO TEXT, words, signs, or labels in the image.

Output exactly one line:
FINAL: one detailed final scene description (120-170 words) in English.
Do not include the internal checklist, word counts, explanations, markdown, or any other labels."#;

        let mut user = format!(
            "WORD/PHRASE: \"{}\"\nPOS/CATEGORY: \"{}\"\nOUTPUT MEDIUM: flashcard\nFINAL RESOLUTION: {}x{}\nFRAME: wide horizontal landscape\nREADABILITY: must remain clear at small card size\nTEACHING REQUIREMENT: image must communicate the target meaning without captions",
            phrase,
            pos_category,
            FLASHCARD_TARGET_WIDTH,
            FLASHCARD_TARGET_HEIGHT
        );
        if let Some(m) = meaning {
            if m.trim_start().starts_with("MEANING:") {
                user.push('\n');
                user.push_str(m);
            } else {
                user.push_str(&format!("\nMEANING: \"{}\"", m));
            }
        }
        if let Some(u) = usage_example {
            user.push_str(&format!("\nEXAMPLE: \"{}\"", u));
        }
        user.push_str(
            "\nSCENE RULES: choose a normal daily-life situation where someone would naturally use this sentence; make the target action/state/relation visible, not just implied by people talking.\nCOMPOSITION RULES: full bodies when people are visible; no cropped humans; no isolated limbs; main subject centered and large enough; avoid key details at image edges.",
        );

        let prompt_engine = std::env::var("FLASHCARD_PROMPT_ENGINE")
            .unwrap_or_else(|_| "ollama".to_string())
            .to_ascii_lowercase();

        if matches!(prompt_engine.as_str(), "ollama" | "qwen3") {
            info!(
                prompt_engine = %prompt_engine,
                prompt_len = user.len(),
                "prompt-llm:engine-selected"
            );
            return self.call_ollama_prompt_llm(system, &user, 0.25).await;
        }

        if self.api_key == "DISABLED" {
            return Ok(phrase.to_string());
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
