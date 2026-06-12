use axum::{Json, response::IntoResponse};
use serde::Serialize;

#[derive(Serialize)]
pub struct FeatureFlagsResponse {
    pub flashcards: bool,
    pub auth: bool,
    pub story_arcade: bool,
    pub payments: bool,
    pub subscriptions: bool,
}

pub async fn get_features() -> impl IntoResponse {
    Json(FeatureFlagsResponse {
        flashcards: cfg!(feature = "flashcards"),
        auth: cfg!(feature = "auth"),
        story_arcade: cfg!(feature = "story_arcade"),
        payments: cfg!(feature = "payments"),
        subscriptions: cfg!(feature = "subscriptions"),
    })
}
