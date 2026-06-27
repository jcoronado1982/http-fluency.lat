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
    /// UTC calendar date (YYYY-MM-DD) of the last recorded study session.
    pub last_study_date: Option<String>,
    pub current_streak: i32,
    pub longest_streak: i32,
}

#[derive(Debug, Serialize, Clone)]
pub struct LearningStats {
    pub mastered_count: i32,
    pub target_count: i32,
    pub target_label: String,
    pub percent: i32,
    pub streak_days: i32,
    pub longest_streak: i32,
    pub studied_today: bool,
    pub streak_at_risk: bool,
}

/// B2 receptive vocabulary benchmark used for the dashboard progress ring.
pub const B2_VOCABULARY_TARGET: i32 = 2500;

pub fn compute_streak_display(
    last_study_date: Option<&str>,
    stored_streak: i32,
    today: &str,
    yesterday: &str,
) -> (i32, bool, bool) {
    match last_study_date {
        Some(date) if date == today => (stored_streak.max(0), true, false),
        Some(date) if date == yesterday => (stored_streak.max(0), false, stored_streak > 0),
        Some(_) => (0, false, false),
        None => (0, false, false),
    }
}

pub fn build_learning_stats(
    mastered_count: i32,
    target_count: i32,
    target_label: &str,
    last_study_date: Option<&str>,
    stored_streak: i32,
    longest_streak: i32,
    today: &str,
    yesterday: &str,
) -> LearningStats {
    let (streak_days, studied_today, streak_at_risk) =
        compute_streak_display(last_study_date, stored_streak, today, yesterday);
    let percent = if target_count <= 0 {
        0
    } else {
        ((mastered_count as f64 / target_count as f64) * 100.0).round() as i32
    };

    LearningStats {
        mastered_count,
        target_count,
        target_label: target_label.to_string(),
        percent: percent.min(100),
        streak_days,
        longest_streak,
        studied_today,
        streak_at_risk,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn streak_is_active_when_studied_today() {
        let (days, today, at_risk) =
            compute_streak_display(Some("2026-06-23"), 5, "2026-06-23", "2026-06-22");
        assert_eq!(days, 5);
        assert!(today);
        assert!(!at_risk);
    }

    #[test]
    fn streak_is_at_risk_after_missing_today() {
        let (days, today, at_risk) =
            compute_streak_display(Some("2026-06-22"), 5, "2026-06-23", "2026-06-22");
        assert_eq!(days, 5);
        assert!(!today);
        assert!(at_risk);
    }

    #[test]
    fn streak_resets_when_gap_is_too_long() {
        let (days, today, at_risk) =
            compute_streak_display(Some("2026-06-20"), 5, "2026-06-23", "2026-06-22");
        assert_eq!(days, 0);
        assert!(!today);
        assert!(!at_risk);
    }
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
