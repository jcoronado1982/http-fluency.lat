use crate::api::middleware::auth::extract_claims;
use crate::AppState;
use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::Deserialize;

/// HTTP request DTO — lives in the API layer, not in domain.
#[derive(Debug, Deserialize)]
pub struct UpdateStatusRequest {
    pub user_id: String,
    pub category: String,
    pub deck: String,
    pub index: usize,
    pub learned: bool,
}

/// HTTP request DTO — lives in the API layer, not in domain.
#[derive(Debug, Deserialize)]
pub struct ResetRequest {
    pub user_id: String,
    pub category: String,
    pub deck: String,
    #[serde(default)]
    pub confirm: bool,
}

#[derive(Deserialize)]
pub struct CategoryQuery {
    pub category: String,
}

#[derive(Deserialize)]
pub struct DeckQuery {
    pub user_id: String,
    pub category: String,
    pub deck: String,
}

pub async fn get_categories(State(state): State<AppState>) -> impl IntoResponse {
    match state.deck_use_cases.list_categories_with_counts().await {
        Ok(categories) => (
            StatusCode::OK,
            Json(serde_json::json!({ "success": true, "categories": categories })),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "success": false, "detail": e.to_string() })),
        )
            .into_response(),
    }
}

pub async fn get_available_decks(
    State(state): State<AppState>,
    Query(query): Query<CategoryQuery>,
) -> impl IntoResponse {
    match state.deck_use_cases.list_decks(&query.category).await {
        Ok(decks) => {
            let active_file = decks.first().cloned().unwrap_or_default();
            (StatusCode::OK, Json(serde_json::json!({ "success": true, "files": decks, "active_file": active_file }))).into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "success": false, "detail": e.to_string() })),
        )
            .into_response(),
    }
}

pub async fn get_deck_data(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    Query(query): Query<DeckQuery>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let claims = extract_claims(&state, &headers)?;
    if claims.role != "admin" && claims.email != query.user_id {
        return Err((
            StatusCode::FORBIDDEN,
            "No autorizado para ver el progreso de otro usuario".to_string(),
        ));
    }
    match state
        .deck_use_cases
        .get_deck_data(&query.user_id, &query.category, &query.deck)
        .await
    {
        Ok(data) => Ok((StatusCode::OK, Json(data)).into_response()),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string())),
    }
}

pub async fn update_card_status(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    Json(payload): Json<UpdateStatusRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let claims = extract_claims(&state, &headers)?;
    if claims.role != "admin" && claims.email != payload.user_id {
        return Err((
            StatusCode::FORBIDDEN,
            "No autorizado para modificar el progreso de otro usuario".to_string(),
        ));
    }
    match state.deck_use_cases.update_card_status(&payload.user_id, &payload.category, &payload.deck, payload.index, payload.learned).await {
        Ok(_) => Ok((StatusCode::OK, Json(serde_json::json!({ "success": true, "message": format!("Tarjeta {} actualizada.", payload.index) }))).into_response()),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string())),
    }
}

pub async fn reset_all_statuses(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    Json(payload): Json<ResetRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let claims = extract_claims(&state, &headers)?;
    if claims.role != "admin" && claims.email != payload.user_id {
        return Err((
            StatusCode::FORBIDDEN,
            "No autorizado para modificar el progreso de otro usuario".to_string(),
        ));
    }
    if !payload.confirm {
        return Ok((
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "success": false, "detail": "Confirmación requerida" })),
        )
            .into_response());
    }

    match state.deck_use_cases.reset_deck_status(&payload.user_id, &payload.category, &payload.deck).await {
        Ok(_) => Ok((StatusCode::OK, Json(serde_json::json!({ "success": true, "message": format!("Todas las tarjetas en '{}' reseteadas.", payload.deck) }))).into_response()),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string())),
    }
}

pub async fn get_phonics_data(State(state): State<AppState>) -> impl IntoResponse {
    match state.deck_use_cases.get_phonics_data().await {
        Ok(data) => (StatusCode::OK, Json(data)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "success": false, "detail": e.to_string() })),
        )
            .into_response(),
    }
}

pub async fn get_learning_stats(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let claims = extract_claims(&state, &headers)?;
    match state.deck_use_cases.get_learning_stats(&claims.email).await {
        Ok(stats) => Ok((
            StatusCode::OK,
            Json(serde_json::json!({ "success": true, "stats": stats })),
        )
            .into_response()),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string())),
    }
}

pub async fn touch_study_day(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let claims = extract_claims(&state, &headers)?;
    match state.deck_use_cases.touch_study_day(&claims.email).await {
        Ok(_) => Ok((StatusCode::OK, Json(serde_json::json!({ "success": true }))).into_response()),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string())),
    }
}
