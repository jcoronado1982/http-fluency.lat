use super::connection::SurrealConnection;
use super::models::SurrealUserActivityStats;
use crate::domain::models::user_activity::{ClientInfo, UserActivityStats};
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
}
