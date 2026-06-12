use axum::{
    extract::{State, Multipart},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use crate::AppState;
use crate::application::use_cases::audio_use_cases::AudioSynthRequest;
use crate::application::use_cases::image_use_cases::{ImageGenRequest, UploadImageRequest};
use crate::api::middleware::auth::{extract_claims, require_premium_role, resolve_effective_role};
use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// HTTP request / response types (transport DTOs, not domain objects)
// ---------------------------------------------------------------------------

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
    pub force_generation: bool,
    #[serde(default)]
    pub form: Option<String>,
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

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

pub async fn synthesize_speech(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    Json(body): Json<SynthesizeSpeechBody>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let claims = extract_claims(&state, &headers)?;
    let role = resolve_effective_role(&state, &claims).await;

    // NOTA: NO se bloquea aquí por tono/rol.
    // La lógica correcta vive en audio_use_cases::get_or_synthesize_audio:
    //   1. Si el audio ya existe en caché → lo sirve a CUALQUIER usuario (viewer, premium, admin).
    //   2. Si NO existe → solo admin/premium puede invocar la IA para generarlo.
    //      Un viewer recibe error "audio_not_found" → 404.
    let req = AudioSynthRequest {
        category: body.category,
        deck: body.deck,
        text: body.text,
        voice_name: body.voice_name,
        verb_name: body.verb_name.filter(|s| !s.is_empty()),
        tone: body.tone.filter(|s| !s.is_empty()),
        lang: body.lang.filter(|s| !s.is_empty()),
        exclude_voice: body.exclude_voice.filter(|s| !s.is_empty()),
        force_regenerate: body.force_regenerate.unwrap_or(false),
    };

    state
        .audio_use_cases
        .get_or_synthesize_audio(&req, &claims.email, &role)
        .await
        .map(|result| {
            Json(SynthesizeSpeechResponse {
                audio_url: result.audio_url,
                voice_name: result.voice_name,
            })
        })
        .map_err(|e| {
            if e.to_string() == "audio_not_found" {
                (StatusCode::NOT_FOUND, "Audio no disponible (requiere plan Premium para generar)".to_string())
            } else {
                (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
            }
        })
}

/// Resuelve la ruta AVIF a mostrar (sin generar).
/// Viewer → global; premium → personal → global; admin → global.
pub async fn resolve_image(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    Json(body): Json<ResolveImageBody>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let claims = extract_claims(&state, &headers)?;
    let role = resolve_effective_role(&state, &claims).await;

    match state
        .image_use_cases
        .resolve_image_path(
            &body.category,
            &body.deck,
            body.index,
            body.def_index,
            body.form.as_deref(),
            &claims.email,
            &role,
        )
        .await
    {
        Ok(Some(path)) => Ok(Json(GenerateImageResponse { path }).into_response()),
        Ok(None) => Err((StatusCode::NOT_FOUND, "Imagen no encontrada".to_string())),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string())),
    }
}

pub async fn generate_image(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    Json(body): Json<GenerateImageBody>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let claims = extract_claims(&state, &headers)?;
    let role = resolve_effective_role(&state, &claims).await;
    require_premium_role(&role)?;

    let req = ImageGenRequest {
        category: body.category,
        deck: body.deck,
        index: body.index,
        def_index: body.def_index,
        prompt: body.prompt,
        meaning: body.meaning,
        usage_example: body.usage_example,
        force_generation: body.force_generation,
        form: body.form,
    };

    state
        .image_use_cases
        .get_or_generate_image(&req, &claims.email, &role)
        .await
        .map(|(path, _is_new)| (StatusCode::OK, Json(GenerateImageResponse { path })).into_response())
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

pub async fn delete_audio(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    Json(body): Json<DeleteAudioBody>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let claims = extract_claims(&state, &headers)?;
    let role = resolve_effective_role(&state, &claims).await;
    require_premium_role(&role)?;
    let is_admin = role == "admin";

    let req = AudioSynthRequest {
        category: body.category,
        deck: body.deck,
        text: body.text,
        voice_name: body.voice_name,
        verb_name: body.verb_name.filter(|s| !s.is_empty()),
        tone: body.tone.filter(|s| !s.is_empty()),
        lang: body.lang.filter(|s| !s.is_empty()),
        exclude_voice: body.exclude_voice.filter(|s| !s.is_empty()),
        force_regenerate: false,
    };

    match state
        .audio_use_cases
        .rotate_audio(&req, &claims.email, is_admin)
        .await
    {
        Ok(Some(previous)) => Ok(Json(serde_json::json!({
            "success": true,
            "message": "Audio archivado; se generará otra voz aleatoria",
            "previous_voice": previous
        })).into_response()),
        Ok(None) => Ok((
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({ "success": false, "message": "No hay audio activo para rotar" })),
        ).into_response()),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string())),
    }
}

pub async fn delete_image(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    Json(body): Json<DeleteImageBody>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let claims = extract_claims(&state, &headers)?;
    let role = resolve_effective_role(&state, &claims).await;
    require_premium_role(&role)?;
    let is_admin = role == "admin";

    match state
        .image_use_cases
        .delete_image(&body.category, &body.deck, body.index, body.def_index, body.form.as_deref(), &claims.email, is_admin)
        .await
    {
        Ok(true)  => Ok(Json(serde_json::json!({ "success": true,  "message": "Imagen eliminada" })).into_response()),
        Ok(false) => Err((StatusCode::NOT_FOUND, "No se encontró ninguna imagen para borrar".to_string())),
        Err(e)    => Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string())),
    }
}

pub async fn upload_image(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    mut multipart: Multipart,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let claims = extract_claims(&state, &headers)?;
    let role = resolve_effective_role(&state, &claims).await;
    require_premium_role(&role)?;
    let is_admin = role == "admin";

    let mut category = String::new();
    let mut deck = String::new();
    let mut card_index: usize = 0;
    let mut def_index: usize = 0;
    let mut form: Option<String> = None;
    let mut file_data: Vec<u8> = Vec::new();
    let mut file_name = String::new();
    let mut content_type = String::new();

    while let Some(field) = multipart.next_field().await.map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))? {
        let name = field.name().unwrap_or_default().to_string();
        match name.as_str() {
            "category"   => category    = field.text().await.map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?,
            "deck"       => deck        = field.text().await.map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?,
            "card_index" => card_index  = field.text().await.map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?.parse().unwrap_or(0),
            "def_index"  => def_index   = field.text().await.map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?.parse().unwrap_or(0),
            "form"       => form        = Some(field.text().await.map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?),
            "file"       => {
                file_name    = field.file_name().unwrap_or("upload.png").to_string();
                content_type = field.content_type().unwrap_or("image/png").to_string();
                file_data    = field.bytes().await.map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?.to_vec();
            }
            _ => {}
        }
    }

    if category.is_empty() || deck.is_empty() || file_data.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "Faltan campos obligatorios o el archivo está vacío".to_string()));
    }

    let req = UploadImageRequest { category, deck, card_index, def_index, form, file_data, file_name, content_type };

    state
        .image_use_cases
        .upload_image(req, &claims.email, is_admin)
        .await
        .map(|path| Json(GenerateImageResponse { path }).into_response())
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}
