use async_trait::async_trait;
use crate::domain::repositories::db_repository::{
    UserRepository, SubscriptionRepository, CardProgressRepository, StoryArcadeRepository,
    UserActivityRepository,
};
use crate::domain::models::story::{UserProgress, StoryScreen, ProgressUpdate};
use crate::domain::models::user::User;
use crate::domain::models::subscription::Subscription;
use crate::domain::models::user_activity::{ClientInfo, UserActivityStats};
use anyhow::{Result, anyhow};

/// No-op DB repository used when SurrealDB is not available (e.g. Cloud Run overflow).
/// Flashcard reads/writes still work (they use StorageRepository). Story Arcade and auth
/// return errors gracefully instead of crashing the process.
pub struct NullDbRepository;

#[async_trait]
impl StoryArcadeRepository for NullDbRepository {
    async fn log_user_error(&self, _user_id: &str, _story_id: i32, _screen_id: i32, _user_input: &str, _correct_answer: &str, _error_type: &str, _explanation: &str) -> Result<()> {
        Ok(())
    }

    async fn get_progress(&self, _user_id: &str, _story_id: i32) -> Result<Option<UserProgress>> {
        Ok(None)
    }

    async fn create_progress(&self, _user_id: &str, _story_id: i32, _episode_id: i32) -> Result<UserProgress> {
        Err(anyhow!("DB no disponible en este entorno"))
    }

    async fn update_progress(&self, _update: ProgressUpdate) -> Result<UserProgress> {
        Err(anyhow!("DB no disponible en este entorno"))
    }

    async fn reset_progress(&self, _user_id: &str, _story_id: i32) -> Result<()> {
        Ok(())
    }

    async fn get_story_title(&self, story_id: i32) -> Result<String> {
        Ok(format!("Story {}", story_id))
    }

    async fn get_episode_title(&self, episode_id: i32) -> Result<String> {
        Ok(format!("Episode {}", episode_id))
    }

    async fn get_first_episode_id(&self, _story_id: i32) -> Result<i32> {
        Err(anyhow!("DB no disponible en este entorno"))
    }

    async fn get_next_episode_id(&self, _current_episode_id: i32) -> Result<Option<i32>> {
        Ok(None)
    }

    async fn get_episode_screens(&self, _episode_id: i32) -> Result<Vec<StoryScreen>> {
        Ok(vec![])
    }

    async fn update_screen_content(&self, _screen_id: i32, _content: serde_json::Value) -> Result<()> {
        Ok(())
    }

    async fn get_story_full_history(&self, _story_id: i32) -> Result<serde_json::Value> {
        Ok(serde_json::json!([]))
    }

    async fn get_episodes_by_story(&self, _story_id: i32) -> Result<Vec<(i32, String)>> {
        Ok(vec![])
    }
}

#[async_trait]
impl CardProgressRepository for NullDbRepository {
    async fn upsert_card_progress(&self, _user_id: &str, _category: &str, _deck: &str, _card_index: i32, _learned: bool) -> Result<()> {
        Ok(())
    }

    async fn get_learned_cards(&self, _user_id: &str, _category: &str, _deck: &str) -> Result<Vec<i32>> {
        Ok(vec![])
    }

    async fn reset_card_progress(&self, _user_id: &str, _category: &str, _deck: &str) -> Result<()> {
        Ok(())
    }
}

#[async_trait]
impl UserRepository for NullDbRepository {
    async fn get_user_by_email(&self, _email: &str) -> Result<Option<User>> {
        Ok(None)
    }

    async fn upsert_user(&self, _user: User) -> Result<User> {
        Err(anyhow!("Autenticación no disponible: DB no configurada en este entorno"))
    }

    async fn list_all_users(&self) -> Result<Vec<User>> {
        Ok(vec![])
    }
}

#[async_trait]
impl UserActivityRepository for NullDbRepository {
    async fn increment_visit_count(&self, _email: &str) -> Result<()> {
        Ok(())
    }

    async fn add_session_duration(&self, _email: &str, _secs: i64) -> Result<()> {
        Ok(())
    }

    async fn get_stats(&self, email: &str) -> Result<UserActivityStats> {
        Ok(UserActivityStats {
            email: email.to_string(),
            ..Default::default()
        })
    }

    async fn get_all_stats(&self) -> Result<Vec<UserActivityStats>> {
        Ok(vec![])
    }

    async fn update_last_client(&self, _email: &str, _client: &ClientInfo) -> Result<()> {
        Ok(())
    }

    async fn update_last_location(
        &self,
        _email: &str,
        _ip: Option<&str>,
        _country: Option<&str>,
    ) -> Result<()> {
        Ok(())
    }
}

#[async_trait]
impl SubscriptionRepository for NullDbRepository {
    async fn get_subscription(&self, _email: &str) -> Result<Option<Subscription>> {
        Ok(None)
    }

    async fn upsert_subscription(&self, _sub: Subscription) -> Result<Subscription> {
        Err(anyhow!("DB no disponible en este entorno"))
    }

    async fn list_subscriptions(&self, _limit: usize, _offset: usize) -> Result<Vec<Subscription>> {
        Ok(vec![])
    }

    async fn cancel_subscription(&self, _email: &str) -> Result<()> {
        Ok(())
    }

    async fn bulk_expire_subscriptions(&self) -> Result<usize> {
        Ok(0)
    }
}

