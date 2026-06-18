use axum::{response::IntoResponse, Json};
use serde::Serialize;

#[derive(Serialize)]
pub struct FeatureFlagsResponse {
    pub flashcards: bool,
    pub auth: bool,
    pub pronoun_practice: bool,
    pub payments: bool,
    pub subscriptions: bool,
}

pub async fn get_features() -> impl IntoResponse {
    Json(FeatureFlagsResponse {
        flashcards: cfg!(feature = "flashcards"),
        auth: cfg!(feature = "auth"),
        pronoun_practice: cfg!(feature = "pronoun_practice"),
        payments: cfg!(feature = "payments"),
        subscriptions: cfg!(feature = "subscriptions"),
    })
}
