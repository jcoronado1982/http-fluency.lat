use crate::api::middleware::auth::extract_claims;
use crate::api::middleware::client_ip::{extract_client_ip, resolve_country};
use crate::AppState;
use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Deserialize)]
pub struct DemoFeedbackBody {
    pub comment: String,
    #[serde(default)]
    pub rating: Option<u8>,
    #[serde(default)]
    pub language: Option<String>,
    #[serde(default)]
    pub source: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
struct DemoFeedbackRecord {
    created_at: String,
    user_email: String,
    user_name: String,
    comment: String,
    #[serde(default)]
    rating: Option<u8>,
    #[serde(default)]
    language: Option<String>,
    #[serde(default)]
    source: Option<String>,
    #[serde(default)]
    picture: Option<String>,
    #[serde(default)]
    country: Option<String>,
    #[serde(default)]
    user_handle: Option<String>,
}

#[derive(Serialize)]
struct DemoFeedbackReview {
    user_name: String,
    rating: u8,
    comment: String,
    created_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    picture: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    country: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    user_handle: Option<String>,
}

#[derive(Serialize)]
struct DemoFeedbackSummary {
    average: f64,
    count: u32,
}

#[derive(Serialize)]
struct DemoFeedbackListResponse {
    summary: DemoFeedbackSummary,
    reviews: Vec<DemoFeedbackReview>,
}

#[derive(Deserialize)]
pub struct DemoFeedbackListQuery {
    #[serde(default = "default_list_limit")]
    pub limit: usize,
}

fn default_list_limit() -> usize {
    20
}

fn feedback_path(state: &AppState) -> PathBuf {
    PathBuf::from(&state.settings.local_storage_path).join("demo_feedback.jsonl")
}

fn validate_rating(rating: u8) -> Result<(), (StatusCode, String)> {
    if !(1..=5).contains(&rating) {
        return Err((
            StatusCode::BAD_REQUEST,
            "La calificación debe ser entre 1 y 5 estrellas".to_string(),
        ));
    }
    Ok(())
}

fn validate_comment(raw: &str) -> Result<&str, (StatusCode, String)> {
    let comment = raw.trim();
    if comment.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            "El comentario está vacío".to_string(),
        ));
    }
    if comment.chars().count() > 500 {
        return Err((
            StatusCode::BAD_REQUEST,
            "El comentario supera 500 caracteres".to_string(),
        ));
    }
    Ok(comment)
}

fn full_display_name(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        "Usuario".to_string()
    } else {
        trimmed.to_string()
    }
}

fn email_handle(email: &str) -> String {
    let local = email.split('@').next().unwrap_or("user").trim();
    if local.is_empty() {
        "@user".to_string()
    } else {
        format!("@{local}")
    }
}

fn build_feedback_list_response(
    mut records: Vec<DemoFeedbackRecord>,
    limit: usize,
) -> DemoFeedbackListResponse {
    let limit = limit.clamp(1, 50);
    records.sort_by(|a, b| b.created_at.cmp(&a.created_at));

    let with_comments: Vec<&DemoFeedbackRecord> = records
        .iter()
        .filter(|record| !record.comment.trim().is_empty())
        .collect();

    let count = with_comments.len() as u32;
    let average = if count == 0 {
        0.0
    } else {
        let sum: u32 = with_comments
            .iter()
            .map(|record| u32::from(record.rating.unwrap_or(5)))
            .sum();
        ((sum as f64 / f64::from(count)) * 10.0).round() / 10.0
    };

    let reviews = with_comments
        .into_iter()
        .take(limit)
        .map(|record| DemoFeedbackReview {
            user_name: full_display_name(&record.user_name),
            rating: record.rating.unwrap_or(5),
            comment: record.comment.clone(),
            created_at: record.created_at.clone(),
            picture: record.picture.clone(),
            country: record.country.clone(),
            user_handle: record
                .user_handle
                .clone()
                .or_else(|| Some(email_handle(&record.user_email))),
        })
        .collect();

    DemoFeedbackListResponse {
        summary: DemoFeedbackSummary { average, count },
        reviews,
    }
}

fn feedback_submit_response(stored_records: usize) -> serde_json::Value {
    serde_json::json!({
        "success": true,
        "audit": {
            "persisted": true,
            "stored_records": stored_records
        }
    })
}

async fn read_feedback_records(
    path: &Path,
) -> Result<Vec<DemoFeedbackRecord>, (StatusCode, String)> {
    let content = match tokio::fs::read_to_string(path).await {
        Ok(c) => c,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            tracing::info!(
                target: "demo_feedback_audit",
                path = %path.display(),
                "GET feedback: el archivo todavía no existe"
            );
            return Ok(Vec::new());
        }
        Err(e) => return Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string())),
    };

    let mut records = Vec::new();
    let mut invalid_lines = 0_u32;
    for line in content.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        match serde_json::from_str::<DemoFeedbackRecord>(line) {
            Ok(record) => records.push(record),
            Err(_) => invalid_lines += 1,
        }
    }
    tracing::info!(
        target: "demo_feedback_audit",
        path = %path.display(),
        bytes = content.len(),
        records = records.len(),
        invalid_lines,
        "GET feedback: archivo auditado"
    );
    Ok(records)
}

pub async fn list_demo_feedback(
    State(state): State<AppState>,
    Query(query): Query<DemoFeedbackListQuery>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let limit = query.limit.clamp(1, 50);
    let path = feedback_path(&state);
    let records = read_feedback_records(&path).await?;

    tracing::info!(
        target: "demo_feedback_audit",
        path = %path.display(),
        limit,
        records = records.len(),
        "GET /api/demo-feedback"
    );

    Ok(Json(build_feedback_list_response(records, limit)))
}

pub async fn submit_demo_feedback(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    Json(body): Json<DemoFeedbackBody>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let claims = extract_claims(&state, &headers)?;

    let comment = validate_comment(&body.comment)?;

    let rating = body.rating.ok_or((
        StatusCode::BAD_REQUEST,
        "Selecciona una calificación de 1 a 5 estrellas".to_string(),
    ))?;
    validate_rating(rating)?;

    let (user_name, picture) = {
        #[cfg(feature = "auth")]
        {
            match state.auth_use_cases.get_user_profile(&claims.email).await {
                Ok(Some(user)) => (user.name, user.picture),
                _ => (claims.name.clone(), None),
            }
        }
        #[cfg(not(feature = "auth"))]
        {
            (claims.name.clone(), None)
        }
    };

    let client_ip = extract_client_ip(&headers);
    let country = resolve_country(&headers, client_ip.as_deref()).await;

    let record = DemoFeedbackRecord {
        created_at: Utc::now().to_rfc3339(),
        user_email: claims.email.clone(),
        user_name: full_display_name(&user_name),
        comment: comment.to_string(),
        rating: Some(rating),
        language: body.language.clone(),
        source: body.source.clone(),
        picture,
        country,
        user_handle: Some(email_handle(&claims.email)),
    };

    let line = serde_json::to_string(&record)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let path = feedback_path(&state);

    if let Some(parent) = path.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    }

    use tokio::io::AsyncWriteExt;
    let mut file = tokio::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    file.write_all(format!("{line}\n").as_bytes())
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // La respuesta de éxito solo sale después de que el contenido quede
    // visible para una lectura nueva (el mismo flujo que ejecuta la recarga).
    file.flush()
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    file.sync_data()
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    drop(file);

    let persisted_records = read_feedback_records(&path).await?;
    let persisted = persisted_records.iter().any(|saved| {
        saved.created_at == record.created_at && saved.user_email == record.user_email
    });
    if !persisted {
        tracing::error!(
            target: "demo_feedback_audit",
            path = %path.display(),
            user = %claims.email,
            "POST feedback: la verificación posterior a escritura falló"
        );
        return Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            "El comentario no pudo verificarse después de guardarlo".to_string(),
        ));
    }

    tracing::info!(
        target: "demo_feedback_audit",
        path = %path.display(),
        user = %claims.email,
        rating,
        stored_records = persisted_records.len(),
        "POST feedback: guardado y verificado"
    );

    Ok(Json(feedback_submit_response(persisted_records.len())))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn record(
        created_at: &str,
        name: &str,
        email: &str,
        comment: &str,
        rating: Option<u8>,
    ) -> DemoFeedbackRecord {
        DemoFeedbackRecord {
            created_at: created_at.to_string(),
            user_email: email.to_string(),
            user_name: name.to_string(),
            comment: comment.to_string(),
            rating,
            language: Some("es".to_string()),
            source: Some("landing-demo".to_string()),
            picture: None,
            country: None,
            user_handle: None,
        }
    }

    #[test]
    fn full_display_name_keeps_complete_name() {
        assert_eq!(
            full_display_name("Jesús Alberto Coronado"),
            "Jesús Alberto Coronado"
        );
        assert_eq!(full_display_name("Ana"), "Ana");
        assert_eq!(full_display_name(""), "Usuario");
    }

    #[test]
    fn email_handle_from_email() {
        assert_eq!(email_handle("jesus@fluency.lat"), "@jesus");
        assert_eq!(email_handle("@fluency.lat"), "@user");
        assert_eq!(email_handle("plain-user"), "@plain-user");
    }

    #[test]
    fn rating_accepts_only_one_through_five() {
        for rating in 1..=5 {
            assert!(validate_rating(rating).is_ok());
        }
        assert_eq!(validate_rating(0).unwrap_err().0, StatusCode::BAD_REQUEST);
        assert_eq!(validate_rating(6).unwrap_err().0, StatusCode::BAD_REQUEST);
    }

    #[test]
    fn comment_validation_trims_and_counts_unicode_characters() {
        assert_eq!(validate_comment("  excelente  ").unwrap(), "excelente");
        assert!(validate_comment(&"á".repeat(500)).is_ok());
        assert_eq!(
            validate_comment(&"á".repeat(501)).unwrap_err().0,
            StatusCode::BAD_REQUEST
        );
        assert_eq!(
            validate_comment(" \n\t ").unwrap_err().0,
            StatusCode::BAD_REQUEST
        );
    }

    #[test]
    fn feedback_list_filters_sorts_limits_and_summarizes() {
        let response = build_feedback_list_response(
            vec![
                record(
                    "2026-01-01T00:00:00Z",
                    "Old",
                    "old@example.com",
                    "Bien",
                    Some(4),
                ),
                record(
                    "2026-01-03T00:00:00Z",
                    "Newest",
                    "new@example.com",
                    "Excelente",
                    Some(5),
                ),
                record(
                    "2026-01-02T00:00:00Z",
                    "Blank",
                    "blank@example.com",
                    "   ",
                    Some(1),
                ),
                record(
                    "2025-12-31T00:00:00Z",
                    "Legacy",
                    "legacy@example.com",
                    "Útil",
                    None,
                ),
            ],
            2,
        );

        assert_eq!(response.summary.count, 3);
        assert_eq!(response.summary.average, 4.7);
        assert_eq!(response.reviews.len(), 2);
        assert_eq!(response.reviews[0].user_name, "Newest");
        assert_eq!(response.reviews[0].user_handle.as_deref(), Some("@new"));
        assert_eq!(response.reviews[1].user_name, "Old");

        let payload = serde_json::to_value(&response).expect("serializable list response");
        assert_eq!(
            payload["summary"],
            serde_json::json!({ "average": 4.7, "count": 3 })
        );
        assert_eq!(payload["reviews"][0]["comment"], "Excelente");
    }

    #[test]
    fn feedback_list_empty_and_limit_edges_are_stable() {
        let empty = build_feedback_list_response(Vec::new(), 0);
        assert_eq!(empty.summary.count, 0);
        assert_eq!(empty.summary.average, 0.0);
        assert!(empty.reviews.is_empty());

        let records = (0..55)
            .map(|index| {
                record(
                    &format!("2026-01-{day:02}T00:00:00Z", day = (index % 28) + 1),
                    "User",
                    "user@example.com",
                    "Comentario",
                    Some(5),
                )
            })
            .collect();
        assert_eq!(
            build_feedback_list_response(records, usize::MAX)
                .reviews
                .len(),
            50
        );
    }

    #[test]
    fn submit_success_response_matches_the_frontend_contract() {
        assert_eq!(
            feedback_submit_response(7),
            serde_json::json!({
                "success": true,
                "audit": {
                    "persisted": true,
                    "stored_records": 7
                }
            })
        );
    }
}
