use anyhow::Result;
use fluency_core::domain::models::flashcard::DeckData;
use fluency_core::domain::models::user_activity::{
    LearningLevelStats, LearningStats, B2_VOCABULARY_TARGET,
};
use fluency_core::ports::db_repository::{CardProgressRepository, UserActivityRepository};
use fluency_core::ports::storage::StorageRepository;
use std::sync::Arc;

pub mod audio_use_cases;
pub mod batch;
pub mod image_use_cases;
pub mod landing_demo_image_prompt;

/// Categoría de storage para el demo del landing (aislada del sistema interno).
pub const LANDING_DEMO_CATEGORY: &str = "landing-demo";
const MAX_STORAGE_SEGMENT_LEN: usize = 96;

pub fn is_landing_demo_namespace(category: &str) -> bool {
    category == LANDING_DEMO_CATEGORY
}

pub fn safe_storage_segment(value: &str, field: &str) -> Result<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() || trimmed.len() > MAX_STORAGE_SEGMENT_LEN {
        anyhow::bail!("{field} inválido");
    }

    if trimmed
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_'))
    {
        return Ok(trimmed.to_ascii_lowercase());
    }

    anyhow::bail!("{field} contiene caracteres no permitidos")
}

pub fn safe_deck_prefix(deck: &str) -> Result<String> {
    let trimmed = deck.trim();
    let without_ext = trimmed.strip_suffix(".json").unwrap_or(trimmed);
    let media_prefix = without_ext.split('/').next().unwrap_or(without_ext);
    safe_storage_segment(media_prefix, "deck")
}

pub fn safe_form_suffix(form: Option<&str>) -> Result<String> {
    match form.map(str::trim).filter(|value| !value.is_empty()) {
        None | Some("v1") => Ok(String::new()),
        Some("v2") => Ok("_v2".to_string()),
        Some("v3") => Ok("_v3".to_string()),
        Some(_) => anyhow::bail!("form inválido"),
    }
}

pub fn safe_language_suffix(lang: Option<&str>) -> Result<String> {
    match lang.map(str::trim).filter(|value| !value.is_empty()) {
        None | Some("en") => Ok(String::new()),
        Some(value) => {
            let normalized = value.to_ascii_lowercase();
            if normalized.len() <= 16
                && normalized
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || c == '-')
            {
                Ok(format!("_{normalized}"))
            } else {
                anyhow::bail!("lang inválido")
            }
        }
    }
}

#[derive(Clone)]
pub struct FlashcardsConfig {
    pub gcs_audio_prefix: String,
    pub gcs_images_prefix: String,
    pub gemini_api_enabled: bool,
}

pub struct DeckUseCases {
    storage_repo: Arc<dyn StorageRepository>,
    db_repo: Arc<dyn CardProgressRepository>,
    activity_repo: Arc<dyn UserActivityRepository>,
}

const CATEGORY_ORDER: &[&str] = &[
    "pronouns",
    "verbs",
    "nouns",
    "adverbs",
    "adjectives",
    "connectors",
    "preposition",
    "determinant",
    "phrasal_verbs",
];

const LEARNING_LEVEL_DECKS: &[(&str, &str, bool)] = &[
    ("A1", "1-basic", false),
    ("A2", "2-intermediate", false),
    ("B1", "3-advanced", false),
];

fn category_order_index(category: &str) -> usize {
    CATEGORY_ORDER
        .iter()
        .position(|ordered| *ordered == category)
        .unwrap_or(usize::MAX)
}

impl DeckUseCases {
    pub fn new(
        storage_repo: Arc<dyn StorageRepository>,
        db_repo: Arc<dyn CardProgressRepository>,
        activity_repo: Arc<dyn UserActivityRepository>,
    ) -> Self {
        Self {
            storage_repo,
            db_repo,
            activity_repo,
        }
    }

    pub async fn list_categories(&self) -> Result<Vec<String>> {
        self.storage_repo.list_categories().await
    }

    /// Devuelve cada categoría con el total real de tarjetas sumando todos sus decks.
    pub async fn list_categories_with_counts(&self) -> Result<Vec<serde_json::Value>> {
        let mut categories = self.storage_repo.list_categories().await?;
        categories.sort_by(|a, b| {
            category_order_index(a)
                .cmp(&category_order_index(b))
                .then_with(|| a.cmp(b))
        });
        let mut result = Vec::new();
        for cat in categories {
            let decks = self.storage_repo.list_decks(&cat).await.unwrap_or_default();
            let mut total: usize = 0;
            for deck in &decks {
                if let Ok(data) = self.storage_repo.get_deck_data(&cat, deck).await {
                    total += data.flashcards().len();
                }
            }
            result.push(serde_json::json!({ "name": cat, "total": total }));
        }
        Ok(result)
    }

    pub async fn list_decks(&self, category: &str) -> Result<Vec<String>> {
        self.storage_repo.list_decks(category).await
    }

    /// Carga el deck desde almacenamiento y sobreescribe `learned`
    /// con el progreso real guardado en la base de datos.
    pub async fn get_deck_data(
        &self,
        user_id: &str,
        category: &str,
        deck_name: &str,
    ) -> Result<DeckData> {
        let deck_key = deck_name.replace(".json", "");
        let mut data = self.storage_repo.get_deck_data(category, deck_name).await?;

        for card in data.flashcards_mut() {
            card.learned = false;
        }

        match self
            .db_repo
            .get_learned_cards(user_id, category, &deck_key)
            .await
        {
            Ok(learned_indices) => {
                if !learned_indices.is_empty() {
                    let cards = data.flashcards_mut();
                    for idx in learned_indices {
                        if let Some(card) = cards.get_mut(idx as usize) {
                            card.learned = true;
                        }
                    }
                }
            }
            Err(e) => {
                tracing::warn!(
                    "No se pudo obtener progreso de DB: {}. Usando solo almacenamiento.",
                    e
                );
            }
        }

        Ok(data)
    }

    /// Guarda el estado aprendido en la base de datos. No modifica el JSON fuente.
    pub async fn update_card_status(
        &self,
        user_id: &str,
        category: &str,
        deck_name: &str,
        index: usize,
        learned: bool,
    ) -> Result<()> {
        let deck_key = deck_name.replace(".json", "");
        tracing::info!(
            "Guardando progreso: {}/{} user={} index={} learned={}",
            category,
            deck_key,
            user_id,
            index,
            learned
        );
        self.db_repo
            .upsert_card_progress(user_id, category, &deck_key, index as i32, learned)
            .await?;
        if learned {
            self.activity_repo.record_study_day(user_id).await?;
        }
        Ok(())
    }

    /// Resetea el progreso del deck eliminando las filas de progreso.
    pub async fn reset_deck_status(
        &self,
        user_id: &str,
        category: &str,
        deck_name: &str,
    ) -> Result<()> {
        let deck_key = deck_name.replace(".json", "");
        self.db_repo
            .reset_card_progress(user_id, category, &deck_key)
            .await
    }

    pub async fn reset_category_status(&self, user_id: &str, category: &str) -> Result<()> {
        self.db_repo.reset_category_progress(user_id, category).await
    }

    pub async fn get_phonics_data(&self) -> Result<serde_json::Value> {
        self.storage_repo.get_phonics_data().await
    }

    pub async fn get_deck_json(&self, category: &str, deck_name: &str) -> Result<DeckData> {
        self.storage_repo.get_deck_data(category, deck_name).await
    }

    pub async fn save_deck_json(
        &self,
        category: &str,
        deck_name: &str,
        data: &DeckData,
    ) -> Result<()> {
        self.storage_repo
            .save_deck_data(category, deck_name, data)
            .await
    }

    pub async fn blob_exists(&self, blob_path: &str) -> Result<bool> {
        self.storage_repo.blob_exists(blob_path).await
    }

    pub async fn list_files_in_dir(&self, rel_dir: &str) -> Result<Vec<String>> {
        self.storage_repo.list_files_in_dir(rel_dir).await
    }

    /// Persiste un lote de actualizaciones de tarjetas en una sola operación.
    /// Equivalente a llamar `update_card_status` N veces pero con una sola petición HTTP.
    pub async fn update_cards_batch(
        &self,
        user_id: &str,
        category: &str,
        deck_name: &str,
        cards: &[(usize, bool)],
    ) -> Result<()> {
        if cards.is_empty() {
            return Ok(());
        }
        let deck_key = deck_name.replace(".json", "");
        let normalized: Vec<(i32, bool)> = cards
            .iter()
            .map(|&(idx, learned)| (idx as i32, learned))
            .collect();

        self.db_repo
            .upsert_cards_batch(user_id, category, &deck_key, &normalized)
            .await?;

        let any_learned = cards.iter().any(|&(_, learned)| learned);
        if any_learned {
            self.activity_repo.record_study_day(user_id).await?;
        }
        Ok(())
    }

    pub async fn touch_study_day(&self, user_id: &str) -> Result<()> {
        self.activity_repo.record_study_day(user_id).await
    }

    async fn count_cards_for_deck_prefix(&self, deck_prefix: &str) -> Result<i32> {
        let categories = self.storage_repo.list_categories().await?;
        let mut total = 0_i32;

        for category in categories {
            let decks = self.storage_repo.list_decks(&category).await.unwrap_or_default();
            for deck in decks {
                if !deck.starts_with(deck_prefix) {
                    continue;
                }

                if let Ok(data) = self.storage_repo.get_deck_data(&category, &deck).await {
                    total += data.flashcards().len() as i32;
                }
            }
        }

        Ok(total)
    }

    pub async fn get_learning_stats(&self, user_id: &str) -> Result<LearningStats> {
        let mastered_count = self.db_repo.count_learned_cards(user_id).await?;
        let mut free_levels = Vec::new();
        let mut cumulative_target = 0_i32;
        let mut cumulative_mastered = 0_i32;

        for &(level, deck_prefix, premium) in LEARNING_LEVEL_DECKS {
            let target_count = self.count_cards_for_deck_prefix(deck_prefix).await?;
            let mastered_for_level = self
                .db_repo
                .count_learned_cards_by_deck_prefix(user_id, deck_prefix)
                .await?
                .clamp(0, target_count.max(0));
            cumulative_target += target_count;
            cumulative_mastered += mastered_for_level;
            free_levels.push(LearningLevelStats {
                level: level.to_string(),
                mastered_count: mastered_for_level,
                target_count,
                cumulative_mastered,
                cumulative_target,
                completed: target_count <= 0 || mastered_for_level >= target_count,
                premium,
            });
        }

        let free_target = cumulative_target;
        let b2_target = B2_VOCABULARY_TARGET.max(free_target);
        let b2_mastered = mastered_count.clamp(0, b2_target);
        let b2_span = (b2_target - free_target).max(0);
        let b2_in_level = (b2_mastered - free_target).clamp(0, b2_span);
        let b2_completed = b2_target <= 0 || b2_mastered >= b2_target;

        let mut levels = free_levels;
        levels.push(LearningLevelStats {
            level: "B2".to_string(),
            mastered_count: b2_in_level,
            target_count: b2_span,
            cumulative_mastered: b2_mastered,
            cumulative_target: b2_target,
            completed: b2_completed,
            premium: true,
        });

        let current = levels
            .iter()
            .find(|level| !level.completed)
            .or_else(|| levels.last())
            .cloned()
            .unwrap_or_else(|| LearningLevelStats {
                level: "A1".to_string(),
                mastered_count,
                target_count: B2_VOCABULARY_TARGET,
                cumulative_mastered: mastered_count,
                cumulative_target: B2_VOCABULARY_TARGET,
                completed: mastered_count >= B2_VOCABULARY_TARGET,
                premium: false,
            });
        let level_percent = if current.target_count <= 0 {
            if current.completed { 100 } else { 0 }
        } else {
            ((current.mastered_count as f64 / current.target_count as f64) * 100.0).round() as i32
        };

        self.activity_repo
            .get_learning_stats(user_id, mastered_count, b2_target)
            .await
            .map(|mut stats| {
                stats.current_level = current.level;
                stats.level_percent = level_percent.clamp(0, 100);
                stats.levels = levels;
                stats
            })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn landing_demo_namespace_is_isolated() {
        assert!(is_landing_demo_namespace("landing-demo"));
        assert!(!is_landing_demo_namespace("verbs"));
    }
}
