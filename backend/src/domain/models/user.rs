use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};

#[derive(Debug, Serialize, Deserialize, Clone, sqlx::FromRow)]
pub struct User {
    pub id: Option<String>,
    pub email: String,
    pub name: String,
    pub picture: Option<String>,
    pub role: String,
    pub created_at: DateTime<Utc>,
    pub last_login: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GooglePayload {
    pub sub: String, // Google ID
    pub email: String,
    pub name: String,
    pub picture: Option<String>,
    pub email_verified: bool,
}
