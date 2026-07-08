use crate::domain::models::story::{ProgressUpdate, StoryScreen, UserProgress};
use crate::domain::models::subscription::Subscription;
use crate::domain::models::user::{CatalogPreferences, User};
use crate::domain::models::user_activity::{
    build_learning_stats, ClientInfo, LearningStats, UserActivityStats,
};
use crate::domain::repositories::db_repository::{
    CardProgressRepository, PronounPracticeRepository, SubscriptionRepository,
    UserActivityRepository, UserRepository,
};
use anyhow::{anyhow, Result};
use async_trait::async_trait;

/// No-op DB repository used when SurrealDB is not available (e.g. Cloud Run overflow).
/// Flashcard reads/writes still work (they use StorageRepository). Pronoun practice and auth
/// return errors gracefully instead of crashing the process.
pub struct NullDbRepository;

#[async_trait]
impl PronounPracticeRepository for NullDbRepository {
    async fn log_user_error(
        &self,
        _user_id: &str,
        _story_id: i32,
        _screen_id: i32,
        _user_input: &str,
        _correct_answer: &str,
        _error_type: &str,
        _explanation: &str,
    ) -> Result<()> {
        Ok(())
    }

    async fn get_progress(&self, _user_id: &str, _story_id: i32) -> Result<Option<UserProgress>> {
        Ok(None)
    }

    async fn create_progress(
        &self,
        _user_id: &str,
        _story_id: i32,
        _episode_id: i32,
    ) -> Result<UserProgress> {
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

    async fn update_screen_content(
        &self,
        _screen_id: i32,
        _content: serde_json::Value,
    ) -> Result<()> {
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
    async fn upsert_card_progress(
        &self,
        _user_id: &str,
        _category: &str,
        _deck: &str,
        _card_index: i32,
        _learned: bool,
    ) -> Result<()> {
        Ok(())
    }

    async fn get_learned_cards(
        &self,
        _user_id: &str,
        _category: &str,
        _deck: &str,
    ) -> Result<Vec<i32>> {
        Ok(vec![])
    }

    async fn reset_card_progress(
        &self,
        _user_id: &str,
        _category: &str,
        _deck: &str,
    ) -> Result<()> {
        Ok(())
    }

    async fn reset_category_progress(&self, _user_id: &str, _category: &str) -> Result<()> {
        Ok(())
    }

    async fn count_learned_cards(&self, _user_id: &str) -> Result<i32> {
        Ok(0)
    }

    async fn count_learned_cards_by_deck_prefix(
        &self,
        _user_id: &str,
        _deck_prefix: &str,
    ) -> Result<i32> {
        Ok(0)
    }

    async fn get_all_learned_cards(
        &self,
        _user_id: &str,
    ) -> Result<Vec<(String, String, i32, Option<chrono::DateTime<chrono::Utc>>)>> {
        Ok(Vec::new())
    }

    async fn upsert_cards_batch(
        &self,
        _user_id: &str,
        _category: &str,
        _deck: &str,
        _cards: &[(i32, bool)],
    ) -> Result<()> {
        Ok(())
    }
}

#[async_trait]
impl UserRepository for NullDbRepository {
    async fn get_user_by_email(&self, _email: &str) -> Result<Option<User>> {
        Ok(None)
    }

    async fn upsert_user(&self, _user: User) -> Result<User> {
        Err(anyhow!(
            "Autenticación no disponible: DB no configurada en este entorno"
        ))
    }

    async fn set_onboarding_completed(
        &self,
        _email: &str,
        _completed: bool,
    ) -> Result<Option<User>> {
        Err(anyhow!(
            "Autenticación no disponible: DB no configurada en este entorno"
        ))
    }

    async fn update_catalog_preferences(
        &self,
        _email: &str,
        _preferences: Option<CatalogPreferences>,
    ) -> Result<Option<User>> {
        Err(anyhow!(
            "Preferencias no disponibles: DB no configurada en este entorno"
        ))
    }

    async fn reset_all_catalog_preferences(&self) -> Result<u64> {
        Ok(0)
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

    async fn record_study_day(&self, _email: &str) -> Result<()> {
        Ok(())
    }

    async fn get_learning_stats(
        &self,
        _email: &str,
        mastered_count: i32,
        target_count: i32,
    ) -> Result<LearningStats> {
        Ok(build_learning_stats(
            mastered_count,
            target_count,
            "B2",
            "A1",
            if target_count <= 0 {
                0
            } else {
                ((mastered_count as f64 / target_count as f64) * 100.0).round() as i32
            },
            Vec::new(),
            None,
            0,
            0,
            &chrono::Utc::now().format("%Y-%m-%d").to_string(),
            &(chrono::Utc::now() - chrono::Duration::days(1))
                .format("%Y-%m-%d")
                .to_string(),
        ))
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
