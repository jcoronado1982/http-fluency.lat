use super::connection::SurrealConnection;
use super::models::SurrealUserActivityStats;
use crate::domain::models::user_activity::{
    build_learning_stats, ClientInfo, LearningStats, UserActivityStats,
};
use crate::domain::repositories::db_repository::UserActivityRepository;
use anyhow::Result;
use async_trait::async_trait;
use std::sync::Arc;

pub struct SurrealUserActivityRepository(pub Arc<SurrealConnection>);

impl SurrealUserActivityRepository {
    async fn write_activity_stats(&self, stats: &UserActivityStats) -> Result<()> {
        self.0
            .db
            .query(
                "UPDATE type::thing('user_activity_stats', $email) CONTENT {
                    email: $email,
                    visit_count: $visit_count,
                    total_duration_secs: $total_duration_secs,
                    last_device_type: $last_device_type,
                    last_browser: $last_browser,
                    last_os: $last_os,
                    last_ip: $last_ip,
                    last_country: $last_country,
                    last_study_date: $last_study_date,
                    current_streak: $current_streak,
                    longest_streak: $longest_streak
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
            .bind(("last_study_date", stats.last_study_date.clone()))
            .bind(("current_streak", stats.current_streak))
            .bind(("longest_streak", stats.longest_streak))
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
            last_study_date: row.last_study_date,
            current_streak: row.current_streak.unwrap_or(0),
            longest_streak: row.longest_streak.unwrap_or(0),
        }
    }

    fn today_utc() -> String {
        chrono::Utc::now().format("%Y-%m-%d").to_string()
    }

    fn yesterday_utc() -> String {
        (chrono::Utc::now() - chrono::Duration::days(1))
            .format("%Y-%m-%d")
            .to_string()
    }
}

#[async_trait]
impl UserActivityRepository for SurrealUserActivityRepository {
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
            .0
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
        let mut res = self.0.db.query("SELECT * FROM user_activity_stats").await?;
        let rows: Vec<SurrealUserActivityStats> = res.take(0)?;
        Ok(rows.into_iter().map(Self::map_activity_stats).collect())
    }

    async fn record_study_day(&self, email: &str) -> Result<()> {
        let today = Self::today_utc();
        let yesterday = Self::yesterday_utc();
        let mut existing = self.get_stats(email).await?;

        if existing.last_study_date.as_deref() == Some(today.as_str()) {
            return Ok(());
        }

        if existing.last_study_date.as_deref() == Some(yesterday.as_str()) {
            existing.current_streak = existing.current_streak.max(0) + 1;
        } else {
            existing.current_streak = 1;
        }

        if existing.current_streak > existing.longest_streak {
            existing.longest_streak = existing.current_streak;
        }
        existing.last_study_date = Some(today);
        self.write_activity_stats(&existing).await
    }

    async fn get_learning_stats(
        &self,
        email: &str,
        mastered_count: i32,
        target_count: i32,
    ) -> Result<LearningStats> {
        let stats = self.get_stats(email).await?;
        Ok(build_learning_stats(
            mastered_count,
            target_count,
            "B2",
            stats.last_study_date.as_deref(),
            stats.current_streak,
            stats.longest_streak,
            &Self::today_utc(),
            &Self::yesterday_utc(),
        ))
    }
}
