use async_trait::async_trait;
use crate::domain::models::story::{UserProgress, StoryScreen, ProgressUpdate};
use crate::domain::models::user::User;
use crate::domain::models::subscription::Subscription;
use crate::domain::models::user_activity::{ClientInfo, UserActivityStats};
use anyhow::Result;

#[async_trait]
pub trait UserRepository: Send + Sync {
    async fn get_user_by_email(&self, email: &str) -> Result<Option<User>>;
    async fn upsert_user(&self, user: User) -> Result<User>;
    async fn list_all_users(&self) -> Result<Vec<User>>;
}

#[async_trait]
pub trait UserActivityRepository: Send + Sync {
    async fn increment_visit_count(&self, email: &str) -> Result<()>;
    async fn add_session_duration(&self, email: &str, secs: i64) -> Result<()>;
    async fn get_stats(&self, email: &str) -> Result<UserActivityStats>;
    async fn get_all_stats(&self) -> Result<Vec<UserActivityStats>>;
    async fn update_last_client(&self, email: &str, client: &ClientInfo) -> Result<()>;
    async fn update_last_location(
        &self,
        email: &str,
        ip: Option<&str>,
        country: Option<&str>,
    ) -> Result<()>;
}

#[async_trait]
pub trait SubscriptionRepository: Send + Sync {
    async fn get_subscription(&self, email: &str) -> Result<Option<Subscription>>;
    async fn upsert_subscription(&self, sub: Subscription) -> Result<Subscription>;
    async fn list_subscriptions(&self, limit: usize, offset: usize) -> Result<Vec<Subscription>>;
    async fn cancel_subscription(&self, email: &str) -> Result<()>;
    async fn bulk_expire_subscriptions(&self) -> Result<usize>;
}

#[async_trait]
pub trait CardProgressRepository: Send + Sync {
    async fn upsert_card_progress(&self, user_id: &str, category: &str, deck: &str, card_index: i32, learned: bool) -> Result<()>;
    async fn get_learned_cards(&self, user_id: &str, category: &str, deck: &str) -> Result<Vec<i32>>;
    async fn reset_card_progress(&self, user_id: &str, category: &str, deck: &str) -> Result<()>;
}

#[async_trait]
pub trait StoryArcadeRepository: Send + Sync {
    async fn log_user_error(&self, user_id: &str, story_id: i32, screen_id: i32, user_input: &str, correct_answer: &str, error_type: &str, explanation: &str) -> Result<()>;
    
    async fn get_progress(&self, user_id: &str, story_id: i32) -> Result<Option<UserProgress>>;
    async fn create_progress(&self, user_id: &str, story_id: i32, episode_id: i32) -> Result<UserProgress>;
    async fn update_progress(&self, update: ProgressUpdate) -> Result<UserProgress>;
    async fn reset_progress(&self, user_id: &str, story_id: i32) -> Result<()>;
    
    async fn get_story_title(&self, story_id: i32) -> Result<String>;
    async fn get_episode_title(&self, episode_id: i32) -> Result<String>;
    async fn get_first_episode_id(&self, story_id: i32) -> Result<i32>;
    async fn get_next_episode_id(&self, current_episode_id: i32) -> Result<Option<i32>>;
    
    async fn get_episode_screens(&self, episode_id: i32) -> Result<Vec<StoryScreen>>;
    async fn update_screen_content(&self, screen_id: i32, content: serde_json::Value) -> Result<()>;
    async fn get_story_full_history(&self, story_id: i32) -> Result<serde_json::Value>;
    async fn get_episodes_by_story(&self, story_id: i32) -> Result<Vec<(i32, String)>>;
}

