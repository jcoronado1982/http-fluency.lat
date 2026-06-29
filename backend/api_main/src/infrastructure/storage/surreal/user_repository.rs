use super::connection::SurrealConnection;
use super::models::SurrealUser;
use crate::domain::models::user::User;
use crate::domain::repositories::db_repository::UserRepository;
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use std::sync::Arc;

pub struct SurrealUserRepository(pub Arc<SurrealConnection>);

#[async_trait]
impl UserRepository for SurrealUserRepository {
    async fn get_user_by_email(&self, email: &str) -> Result<Option<User>> {
        let mut res = self
            .0
            .db
            .query("SELECT * FROM user WHERE email = $email")
            .bind(("email", email))
            .await?;
        let user: Option<SurrealUser> = res.take(0)?;
        Ok(user.map(Into::into))
    }

    async fn upsert_user(&self, user: User) -> Result<User> {
        #[derive(serde::Serialize)]
        struct SurrealUserUpdate {
            email: String,
            name: String,
            picture: Option<String>,
            role: String,
            onboarding_completed: bool,
            created_at: chrono::DateTime<chrono::Utc>,
            last_login: chrono::DateTime<chrono::Utc>,
        }

        let update_data = SurrealUserUpdate {
            email: user.email.clone(),
            name: user.name,
            picture: user.picture,
            role: user.role,
            onboarding_completed: user.onboarding_completed,
            created_at: user.created_at,
            last_login: user.last_login,
        };

        let mut res = self
            .0
            .db
            .query(
                "
            UPDATE type::thing('user', $email) CONTENT $data;
            SELECT * FROM type::thing('user', $email);
        ",
            )
            .bind(("email", update_data.email.clone()))
            .bind(("data", update_data))
            .await?;
        let updated: Option<SurrealUser> = res.take(1)?;
        updated
            .map(Into::into)
            .ok_or_else(|| anyhow!("Failed to upsert user"))
    }

    async fn set_onboarding_completed(&self, email: &str, completed: bool) -> Result<Option<User>> {
        let mut res = self
            .0
            .db
            .query(
                "
            UPDATE user SET onboarding_completed = $completed WHERE email = $email;
            SELECT * FROM user WHERE email = $email LIMIT 1;
        ",
            )
            .bind(("email", email))
            .bind(("completed", completed))
            .await?;
        let updated: Option<SurrealUser> = res.take(1)?;
        Ok(updated.map(Into::into))
    }

    async fn list_all_users(&self) -> Result<Vec<User>> {
        let mut res = self
            .0
            .db
            .query("SELECT * FROM user ORDER BY last_login DESC")
            .await?;
        let users: Vec<SurrealUser> = res.take(0)?;
        Ok(users.into_iter().map(Into::into).collect())
    }
}
