use crate::domain::models::tutor::TutorRequest;
use crate::domain::repositories::db_repository::PronounPracticeRepository;
use crate::domain::repositories::tutor::AITutor;
use anyhow::Result;
use serde_json::Value;
use std::sync::Arc;

pub struct TutorUseCases {
    ai_tutor: Arc<dyn AITutor>,
    db_repo: Option<Arc<dyn PronounPracticeRepository>>,
}

impl TutorUseCases {
    pub fn new(
        ai_tutor: Arc<dyn AITutor>,
        db_repo: Option<Arc<dyn PronounPracticeRepository>>,
    ) -> Self {
        Self { ai_tutor, db_repo }
    }

    pub async fn analyze_error(&self, request: TutorRequest) -> Result<String> {
        let result_str = self
            .ai_tutor
            .analyze_error(
                &request.user_input,
                &request.correct_answer,
                &request.context_spanish,
            )
            .await?;

        // Log to DB if it's an error using Rust 1.95.0 if-let guards for cleaner logic
        if let Ok(data) = serde_json::from_str::<Value>(&result_str) {
            match (self.db_repo.as_ref(), request.user_id, request.story_id, request.screen_id)
            {
                (
                    Some(db_repo),
                    Some(user_id),
                    Some(story_id),
                    Some(screen_id),
                ) if !data["is_correct"].as_bool().unwrap_or(true) => {
                    let _ = db_repo
                        .log_user_error(
                            &user_id,
                            story_id,
                            screen_id,
                            &request.user_input,
                            &request.correct_answer,
                            data["error_code"].as_str().unwrap_or("unknown"),
                            data["explanation"].as_str().unwrap_or(""),
                        )
                        .await;
                }
                _ => {}
            }
        }

        Ok(result_str)
    }

    pub async fn explain_like_child(&self, request: TutorRequest) -> Result<String> {
        self.ai_tutor
            .explain_like_child(
                &request.user_input,
                &request.correct_answer,
                &request.context_spanish,
                request.original_explanation.as_deref(),
            )
            .await
    }

    pub async fn improve_prompt_for_image(
        &self,
        phrase: &str,
        pos_category: &str,
        meaning: Option<&str>,
        usage_example: Option<&str>,
    ) -> Result<String> {
        self.ai_tutor
            .improve_prompt_for_image(phrase, pos_category, meaning, usage_example)
            .await
    }
}
