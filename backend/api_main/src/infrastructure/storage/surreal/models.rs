use crate::domain::models::story::StoryScreen;
use crate::domain::models::user::User;
use serde::Deserialize;
use surrealdb::sql::{Datetime, Thing};

#[derive(Deserialize)]
pub struct SurrealUser {
    pub id: Option<Thing>,
    pub email: String,
    pub name: String,
    pub picture: Option<String>,
    pub role: String,
    pub created_at: Datetime,
    pub last_login: Datetime,
}

impl From<SurrealUser> for User {
    fn from(value: SurrealUser) -> Self {
        User {
            id: value.id.map(|t| t.to_string()),
            email: value.email,
            name: value.name,
            picture: value.picture,
            role: value.role,
            created_at: value.created_at.0,
            last_login: value.last_login.0,
        }
    }
}

#[derive(Deserialize)]
pub struct SurrealStoryScreen {
    pub id: Thing,
    pub episode_id: i32,
    pub step_order: i32,
    pub content: serde_json::Value,
}

impl From<SurrealStoryScreen> for StoryScreen {
    fn from(value: SurrealStoryScreen) -> Self {
        let numeric_id = value.id.id.to_raw().parse().unwrap_or(0);
        StoryScreen {
            id: numeric_id,
            episode_id: value.episode_id,
            step_order: value.step_order,
            content: value.content,
        }
    }
}

#[derive(Deserialize)]
pub struct SurrealUserActivityStats {
    pub email: String,
    pub visit_count: Option<i32>,
    pub total_duration_secs: Option<i64>,
    pub last_device_type: Option<String>,
    pub last_browser: Option<String>,
    pub last_os: Option<String>,
    pub last_ip: Option<String>,
    pub last_country: Option<String>,
    pub last_study_date: Option<String>,
    pub current_streak: Option<i32>,
    pub longest_streak: Option<i32>,
}
