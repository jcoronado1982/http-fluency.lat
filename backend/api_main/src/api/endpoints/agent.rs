use axum::{extract::State, http::StatusCode, response::IntoResponse, Json};

use crate::infrastructure::agent::{AgentRequest, LocalAgentService};
use crate::AppState;

pub async fn local_agent_turn(
    State(state): State<AppState>,
    Json(payload): Json<AgentRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let service = LocalAgentService::new(state.settings.clone());
    match service.run(payload).await {
        Ok(response) => Ok((StatusCode::OK, Json(response)).into_response()),
        Err(err) => Err((StatusCode::INTERNAL_SERVER_ERROR, err.to_string())),
    }
}
