use crate::domain::models::story::{ProgressUpdate, StoryScreen, UserProgress};
use crate::domain::models::subscription::Subscription;
use crate::domain::models::user::User;
use crate::domain::models::user_activity::{ClientInfo, UserActivityStats};
use crate::domain::repositories::db_repository::{
    CardProgressRepository, PronounPracticeRepository, SubscriptionRepository,
    UserActivityRepository, UserRepository,
};
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use serde::Deserialize;
use surrealdb::engine::remote::ws::{Client, Ws};
use surrealdb::opt::auth::Root;
use surrealdb::sql::{Datetime, Thing};
use surrealdb::Surreal;

#[derive(Deserialize)]
struct SurrealUser {
    id: Option<Thing>,
    email: String,
    name: String,
    picture: Option<String>,
    role: String,
    created_at: Datetime,
    last_login: Datetime,
}

impl Into<User> for SurrealUser {
    fn into(self) -> User {
        User {
            id: self.id.map(|t| t.to_string()),
            email: self.email,
            name: self.name,
            picture: self.picture,
            role: self.role,
            created_at: self.created_at.0,
            last_login: self.last_login.0,
        }
    }
}

#[derive(Deserialize)]
struct SurrealStoryScreen {
    id: Thing,
    episode_id: i32,
    step_order: i32,
    content: serde_json::Value,
}

impl Into<StoryScreen> for SurrealStoryScreen {
    fn into(self) -> StoryScreen {
        // SurrealDB numeric IDs can be parsed from the 'id' part of the Thing
        let numeric_id = self.id.id.to_raw().parse().unwrap_or(0);
        StoryScreen {
            id: numeric_id,
            episode_id: self.episode_id,
            step_order: self.step_order,
            content: self.content,
        }
    }
}

pub struct SurrealRepository {
    pub db: Surreal<Client>,
}

impl SurrealRepository {
    pub async fn new(endpoint: &str, namespace: &str, database: &str) -> Result<Self> {
        let db = Surreal::new::<Ws>(endpoint)
            .await
            .map_err(|e| anyhow!("SurrealDB Connection Error: {}", e))?;

        let user = std::env::var("SURREAL_USER").unwrap_or_else(|_| "root".to_string());
        let pass = std::env::var("SURREAL_PASS").unwrap_or_else(|_| "root".to_string());

        db.signin(Root {
            username: &user,
            password: &pass,
        })
        .await
        .map_err(|e| anyhow!("SurrealDB Auth Error: {}", e))?;

        db.use_ns(namespace).use_db(database).await?;
        tracing::info!(
            "🚀 Conectado a SurrealDB (RocksDB) en {} (NS: {}, DB: {})",
            endpoint,
            namespace,
            database
        );

        Ok(Self { db })
    }
}

#[async_trait]
impl PronounPracticeRepository for SurrealRepository {
    async fn log_user_error(
        &self,
        user_id: &str,
        story_id: i32,
        screen_id: i32,
        user_input: &str,
        correct_answer: &str,
        error_type: &str,
        explanation: &str,
    ) -> Result<()> {
        let now = chrono::Utc::now();
        let id = format!(
            "user_errors:[{}, {}, {}]",
            user_id,
            story_id,
            now.timestamp_micros()
        );

        self.db
            .query(
                "UPDATE type::thing($id) MERGE {
            user_id: $user_id,
            story_id: $story_id,
            screen_id: $screen_id,
            user_input: $user_input,
            correct_answer: $correct_answer,
            error_type: $error_type,
            explanation: $explanation,
            created_at: $created_at
        }",
            )
            .bind(("id", id))
            .bind(("user_id", user_id))
            .bind(("story_id", story_id))
            .bind(("screen_id", screen_id))
            .bind(("user_input", user_input))
            .bind(("correct_answer", correct_answer))
            .bind(("error_type", error_type))
            .bind(("explanation", explanation))
            .bind(("created_at", now))
            .await?;
        Ok(())
    }

    async fn get_progress(&self, user_id: &str, story_id: i32) -> Result<Option<UserProgress>> {
        let id = format!("user_progress:['{}', {}]", user_id, story_id);
        let mut res = self
            .db
            .query("SELECT * FROM type::thing($id)")
            .bind(("id", id))
            .await?;
        let progress: Option<UserProgress> = res.take(0)?;
        Ok(progress)
    }

    async fn create_progress(
        &self,
        user_id: &str,
        story_id: i32,
        episode_id: i32,
    ) -> Result<UserProgress> {
        let now = chrono::Utc::now();

        let progress = UserProgress {
            user_id: user_id.to_string(),
            story_id,
            current_episode_id: episode_id,
            current_step_order: 1,
            total_score: 0,
            status: "active".to_string(),
            last_updated: now,
        };

        let id = format!("user_progress:['{}', {}]", user_id, story_id);
        let mut res = self
            .db
            .query("UPDATE type::thing($id) CONTENT $data RETURN AFTER")
            .bind(("id", id))
            .bind(("data", progress))
            .await?;

        let result: Option<UserProgress> = res.take(0)?;
        result.ok_or_else(|| anyhow!("Failed to create/update progress"))
    }

    async fn update_progress(&self, update: ProgressUpdate) -> Result<UserProgress> {
        let id = format!("user_progress:['{}', {}]", update.user_id, update.story_id);
        let now = chrono::Utc::now();

        let mut res = self
            .db
            .query(
                "
            UPDATE type::thing($id) 
            SET current_episode_id = $episode,
                current_step_order = $step,
                status = $status,
                total_score += $score_inc,
                last_updated = $now
            RETURN AFTER
        ",
            )
            .bind(("id", id))
            .bind(("episode", update.current_episode_id))
            .bind(("step", update.current_step_order))
            .bind(("status", update.status))
            .bind(("score_inc", update.score_increment))
            .bind(("now", now))
            .await?;

        let result: Option<UserProgress> = res.take(0)?;
        result.ok_or_else(|| anyhow!("Failed to update progress"))
    }

    async fn reset_progress(&self, user_id: &str, story_id: i32) -> Result<()> {
        let id = format!("user_progress:['{}', {}]", user_id, story_id);
        self.db
            .query("DELETE type::thing($id)")
            .bind(("id", id))
            .await?;
        Ok(())
    }

    async fn get_story_title(&self, story_id: i32) -> Result<String> {
        let mut res = self
            .db
            .query("SELECT title FROM stories WHERE story_id = $id")
            .bind(("id", story_id))
            .await?;
        let title: Option<String> = res.take("title")?;
        Ok(title.unwrap_or_else(|| format!("Story {}", story_id)))
    }

    async fn get_episode_title(&self, episode_id: i32) -> Result<String> {
        let mut res = self
            .db
            .query("SELECT title FROM episodes WHERE episode_id = $id")
            .bind(("id", episode_id))
            .await?;
        let title: Option<String> = res.take("title")?;
        Ok(title.unwrap_or_else(|| format!("Episode {}", episode_id)))
    }

    async fn get_first_episode_id(&self, story_id: i32) -> Result<i32> {
        let mut res = self.db.query("SELECT episode_id, episode_order FROM episodes WHERE story_id = $id ORDER BY episode_order ASC LIMIT 1")
            .bind(("id", story_id)).await?;
        let id: Option<i32> = res.take("episode_id")?;
        id.ok_or_else(|| anyhow!("No episodes found for story {}", story_id))
    }

    async fn get_next_episode_id(&self, current_episode_id: i32) -> Result<Option<i32>> {
        let mut res = self
            .db
            .query(
                "
            let $curr = (SELECT story_id, episode_order FROM episodes WHERE episode_id = $id)[0];
            SELECT episode_id, episode_order FROM episodes 
            WHERE story_id = $curr.story_id AND episode_order > $curr.episode_order 
            ORDER BY episode_order ASC LIMIT 1
        ",
            )
            .bind(("id", current_episode_id))
            .await?;
        let id: Option<i32> = res.take("episode_id")?;
        Ok(id)
    }

    async fn get_episode_screens(&self, episode_id: i32) -> Result<Vec<StoryScreen>> {
        let mut response = self.db
            .query("SELECT * FROM story_screens WHERE episode_id = $episode_id ORDER BY step_order ASC LIMIT 100")
            .bind(("episode_id", episode_id))
            .await?;
        let surreal_screens: Vec<SurrealStoryScreen> = response.take(0)?;
        Ok(surreal_screens.into_iter().map(|s| s.into()).collect())
    }

    async fn update_screen_content(
        &self,
        screen_id: i32,
        content: serde_json::Value,
    ) -> Result<()> {
        let id = format!("story_screens:{}", screen_id);
        self.db
            .query("UPDATE type::thing($id) MERGE { content: $content }")
            .bind(("id", id))
            .bind(("content", content))
            .await?;
        Ok(())
    }

    async fn get_story_full_history(&self, story_id: i32) -> Result<serde_json::Value> {
        // 1. Obtener episodios
        let mut ep_res = self.db.query("SELECT episode_id, title, episode_order, episode_order as episode_number FROM episodes WHERE story_id = $id ORDER BY episode_order ASC")
            .bind(("id", story_id)).await?;
        let episodes: Vec<serde_json::Value> = ep_res.take(0)?;

        // 2. Obtener todas las pantallas
        let mut scr_res = self
            .db
            .query(
                "SELECT * FROM story_screens WHERE story_id = $id ORDER BY episode_id, step_order",
            )
            .bind(("id", story_id))
            .await?;
        let surreal_screens: Vec<SurrealStoryScreen> = scr_res.take(0)?;
        let screens: Vec<StoryScreen> = surreal_screens.into_iter().map(|s| s.into()).collect();

        // 3. Agrupar jerárquicamente
        let mut full_history = Vec::new();
        for mut ep in episodes {
            let ep_id = ep["episode_id"].as_i64().unwrap_or(0) as i32;
            let mut ep_screens = Vec::new();
            for s in &screens {
                if s.episode_id == ep_id {
                    ep_screens.push(s.clone());
                }
            }
            // Inyectar screens en el objeto episodio
            if let Some(obj) = ep.as_object_mut() {
                obj.insert("id".to_string(), serde_json::json!(ep_id)); // Asegurar que id sea el número para el frontend
                obj.insert("screens".to_string(), serde_json::json!(ep_screens));
            }
            full_history.push(ep);
        }

        Ok(serde_json::json!(full_history))
    }

    async fn get_episodes_by_story(&self, story_id: i32) -> Result<Vec<(i32, String)>> {
        let mut res = self.db.query("SELECT episode_id, title, episode_order FROM episodes WHERE story_id = $id ORDER BY episode_order ASC")
            .bind(("id", story_id)).await?;

        #[derive(Deserialize)]
        struct EpRow {
            episode_id: i32,
            title: String,
        }
        let rows: Vec<EpRow> = res.take(0)?;
        Ok(rows.into_iter().map(|r| (r.episode_id, r.title)).collect())
    }
}

#[async_trait]
impl CardProgressRepository for SurrealRepository {
    async fn upsert_card_progress(
        &self,
        user_id: &str,
        category: &str,
        deck: &str,
        card_index: i32,
        learned: bool,
    ) -> Result<()> {
        let category = category.to_lowercase();
        let deck = deck.to_lowercase();
        let id = format!(
            "card_progress:['{}', '{}', '{}', {}]",
            user_id, category, deck, card_index
        );
        let learned_at = if learned {
            Some(chrono::Utc::now())
        } else {
            None
        };

        self.db
            .query(
                "UPDATE type::thing($id) MERGE {
            user_id: $user_id,
            category: $category,
            deck: $deck,
            card_index: $card_index,
            learned: $learned,
            learned_at: $learned_at
        }",
            )
            .bind(("id", id))
            .bind(("user_id", user_id.to_string()))
            .bind(("category", category))
            .bind(("deck", deck))
            .bind(("card_index", card_index))
            .bind(("learned", learned))
            .bind(("learned_at", learned_at))
            .await?;
        Ok(())
    }

    async fn get_learned_cards(
        &self,
        user_id: &str,
        category: &str,
        deck: &str,
    ) -> Result<Vec<i32>> {
        let category = category.to_lowercase();
        let deck = deck.to_lowercase();
        let mut response = self.db
            .query("SELECT card_index FROM card_progress WHERE user_id = $user_id AND category = $category AND deck = $deck AND learned = true LIMIT 1000")
            .bind(("user_id", user_id.to_string()))
            .bind(("category", category))
            .bind(("deck", deck))
            .await?;

        let card_indices: Vec<i32> = response.take("card_index")?;
        Ok(card_indices)
    }

    async fn reset_card_progress(&self, user_id: &str, category: &str, deck: &str) -> Result<()> {
        let category = category.to_lowercase();
        let deck = deck.to_lowercase();
        self.db.query("DELETE card_progress WHERE user_id = $user_id AND category = $category AND deck = $deck")
            .bind(("user_id", user_id.to_string()))
            .bind(("category", category))
            .bind(("deck", deck))
            .await?;
        Ok(())
    }
}

#[async_trait]
impl UserRepository for SurrealRepository {
    async fn get_user_by_email(&self, email: &str) -> Result<Option<User>> {
        let mut res = self
            .db
            .query("SELECT * FROM user WHERE email = $email")
            .bind(("email", email))
            .await?;
        let user: Option<SurrealUser> = res.take(0)?;
        Ok(user.map(|u| u.into()))
    }

    async fn upsert_user(&self, user: User) -> Result<User> {
        #[derive(serde::Serialize)]
        struct SurrealUserUpdate {
            email: String,
            name: String,
            picture: Option<String>,
            role: String,
            created_at: chrono::DateTime<chrono::Utc>,
            last_login: chrono::DateTime<chrono::Utc>,
        }

        let update_data = SurrealUserUpdate {
            email: user.email.clone(),
            name: user.name,
            picture: user.picture,
            role: user.role,
            created_at: user.created_at,
            last_login: user.last_login,
        };

        let mut res = self
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
            .map(|u| u.into())
            .ok_or_else(|| anyhow!("Failed to upsert user"))
    }

    async fn list_all_users(&self) -> Result<Vec<User>> {
        let mut res = self
            .db
            .query("SELECT * FROM user ORDER BY last_login DESC")
            .await?;
        let users: Vec<SurrealUser> = res.take(0)?;
        Ok(users.into_iter().map(|u| u.into()).collect())
    }
}

#[derive(Deserialize)]
struct SurrealUserActivityStats {
    email: String,
    visit_count: Option<i32>,
    total_duration_secs: Option<i64>,
    last_device_type: Option<String>,
    last_browser: Option<String>,
    last_os: Option<String>,
    last_ip: Option<String>,
    last_country: Option<String>,
}

impl SurrealRepository {
    async fn write_activity_stats(&self, stats: &UserActivityStats) -> Result<()> {
        self.db
            .query(
                "UPDATE type::thing('user_activity_stats', $email) CONTENT {
                    email: $email,
                    visit_count: $visit_count,
                    total_duration_secs: $total_duration_secs,
                    last_device_type: $last_device_type,
                    last_browser: $last_browser,
                    last_os: $last_os,
                    last_ip: $last_ip,
                    last_country: $last_country
                }",
            )
            .bind(("email", stats.email.clone()))
            .bind(("visit_count", stats.visit_count))
            .bind(("total_duration_secs", stats.total_duration_secs))
            .bind(("last_device_type", stats.last_device_type.clone()))
            .bind(("last_browser", stats.last_browser.clone()))
            .bind(("last_os", stats.last_os.clone()))
            .bind(("last_ip", stats.last_ip.clone()))
            .bind(("last_country", stats.last_country.clone()))
            .await?;
        Ok(())
    }

    fn map_activity_stats(row: SurrealUserActivityStats) -> UserActivityStats {
        UserActivityStats {
            email: row.email,
            visit_count: row.visit_count.unwrap_or(0),
            total_duration_secs: row.total_duration_secs.unwrap_or(0),
            last_device_type: row.last_device_type,
            last_browser: row.last_browser,
            last_os: row.last_os,
            last_ip: row.last_ip,
            last_country: row.last_country,
        }
    }
}

#[async_trait]
impl UserActivityRepository for SurrealRepository {
    async fn increment_visit_count(&self, email: &str) -> Result<()> {
        let mut existing = self.get_stats(email).await?;
        existing.visit_count += 1;
        self.write_activity_stats(&existing).await
    }

    async fn add_session_duration(&self, email: &str, secs: i64) -> Result<()> {
        let mut existing = self.get_stats(email).await?;
        existing.total_duration_secs += secs;
        self.write_activity_stats(&existing).await
    }

    async fn update_last_client(&self, email: &str, client: &ClientInfo) -> Result<()> {
        let mut existing = self.get_stats(email).await?;
        existing.last_device_type = Some(client.device_type.clone());
        existing.last_browser = Some(client.browser.clone());
        existing.last_os = Some(client.os.clone());
        self.write_activity_stats(&existing).await
    }

    async fn update_last_location(
        &self,
        email: &str,
        ip: Option<&str>,
        country: Option<&str>,
    ) -> Result<()> {
        let mut existing = self.get_stats(email).await?;
        if let Some(ip) = ip {
            existing.last_ip = Some(ip.to_string());
        }
        if let Some(country) = country {
            existing.last_country = Some(country.to_string());
        }
        self.write_activity_stats(&existing).await
    }

    async fn get_stats(&self, email: &str) -> Result<UserActivityStats> {
        let mut res = self
            .db
            .query("SELECT * FROM type::thing('user_activity_stats', $email)")
            .bind(("email", email))
            .await?;
        let row: Option<SurrealUserActivityStats> = res.take(0)?;
        Ok(row
            .map(Self::map_activity_stats)
            .unwrap_or_else(|| UserActivityStats {
                email: email.to_string(),
                ..Default::default()
            }))
    }

    async fn get_all_stats(&self) -> Result<Vec<UserActivityStats>> {
        let mut res = self.db.query("SELECT * FROM user_activity_stats").await?;
        let rows: Vec<SurrealUserActivityStats> = res.take(0)?;
        Ok(rows.into_iter().map(Self::map_activity_stats).collect())
    }
}

#[async_trait]
impl SubscriptionRepository for SurrealRepository {
    async fn get_subscription(&self, email: &str) -> Result<Option<Subscription>> {
        let mut res = self
            .db
            .query("SELECT * FROM type::thing('subscription', $email)")
            .bind(("email", email))
            .await?;
        let sub: Option<Subscription> = res.take(0)?;
        Ok(sub)
    }

    async fn upsert_subscription(&self, sub: Subscription) -> Result<Subscription> {
        #[derive(serde::Serialize)]
        struct SubData {
            user_email: String,
            plan: String,
            status: String,
            starts_at: chrono::DateTime<chrono::Utc>,
            expires_at: chrono::DateTime<chrono::Utc>,
            payment_provider: Option<String>,
            external_customer_id: Option<String>,
            external_subscription_id: Option<String>,
            created_at: chrono::DateTime<chrono::Utc>,
            updated_at: chrono::DateTime<chrono::Utc>,
        }

        let data = SubData {
            user_email: sub.user_email.clone(),
            plan: sub.plan,
            status: sub.status,
            starts_at: sub.starts_at,
            expires_at: sub.expires_at,
            payment_provider: sub.payment_provider,
            external_customer_id: sub.external_customer_id,
            external_subscription_id: sub.external_subscription_id,
            created_at: sub.created_at,
            updated_at: sub.updated_at,
        };

        let mut res = self
            .db
            .query(
                "
            UPDATE type::thing('subscription', $email) CONTENT $data;
            SELECT * FROM type::thing('subscription', $email);
        ",
            )
            .bind(("email", sub.user_email.clone()))
            .bind(("data", data))
            .await?;
        let updated: Option<Subscription> = res.take(1)?;
        updated.ok_or_else(|| anyhow!("Failed to upsert subscription"))
    }

    async fn list_subscriptions(&self, limit: usize, offset: usize) -> Result<Vec<Subscription>> {
        let mut res = self
            .db
            .query("SELECT * FROM subscription ORDER BY created_at DESC LIMIT $limit START $offset")
            .bind(("limit", limit))
            .bind(("offset", offset))
            .await?;
        let subs: Vec<Subscription> = res.take(0)?;
        Ok(subs)
    }

    async fn cancel_subscription(&self, email: &str) -> Result<()> {
        self.db.query(
            "UPDATE type::thing('subscription', $email) SET status = 'cancelled', updated_at = time::now();"
        )
        .bind(("email", email))
        .await?;
        Ok(())
    }

    async fn bulk_expire_subscriptions(&self) -> Result<usize> {
        let mut res = self
            .db
            .query(
                "UPDATE subscription SET status = 'expired', updated_at = time::now()
             WHERE status = 'active' AND expires_at < time::now();",
            )
            .await?;
        let updated: Vec<Subscription> = res.take(0).unwrap_or_default();
        Ok(updated.len())
    }
}
