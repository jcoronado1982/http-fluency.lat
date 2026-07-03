use super::connection::SurrealConnection;
use crate::domain::repositories::db_repository::CardProgressRepository;
use anyhow::Result;
use async_trait::async_trait;
use serde::Deserialize;
use std::sync::Arc;

pub struct SurrealCardProgressRepository(pub Arc<SurrealConnection>);

#[async_trait]
impl CardProgressRepository for SurrealCardProgressRepository {
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

        self.0
            .db
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
        let mut response = self
            .0
            .db
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
        self.0
            .db
            .query("DELETE card_progress WHERE user_id = $user_id AND category = $category AND deck = $deck")
            .bind(("user_id", user_id.to_string()))
            .bind(("category", category))
            .bind(("deck", deck))
            .await?;
        Ok(())
    }

    async fn reset_category_progress(&self, user_id: &str, category: &str) -> Result<()> {
        let category = category.to_lowercase();
        self.0
            .db
            .query("DELETE card_progress WHERE user_id = $user_id AND category = $category")
            .bind(("user_id", user_id.to_string()))
            .bind(("category", category))
            .await?;
        Ok(())
    }

    async fn upsert_cards_batch(
        &self,
        user_id: &str,
        category: &str,
        deck: &str,
        cards: &[(i32, bool)],
    ) -> Result<()> {
        if cards.is_empty() {
            return Ok(());
        }
        let category = category.to_lowercase();
        let deck = deck.to_lowercase();
        for &(card_index, learned) in cards {
            let id = format!(
                "card_progress:['{}', '{}', '{}', {}]",
                user_id, category, deck, card_index
            );
            let learned_at = if learned {
                Some(chrono::Utc::now())
            } else {
                None
            };
            self.0
                .db
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
                .bind(("category", category.clone()))
                .bind(("deck", deck.clone()))
                .bind(("card_index", card_index))
                .bind(("learned", learned))
                .bind(("learned_at", learned_at))
                .await?;
        }
        Ok(())
    }

    async fn count_learned_cards(&self, user_id: &str) -> Result<i32> {
        let mut response = self
            .0
            .db
            .query("SELECT count() AS total FROM card_progress WHERE user_id = $user_id AND learned = true GROUP ALL")
            .bind(("user_id", user_id.to_string()))
            .await?;

        #[derive(Deserialize)]
        struct CountRow {
            total: i32,
        }

        let rows: Vec<CountRow> = response.take(0)?;
        Ok(rows.first().map(|row| row.total).unwrap_or(0))
    }

    async fn count_learned_cards_by_deck_prefix(
        &self,
        user_id: &str,
        deck_prefix: &str,
    ) -> Result<i32> {
        let normalized_prefix = deck_prefix.to_lowercase();
        let mut response = self
            .0
            .db
            .query("SELECT deck FROM card_progress WHERE user_id = $user_id AND learned = true LIMIT 100000")
            .bind(("user_id", user_id.to_string()))
            .await?;

        #[derive(Deserialize)]
        struct DeckRow {
            deck: Option<String>,
        }

        let rows: Vec<DeckRow> = response.take(0)?;
        Ok(rows
            .into_iter()
            .filter(|row| {
                row.deck
                    .as_deref()
                    .is_some_and(|deck| deck.starts_with(&normalized_prefix))
            })
            .count() as i32)
    }
}
