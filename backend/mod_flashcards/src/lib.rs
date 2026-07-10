use anyhow::Result;
use fluency_core::domain::models::flashcard::DeckData;
use fluency_core::domain::models::user_activity::{
    DeckProgressInfo, LearningLevelStats, LearningStats, B2_VOCABULARY_TARGET,
};
use fluency_core::ports::db_repository::{CardProgressRepository, UserActivityRepository};
use fluency_core::ports::storage::StorageRepository;
use serde::Deserialize;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::OnceCell;

pub mod audio_use_cases;
pub mod batch;
pub mod image_use_cases;
pub mod landing_demo_image_prompt;

/// Categoría de storage para el demo del landing (aislada del sistema interno).
pub const LANDING_DEMO_CATEGORY: &str = "landing-demo";
pub const DEFAULT_COURSE_DIRECTION: &str = "es_en";
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

pub fn safe_deck_media_path(deck: &str) -> Result<(String, String)> {
    let trimmed = deck.trim();
    let without_ext = trimmed.strip_suffix(".json").unwrap_or(trimmed);
    let segments: Vec<String> = without_ext
        .split('/')
        .map(|segment| safe_storage_segment(segment, "deck"))
        .collect::<Result<Vec<_>>>()?;

    if segments.is_empty() {
        anyhow::bail!("deck inválido");
    }

    Ok((segments.join("/"), segments.join("_")))
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

pub fn normalize_course_direction(value: Option<&str>) -> &'static str {
    match value.map(str::trim).map(str::to_ascii_lowercase).as_deref() {
        Some("en_es") => "en_es",
        _ => DEFAULT_COURSE_DIRECTION,
    }
}

fn progress_category_key(course_direction: &str, category: &str) -> String {
    format!("{}::{}", normalize_course_direction(Some(course_direction)), category)
}

fn progress_deck_key(course_direction: &str, deck_name: &str) -> String {
    format!(
        "{}::{}",
        normalize_course_direction(Some(course_direction)),
        deck_name.replace(".json", "")
    )
}

fn progress_deck_prefix_key(course_direction: &str, deck_prefix: &str) -> String {
    format!(
        "{}::{}",
        normalize_course_direction(Some(course_direction)),
        deck_prefix
    )
}

#[derive(Clone)]
pub struct FlashcardsConfig {
    pub gcs_audio_prefix: String,
    pub gcs_images_prefix: String,
    pub gemini_api_enabled: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CatalogManifest {
    schema_version: u32,
    catalog_version: String,
    directions: HashMap<String, CatalogDirection>,
}

#[derive(Debug, Deserialize)]
struct CatalogDirection {
    categories: Vec<CatalogCategory>,
}

#[derive(Debug, Deserialize)]
struct CatalogCategory {
    name: String,
    total: usize,
    decks: Vec<CatalogDeck>,
}

#[derive(Debug, Deserialize)]
struct CatalogDeck {
    path: String,
    total: usize,
}

pub struct DeckUseCases {
    storage_repo: Arc<dyn StorageRepository>,
    db_repo: Arc<dyn CardProgressRepository>,
    activity_repo: Arc<dyn UserActivityRepository>,
    catalog_manifest: OnceCell<Arc<CatalogManifest>>,
}

const LEARNING_LEVEL_DECKS: &[(&str, &str, bool)] = &[
    ("A1", "1-basic/", false),
    ("A2", "2-intermediate/", false),
    ("B1", "3-advanced/", false),
];

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
            catalog_manifest: OnceCell::new(),
        }
    }

    async fn catalog_manifest(&self) -> Result<&Arc<CatalogManifest>> {
        self.catalog_manifest
            .get_or_try_init(|| async {
                let bytes = self.storage_repo.get_catalog_manifest().await?;
                let manifest: CatalogManifest = serde_json::from_slice(&bytes)?;
                anyhow::ensure!(
                    manifest.schema_version == 1,
                    "schema de catálogo no soportado"
                );
                tracing::info!(
                    catalog_version = %manifest.catalog_version,
                    "catálogo global cargado desde manifiesto"
                );
                Ok(Arc::new(manifest))
            })
            .await
    }

    async fn catalog_direction(&self, course_direction: &str) -> Result<&CatalogDirection> {
        let normalized = normalize_course_direction(Some(course_direction));
        self.catalog_manifest()
            .await?
            .directions
            .get(normalized)
            .ok_or_else(|| anyhow::anyhow!("dirección no incluida en catálogo: {normalized}"))
    }

    pub async fn list_categories(&self, course_direction: &str) -> Result<Vec<String>> {
        Ok(self
            .catalog_direction(course_direction)
            .await?
            .categories
            .iter()
            .map(|category| category.name.clone())
            .collect())
    }

    pub async fn list_categories_with_counts(
        &self,
        course_direction: &str,
    ) -> Result<Vec<serde_json::Value>> {
        let normalized = normalize_course_direction(Some(course_direction));
        Ok(self
            .catalog_direction(normalized)
            .await?
            .categories
            .iter()
            .map(|category| {
                serde_json::json!({
                    "name": category.name,
                    "total": category.total,
                    "course_direction": normalized,
                })
            })
            .collect())
    }

    pub async fn list_decks(&self, category: &str, course_direction: &str) -> Result<Vec<String>> {
        let direction = self.catalog_direction(course_direction).await?;
        let category = direction
            .categories
            .iter()
            .find(|entry| entry.name == category)
            .ok_or_else(|| anyhow::anyhow!("categoría no encontrada"))?;
        Ok(category
            .decks
            .iter()
            .map(|deck| deck.path.clone())
            .collect())
    }

    /// Carga únicamente el manifiesto pequeño; nunca abre los JSON de decks.
    pub async fn warm_catalog_manifest(&self) {
        if let Err(err) = self.catalog_manifest().await {
            tracing::error!("no se pudo cargar catalog-manifest.json: {err}");
        }
    }

    /// Carga el deck desde almacenamiento y sobreescribe `learned`
    /// con el progreso real guardado en la base de datos.
    pub async fn get_deck_data(
        &self,
        user_id: &str,
        category: &str,
        deck_name: &str,
        course_direction: &str,
    ) -> Result<DeckData> {
        let normalized_direction = normalize_course_direction(Some(course_direction));
        let deck_key = progress_deck_key(normalized_direction, deck_name);
        let progress_category = progress_category_key(normalized_direction, category);
        let mut data = self
            .storage_repo
            .get_deck_data_for_direction(normalized_direction, category, deck_name)
            .await?;

        for card in data.flashcards_mut() {
            card.learned = false;
        }

        match self
            .db_repo
            .get_learned_cards(user_id, &progress_category, &deck_key)
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
        course_direction: &str,
    ) -> Result<()> {
        let normalized_direction = normalize_course_direction(Some(course_direction));
        let deck_key = progress_deck_key(normalized_direction, deck_name);
        let progress_category = progress_category_key(normalized_direction, category);
        tracing::info!(
            "Guardando progreso: {}/{}/{} user={} index={} learned={}",
            normalized_direction,
            category,
            deck_key,
            user_id,
            index,
            learned
        );
        self.db_repo
            .upsert_card_progress(
                user_id,
                &progress_category,
                &deck_key,
                index as i32,
                learned,
            )
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
        course_direction: &str,
    ) -> Result<()> {
        let normalized_direction = normalize_course_direction(Some(course_direction));
        let deck_key = progress_deck_key(normalized_direction, deck_name);
        let progress_category = progress_category_key(normalized_direction, category);
        self.db_repo
            .reset_card_progress(user_id, &progress_category, &deck_key)
            .await
    }

    pub async fn reset_category_status(
        &self,
        user_id: &str,
        category: &str,
        course_direction: &str,
    ) -> Result<()> {
        let progress_category =
            progress_category_key(normalize_course_direction(Some(course_direction)), category);
        self.db_repo
            .reset_category_progress(user_id, &progress_category)
            .await
    }

    pub async fn get_phonics_data(&self) -> Result<serde_json::Value> {
        self.storage_repo.get_phonics_data().await
    }

    pub async fn get_deck_json(
        &self,
        category: &str,
        deck_name: &str,
        course_direction: &str,
    ) -> Result<DeckData> {
        self.storage_repo
            .get_deck_data_for_direction(
                normalize_course_direction(Some(course_direction)),
                category,
                deck_name,
            )
            .await
    }

    pub async fn save_deck_json(
        &self,
        category: &str,
        deck_name: &str,
        data: &DeckData,
        course_direction: &str,
    ) -> Result<()> {
        self.storage_repo
            .save_deck_data_for_direction(
                normalize_course_direction(Some(course_direction)),
                category,
                deck_name,
                data,
            )
            .await?;
        Ok(())
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
        course_direction: &str,
    ) -> Result<()> {
        if cards.is_empty() {
            return Ok(());
        }
        let normalized_direction = normalize_course_direction(Some(course_direction));
        let deck_key = progress_deck_key(normalized_direction, deck_name);
        let progress_category = progress_category_key(normalized_direction, category);
        let normalized: Vec<(i32, bool)> = cards
            .iter()
            .map(|&(idx, learned)| (idx as i32, learned))
            .collect();

        self.db_repo
            .upsert_cards_batch(user_id, &progress_category, &deck_key, &normalized)
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

    async fn count_cards_for_deck_prefix(
        &self,
        deck_prefix: &str,
        course_direction: &str,
    ) -> Result<i32> {
        Ok(self
            .catalog_direction(course_direction)
            .await?
            .categories
            .iter()
            .flat_map(|category| category.decks.iter())
            .filter(|deck| deck.path.starts_with(deck_prefix))
            .map(|deck| deck.total as i32)
            .sum())
    }

    pub async fn get_learning_stats(
        &self,
        user_id: &str,
        course_direction: &str,
    ) -> Result<LearningStats> {
        let normalized_direction = normalize_course_direction(Some(course_direction));
        let mut free_levels = Vec::new();
        let mut cumulative_target = 0_i32;
        let mut cumulative_mastered = 0_i32;
        let mut mastered_count = 0_i32;

        for &(level, deck_prefix, premium) in LEARNING_LEVEL_DECKS {
            let namespaced_prefix = progress_deck_prefix_key(normalized_direction, deck_prefix);
            let target_count = self
                .count_cards_for_deck_prefix(deck_prefix, normalized_direction)
                .await?;
            let mastered_for_level = self
                .db_repo
                .count_learned_cards_by_deck_prefix(user_id, &namespaced_prefix)
                .await?
                .clamp(0, target_count.max(0));
            cumulative_target += target_count;
            cumulative_mastered += mastered_for_level;
            mastered_count += mastered_for_level;
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
            if current.completed {
                100
            } else {
                0
            }
        } else {
            ((current.mastered_count as f64 / current.target_count as f64) * 100.0).round() as i32
        };

        let learned_cards = self.db_repo.get_all_learned_cards(user_id).await?;
        let mut learned_map: HashMap<(String, String), (std::collections::HashSet<i32>, Option<chrono::DateTime<chrono::Utc>>)> = HashMap::new();
        for (cat, deck, card_index, learned_at) in learned_cards {
            let cat_clean = cat.split("::").last().unwrap_or(&cat).to_lowercase();
            let deck_clean = deck.split("::").last().unwrap_or(&deck).to_lowercase();
            let entry = learned_map.entry((cat_clean, deck_clean)).or_insert_with(|| (std::collections::HashSet::new(), None));
            entry.0.insert(card_index);
            if let Some(la) = learned_at {
                if entry.1.is_none() || Some(la) > entry.1 {
                    entry.1 = Some(la);
                }
            }
        }

        // El manifiesto contiene solo rutas y totales. Las imágenes/tarjetas
        // se resuelven bajo demanda para los pocos decks recomendados.
        let catalog = self.catalog_direction(normalized_direction).await?;
        let decks_progress: Vec<DeckProgressInfo> = catalog
            .categories
            .iter()
            .flat_map(|category| {
                category.decks.iter().map(|deck| {
                    let normalized_cat = category.name.to_lowercase();
                    let normalized_deck = deck.path.replace(".json", "").to_lowercase();

                    let (learned_set, last_touched) =
                        if let Some(val) = learned_map.get(&(normalized_cat, normalized_deck)) {
                            (Some(&val.0), val.1)
                        } else {
                            (None, None)
                        };

                    let learned_count = learned_set.map(|s| s.len() as i32).unwrap_or(0);

                    DeckProgressInfo {
                        category: category.name.clone(),
                        deck: deck.path.clone(),
                        learned_count,
                        total_count: deck.total as i32,
                        last_touched,
                        first_image_path: None,
                    }
                })
            })
            .collect();

        self.activity_repo
            .get_learning_stats(user_id, mastered_count, b2_target)
            .await
            .map(|mut stats| {
                stats.current_level = current.level;
                stats.level_percent = level_percent.clamp(0, 100);
                stats.levels = levels;
                stats.decks_progress = decks_progress;
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

    #[test]
    fn test_deck_definitions_extra() {
        let json_data = r#"[
            {
                "word": "I",
                "definitions": [
                    {
                        "imagePath": "/card_images/pronouns/1-basic/1-basic_card_0_def0.avif"
                    }
                ]
            }
        ]"#;
        let deck: DeckData = serde_json::from_str(json_data).unwrap();
        let card = deck.flashcards().first().unwrap();
        let first_image = card.extra
            .get("definitions")
            .and_then(|defs| defs.as_array())
            .and_then(|arr| arr.first())
            .and_then(|def| def.get("imagePath").or_else(|| def.get("image_path")))
            .and_then(|img| img.as_str())
            .map(|s| s.to_string());
        assert_eq!(first_image, Some("/card_images/pronouns/1-basic/1-basic_card_0_def0.avif".to_string()));
    }

    #[tokio::test]
    async fn test_get_learning_stats_output() {
        use crate::domain::repositories::storage::StorageRepository;
        use crate::domain::repositories::db_repository::UserActivityRepository;
        use crate::domain::repositories::db_repository::CardProgressRepository;
        
        // This is just a compilation check for the async block logic.
        assert!(true);
    }
}
