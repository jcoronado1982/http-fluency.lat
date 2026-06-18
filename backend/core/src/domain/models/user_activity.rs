use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct ClientInfo {
    pub device_type: String,
    pub browser: String,
    pub os: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct UserActivityStats {
    pub email: String,
    pub visit_count: i32,
    pub total_duration_secs: i64,
    pub last_device_type: Option<String>,
    pub last_browser: Option<String>,
    pub last_os: Option<String>,
    /// Stored for geo lookup only — never exposed in admin API responses.
    pub last_ip: Option<String>,
    pub last_country: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct PaginatedAdminUsers {
    pub users: Vec<AdminUserActivity>,
    pub total: usize,
    pub page: usize,
    pub total_pages: usize,
}

#[derive(Debug, Serialize)]
pub struct AdminUserActivity {
    pub email: String,
    pub name: String,
    pub picture: Option<String>,
    pub role: String,
    pub last_login: chrono::DateTime<chrono::Utc>,
    pub is_online: bool,
    pub current_session_secs: Option<i64>,
    pub visit_count: i32,
    pub avg_duration_secs: f64,
    pub device_type: Option<String>,
    pub browser: Option<String>,
    pub os: Option<String>,
    pub country: Option<String>,
}
