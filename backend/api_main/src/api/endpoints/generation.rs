use crate::api::dto::generation::{
    DeleteAudioBody, DeleteImageBody, GenerateImageBody, GenerateImageResponse,
    ResolveImageBody, SynthesizeSpeechBody, SynthesizeSpeechResponse,
};
use crate::api::mappers::flashcards::{
    to_audio_synth_request, to_delete_audio_request, to_image_gen_request, to_upload_image_request,
};
use crate::api::middleware::auth::{extract_claims, require_premium_role, resolve_effective_role};
use crate::AppState;
use axum::{
    extract::{Multipart, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};

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
    let req = to_audio_synth_request(body);

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
                (
                    StatusCode::NOT_FOUND,
                    "Audio no disponible (requiere plan Premium para generar)".to_string(),
                )
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

    let req = to_image_gen_request(body);

    state
        .image_use_cases
        .get_or_generate_image(&req, &claims.email, &role)
        .await
        .map(|(path, _is_new)| {
            (StatusCode::OK, Json(GenerateImageResponse { path })).into_response()
        })
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

    let req = to_delete_audio_request(body);

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
        .delete_image(
            &body.category,
            &body.deck,
            body.index,
            body.def_index,
            body.form.as_deref(),
            &claims.email,
            is_admin,
        )
        .await
    {
        Ok(true) => Ok(Json(
            serde_json::json!({ "success": true,  "message": "Imagen eliminada" }),
        )
        .into_response()),
        Ok(false) => Err((
            StatusCode::NOT_FOUND,
            "No se encontró ninguna imagen para borrar".to_string(),
        )),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string())),
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

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?
    {
        let name = field.name().unwrap_or_default().to_string();
        match name.as_str() {
            "category" => {
                category = field
                    .text()
                    .await
                    .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?
            }
            "deck" => {
                deck = field
                    .text()
                    .await
                    .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?
            }
            "card_index" => {
                card_index = field
                    .text()
                    .await
                    .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?
                    .parse()
                    .unwrap_or(0)
            }
            "def_index" => {
                def_index = field
                    .text()
                    .await
                    .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?
                    .parse()
                    .unwrap_or(0)
            }
            "form" => {
                form = Some(
                    field
                        .text()
                        .await
                        .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?,
                )
            }
            "file" => {
                file_name = field.file_name().unwrap_or("upload.png").to_string();
                content_type = field.content_type().unwrap_or("image/png").to_string();
                file_data = field
                    .bytes()
                    .await
                    .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?
                    .to_vec();
            }
            _ => {}
        }
    }

    if category.is_empty() || deck.is_empty() || file_data.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            "Faltan campos obligatorios o el archivo está vacío".to_string(),
        ));
    }

    let req = to_upload_image_request(
        category,
        deck,
        card_index,
        def_index,
        form,
        file_data,
        file_name,
        content_type,
    );

    state
        .image_use_cases
        .upload_image(req, &claims.email, is_admin)
        .await
        .map(|path| Json(GenerateImageResponse { path }).into_response())
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}
