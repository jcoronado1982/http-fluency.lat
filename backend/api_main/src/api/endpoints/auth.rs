use crate::api::middleware::auth::{extract_claims, resolve_effective_role};
use crate::AppState;
use axum::{
    extract::State,
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    Json,
};
use serde::Deserialize;
use mod_shell::auth::AuthUseCases;

#[derive(Deserialize)]
pub struct GoogleLoginRequest {
    pub id_token: String,
}

/// POST /api/auth/dev-guest — solo desarrollo; emite JWT válido para pruebas locales.
pub async fn dev_guest_login(State(state): State<AppState>) -> impl IntoResponse {
    if !AuthUseCases::dev_guest_token_allowed() {
        return (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({ "success": false, "detail": "Not available" })),
        )
            .into_response();
    }
    match state.auth_use_cases.dev_guest_login() {
        Ok(response) => (
            StatusCode::OK,
            Json(serde_json::json!({
                "success": true,
                "token": response.token,
                "user": response.user
            })),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "success": false, "detail": e.to_string() })),
        )
            .into_response(),
    }
}

pub async fn google_login(
    State(state): State<AppState>,
    Json(payload): Json<GoogleLoginRequest>,
) -> impl IntoResponse {
    match state.auth_use_cases.google_login(&payload.id_token).await {
        Ok(response) => (
            StatusCode::OK,
            Json(serde_json::json!({
                "success": true,
                "token": response.token,
                "user": response.user
            })),
        )
            .into_response(),
        Err(e) => (
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({
                "success": false,
                "detail": e.to_string()
            })),
        )
            .into_response(),
    }
}

/// GET /api/auth/me — rol real en servidor (JWT puede estar desactualizado vs localStorage).
pub async fn get_me(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let claims = extract_claims(&state, &headers)?;
    let effective_role = resolve_effective_role(&state, &claims).await;

    Ok(Json(serde_json::json!({
        "email": claims.email,
        "name": claims.name,
        "jwt_role": claims.role,
        "effective_role": effective_role,
        "is_admin": AuthUseCases::is_admin_role(&effective_role),
        "is_premium": AuthUseCases::is_premium_role(&effective_role),
    })))
}
