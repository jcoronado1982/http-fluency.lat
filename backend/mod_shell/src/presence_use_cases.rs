use std::sync::Arc;
use std::time::Duration;

use anyhow::Result;
use chrono::{DateTime, Utc};
use dashmap::DashMap;
use fluency_core::domain::models::user_activity::{
    AdminUserActivity, ClientInfo, PaginatedAdminUsers, UserActivityStats,
};
use fluency_core::ports::db_repository::{UserActivityRepository, UserRepository};
use tokio::time::interval;

const IDLE_TIMEOUT_SECS: i64 = 90;

fn is_private_ip(ip: &str) -> bool {
    matches!(ip, "127.0.0.1" | "::1" | "localhost")
        || ip.starts_with("10.")
        || ip.starts_with("192.168.")
        || ip.starts_with("172.16.")
        || ip.starts_with("172.17.")
        || ip.starts_with("172.18.")
        || ip.starts_with("172.19.")
        || ip.starts_with("172.2")
        || ip.starts_with("172.30.")
        || ip.starts_with("172.31.")
}

struct ActiveSession {
    name: String,
    picture: Option<String>,
    client: ClientInfo,
    country: Option<String>,
    session_start: DateTime<Utc>,
    last_seen: DateTime<Utc>,
}

pub struct PresenceUseCases {
    active: Arc<DashMap<String, ActiveSession>>,
    user_repo: Arc<dyn UserRepository>,
    activity_repo: Arc<dyn UserActivityRepository>,
    http_client: reqwest::Client,
}

impl PresenceUseCases {
    pub fn new(
        user_repo: Arc<dyn UserRepository>,
        activity_repo: Arc<dyn UserActivityRepository>,
    ) -> Self {
        let active = Arc::new(DashMap::new());
        let sweep_active = active.clone();
        let sweep_repo = activity_repo.clone();

        tokio::spawn(async move {
            let mut tick = interval(Duration::from_secs(30));
            loop {
                tick.tick().await;
                sweep_stale_sessions(&sweep_active, &sweep_repo).await;
            }
        });

        Self {
            active,
            user_repo,
            activity_repo,
            http_client: reqwest::Client::new(),
        }
    }

    pub async fn heartbeat(
        &self,
        email: &str,
        name: &str,
        picture: Option<String>,
        client: ClientInfo,
        client_ip: Option<String>,
        header_country: Option<String>,
    ) {
        let now = Utc::now();
        let _ = self.activity_repo.update_last_client(email, &client).await;

        let country = self
            .resolve_country(email, client_ip.as_deref(), header_country.as_deref())
            .await;
        if client_ip.is_some() || country.is_some() {
            let _ = self
                .activity_repo
                .update_last_location(email, client_ip.as_deref(), country.as_deref())
                .await;
        }

        if let Some(mut session) = self.active.get_mut(email) {
            session.last_seen = now;
            session.client = client;
            session.country = country;
            if !name.is_empty() {
                session.name = name.to_string();
            }
            if picture.is_some() {
                session.picture = picture;
            }
        } else {
            let _ = self.activity_repo.increment_visit_count(email).await;
            self.active.insert(
                email.to_string(),
                ActiveSession {
                    name: name.to_string(),
                    picture,
                    client,
                    country,
                    session_start: now,
                    last_seen: now,
                },
            );
        }
    }

    async fn resolve_country(
        &self,
        email: &str,
        client_ip: Option<&str>,
        header_country: Option<&str>,
    ) -> Option<String> {
        if let Some(country) = header_country {
            if !country.is_empty() {
                return Some(country.to_string());
            }
        }

        let ip = client_ip?;
        if is_private_ip(ip) {
            return Some("Local".to_string());
        }

        let existing = self.activity_repo.get_stats(email).await.ok();
        if existing.as_ref().and_then(|s| s.last_ip.as_deref()) == Some(ip) {
            if let Some(country) = existing.and_then(|s| s.last_country) {
                return Some(country);
            }
        }

        self.lookup_country(ip).await
    }

    async fn lookup_country(&self, ip: &str) -> Option<String> {
        let url = format!("http://ip-api.com/json/{ip}?fields=country");
        let response = self.http_client.get(&url).send().await.ok()?;
        let json: serde_json::Value = response.json().await.ok()?;
        json.get("country")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
    }

    pub async fn leave(&self, email: &str) {
        self.close_session(email).await;
    }

    pub async fn get_admin_dashboard(
        &self,
        page: usize,
        limit: usize,
    ) -> Result<PaginatedAdminUsers> {
        let mut users = self.user_repo.list_all_users().await?;
        let stats_list = self.activity_repo.get_all_stats().await?;
        let now = Utc::now();

        // Sort completely first so pagination is stable across requests
        users.sort_by(|a, b| {
            let a_online = self.active.contains_key(&a.email);
            let b_online = self.active.contains_key(&b.email);
            b_online
                .cmp(&a_online)
                .then_with(|| b.last_login.cmp(&a.last_login))
        });

        let total = users.len();
        let total_pages = (total + limit - 1) / limit;

        let start = (page.saturating_sub(1)) * limit;
        let end = (start + limit).min(total);

        let page_users = if start < total {
            &users[start..end]
        } else {
            &[]
        };

        let mut rows = Vec::with_capacity(page_users.len());
        for user in page_users {
            let stats = stats_list
                .iter()
                .find(|s| s.email == user.email)
                .cloned()
                .unwrap_or_else(|| UserActivityStats {
                    email: user.email.clone(),
                    ..Default::default()
                });

            let (is_online, current_session_secs, device_type, browser, os, country) =
                if let Some(session) = self.active.get(&user.email) {
                    let secs = (now - session.session_start).num_seconds().max(0);
                    (
                        true,
                        Some(secs),
                        Some(session.client.device_type.clone()),
                        Some(session.client.browser.clone()),
                        Some(session.client.os.clone()),
                        session.country.clone(),
                    )
                } else {
                    (
                        false,
                        None,
                        stats.last_device_type.clone(),
                        stats.last_browser.clone(),
                        stats.last_os.clone(),
                        stats.last_country.clone(),
                    )
                };

            let avg_duration_secs = if stats.visit_count > 0 {
                stats.total_duration_secs as f64 / stats.visit_count as f64
            } else {
                0.0
            };

            rows.push(AdminUserActivity {
                email: user.email.clone(),
                name: user.name.clone(),
                picture: user.picture.clone(),
                role: user.role.clone(),
                last_login: user.last_login,
                is_online,
                current_session_secs,
                visit_count: stats.visit_count,
                avg_duration_secs,
                device_type,
                browser,
                os,
                country,
            });
        }

        Ok(PaginatedAdminUsers {
            users: rows,
            total,
            page: page.max(1),
            total_pages,
        })
    }

    async fn close_session(&self, email: &str) {
        if let Some((_, session)) = self.active.remove(email) {
            let duration = (session.last_seen - session.session_start)
                .num_seconds()
                .max(0);
            let _ = self
                .activity_repo
                .add_session_duration(email, duration)
                .await;
        }
    }
}

async fn sweep_stale_sessions(
    active: &DashMap<String, ActiveSession>,
    activity_repo: &Arc<dyn UserActivityRepository>,
) {
    let now = Utc::now();
    let stale: Vec<String> = active
        .iter()
        .filter(|entry| (now - entry.last_seen).num_seconds() > IDLE_TIMEOUT_SECS)
        .map(|entry| entry.key().clone())
        .collect();

    for email in stale {
        if let Some((_, session)) = active.remove(&email) {
            let duration = (session.last_seen - session.session_start)
                .num_seconds()
                .max(0);
            let _ = activity_repo.add_session_duration(&email, duration).await;
        }
    }
}
