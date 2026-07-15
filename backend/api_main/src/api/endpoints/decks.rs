use crate::api::middleware::auth::extract_claims;
use crate::domain::models::srs::{CardProgressUpdate, SrsSchedule};
use crate::AppState;
use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::Deserialize;

fn default_course_direction() -> String {
    "es_en".to_string()
}

/// Un ítem dentro del lote de actualización de progreso.
#[derive(Debug, Deserialize)]
pub struct CardUpdateItem {
    pub index: usize,
    pub learned: bool,
    #[serde(default)]
    pub box_level: Option<i32>,
    #[serde(default)]
    pub ease_factor: Option<f64>,
    #[serde(default)]
    pub interval_days: Option<f64>,
    #[serde(default)]
    pub next_review_at: Option<chrono::DateTime<chrono::Utc>>,
}

/// Payload del endpoint bulk: envía N actualizaciones en una sola petición.
#[derive(Debug, Deserialize)]
pub struct UpdateBatchRequest {
    pub user_id: String,
    pub category: String,
    pub deck: String,
    #[serde(default = "default_course_direction")]
    pub course_direction: String,
    pub cards: Vec<CardUpdateItem>,
}

/// HTTP request DTO — lives in the API layer, not in domain.
#[derive(Debug, Deserialize)]
pub struct UpdateStatusRequest {
    pub user_id: String,
    pub category: String,
    pub deck: String,
    pub index: usize,
    pub learned: bool,
    #[serde(default = "default_course_direction")]
    pub course_direction: String,
}

/// HTTP request DTO — lives in the API layer, not in domain.
#[derive(Debug, Deserialize)]
pub struct ResetRequest {
    pub user_id: String,
    pub category: String,
    pub deck: String,
    #[serde(default = "default_course_direction")]
    pub course_direction: String,
    #[serde(default)]
    pub scope: Option<String>,
    #[serde(default)]
    pub confirm: bool,
}

#[derive(Deserialize)]
pub struct CategoryQuery {
    #[serde(default = "default_course_direction")]
    pub course_direction: String,
    pub category: String,
}

#[derive(Deserialize)]
pub struct DeckQuery {
    pub user_id: String,
    pub category: String,
    pub deck: String,
    #[serde(default = "default_course_direction")]
    pub course_direction: String,
}

#[derive(Default, Deserialize)]
pub struct CourseDirectionQuery {
    #[serde(default = "default_course_direction")]
    pub course_direction: String,
    #[serde(default = "default_include_counts")]
    pub include_counts: bool,
}

#[derive(Deserialize)]
pub struct SrsDueQuery {
    #[serde(default = "default_course_direction")]
    pub course_direction: String,
    #[serde(default = "default_srs_candidate_limit")]
    pub limit: usize,
}

fn default_srs_candidate_limit() -> usize {
    5_000
}

fn default_include_counts() -> bool {
    true
}

/// POST /api/update-batch — persiste hasta BATCH_SIZE tarjetas en una sola petición.
pub async fn update_cards_batch(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    Json(payload): Json<UpdateBatchRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    use crate::api::middleware::auth::extract_claims;
    let claims = extract_claims(&state, &headers)?;
    if claims.role != "admin" && claims.email != payload.user_id {
        return Err((StatusCode::FORBIDDEN, "No autorizado".to_string()));
    }
    if payload.cards.is_empty() {
        return Ok((
            StatusCode::OK,
            Json(serde_json::json!({ "success": true, "saved": 0 })),
        )
            .into_response());
    }
    const MAX_BATCH: usize = 50;
    if payload.cards.len() > MAX_BATCH {
        return Err((
            StatusCode::BAD_REQUEST,
            format!("El lote no puede superar {} tarjetas", MAX_BATCH),
        ));
    }
    let mut updates = Vec::with_capacity(payload.cards.len());
    for card in &payload.cards {
        let has_srs = card.box_level.is_some()
            || card.ease_factor.is_some()
            || card.interval_days.is_some()
            || card.next_review_at.is_some();
        let srs = if has_srs {
            let box_level = card.box_level.ok_or_else(|| {
                (
                    StatusCode::BAD_REQUEST,
                    "box_level es obligatorio en una actualización SRS".to_string(),
                )
            })?;
            let ease_factor = card.ease_factor.ok_or_else(|| {
                (
                    StatusCode::BAD_REQUEST,
                    "ease_factor es obligatorio en una actualización SRS".to_string(),
                )
            })?;
            let interval_days = card.interval_days.ok_or_else(|| {
                (
                    StatusCode::BAD_REQUEST,
                    "interval_days es obligatorio en una actualización SRS".to_string(),
                )
            })?;
            if !(0..=99).contains(&box_level)
                || !ease_factor.is_finite()
                || !(1.3..=5.0).contains(&ease_factor)
                || !interval_days.is_finite()
                || !(1.0..=36_500.0).contains(&interval_days)
            {
                return Err((StatusCode::BAD_REQUEST, "Estado SRS inválido".to_string()));
            }
            if box_level != 99 && card.next_review_at.is_none() {
                return Err((
                    StatusCode::BAD_REQUEST,
                    "next_review_at es obligatorio salvo para una tarjeta dominada".to_string(),
                ));
            }
            Some(SrsSchedule {
                box_level,
                ease_factor,
                interval_days,
                next_review_at: card.next_review_at,
            })
        } else {
            None
        };
        let card_index = i32::try_from(card.index).map_err(|_| {
            (
                StatusCode::BAD_REQUEST,
                "Índice de tarjeta fuera de rango".to_string(),
            )
        })?;
        updates.push(CardProgressUpdate {
            card_index,
            learned: card.learned,
            srs,
        });
    }
    match state
        .deck_use_cases
        .update_cards_batch(
            &payload.user_id,
            &payload.category,
            &payload.deck,
            &updates,
            &payload.course_direction,
        )
        .await
    {
        Ok(_) => Ok((
            StatusCode::OK,
            Json(serde_json::json!({ "success": true, "saved": updates.len() })),
        )
            .into_response()),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string())),
    }
}

/// GET /api/srs/due — proyección mínima; toda la priorización ocurre en React.
pub async fn get_srs_due_cards(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    Query(query): Query<SrsDueQuery>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let claims = extract_claims(&state, &headers)?;
    match state
        .deck_use_cases
        .get_srs_review_candidates(
            &claims.email,
            &query.course_direction,
            chrono::Utc::now(),
            query.limit,
        )
        .await
    {
        Ok(cards) => Ok((
            StatusCode::OK,
            Json(serde_json::json!({ "success": true, "cards": cards })),
        )
            .into_response()),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string())),
    }
}

pub async fn get_categories(
    State(state): State<AppState>,
    Query(query): Query<CourseDirectionQuery>,
) -> impl IntoResponse {
    let result = if query.include_counts {
        state
            .deck_use_cases
            .list_categories_with_counts(&query.course_direction)
            .await
    } else {
        state
            .deck_use_cases
            .list_categories(&query.course_direction)
            .await
            .map(|categories| {
                categories
                    .into_iter()
                    .map(|name| serde_json::json!({ "name": name }))
                    .collect()
            })
    };

    match result {
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
    match state
        .deck_use_cases
        .list_decks(&query.category, &query.course_direction)
        .await
    {
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
        .get_deck_data(
            &query.user_id,
            &query.category,
            &query.deck,
            &query.course_direction,
        )
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
    match state.deck_use_cases.update_card_status(
        &payload.user_id,
        &payload.category,
        &payload.deck,
        payload.index,
        payload.learned,
        &payload.course_direction,
    ).await {
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

    let reset_result = if payload.scope.as_deref() == Some("category") {
        state
            .deck_use_cases
            .reset_category_status(&payload.user_id, &payload.category, &payload.course_direction)
            .await
    } else {
        state
            .deck_use_cases
            .reset_deck_status(
                &payload.user_id,
                &payload.category,
                &payload.deck,
                &payload.course_direction,
            )
            .await
    };

    match reset_result {
        Ok(_) => Ok((StatusCode::OK, Json(serde_json::json!({ "success": true, "message": format!("Progreso de '{}' reseteado.", payload.category) }))).into_response()),
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
    Query(query): Query<CourseDirectionQuery>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let claims = extract_claims(&state, &headers)?;
    match state
        .deck_use_cases
        .get_learning_stats(&claims.email, &query.course_direction)
        .await
    {
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
