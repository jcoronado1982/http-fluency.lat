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
            .db()
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
            .db()
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
            .db()
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
            .db()
            .query("DELETE card_progress WHERE user_id = $user_id AND category = $category")
            .bind(("user_id", user_id.to_string()))
            .bind(("category", category))
            .await?;
        Ok(())
    }

    /// Persiste el lote completo en UNA sola transacción (1 round-trip al servidor),
    /// en vez de una query por tarjeta. Crítico con SurrealDB remoto: con 500 usuarios
    /// concurrentes el WS compartido no tolera N round-trips por batch.
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
        let now = chrono::Utc::now();

        let mut sql = String::with_capacity(64 + cards.len() * 220);
        sql.push_str("BEGIN TRANSACTION;\n");
        for i in 0..cards.len() {
            sql.push_str(&format!(
                "UPDATE type::thing($id_{i}) MERGE {{
                    user_id: $user_id,
                    category: $category,
                    deck: $deck,
                    card_index: $card_index_{i},
                    learned: $learned_{i},
                    learned_at: $learned_at_{i}
                }};\n"
            ));
        }
        sql.push_str("COMMIT TRANSACTION;");

        let db = self.0.db();
        let mut query = db
            .query(sql)
            .bind(("user_id", user_id.to_string()))
            .bind(("category", category.clone()))
            .bind(("deck", deck.clone()));

        for (i, &(card_index, learned)) in cards.iter().enumerate() {
            let id = format!(
                "card_progress:['{}', '{}', '{}', {}]",
                user_id, category, deck, card_index
            );
            let learned_at = if learned { Some(now) } else { None };
            query = query
                .bind((format!("id_{i}"), id))
                .bind((format!("card_index_{i}"), card_index))
                .bind((format!("learned_{i}"), learned))
                .bind((format!("learned_at_{i}"), learned_at));
        }

        // .check() propaga errores por-statement (p.ej. transacción cancelada),
        // que .await? solo no reporta.
        query.await?.check()?;
        Ok(())
    }

    async fn count_learned_cards(&self, user_id: &str) -> Result<i32> {
        let mut response = self
            .0
            .db()
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

    /// Cuenta directamente en la DB — antes traía hasta 100k filas al backend
    /// para filtrarlas en Rust, lo que saturaba red y memoria bajo carga.
    async fn count_learned_cards_by_deck_prefix(
        &self,
        user_id: &str,
        deck_prefix: &str,
    ) -> Result<i32> {
        let normalized_prefix = deck_prefix.to_lowercase();
        let mut response = self
            .0
            .db()
            .query("SELECT count() AS total FROM card_progress WHERE user_id = $user_id AND learned = true AND string::startsWith(deck, $prefix) GROUP ALL")
            .bind(("user_id", user_id.to_string()))
            .bind(("prefix", normalized_prefix))
            .await?;

        #[derive(Deserialize)]
        struct CountRow {
            total: i32,
        }

        let rows: Vec<CountRow> = response.take(0)?;
        Ok(rows.first().map(|row| row.total).unwrap_or(0))
    }

    async fn get_all_learned_cards(
        &self,
        user_id: &str,
    ) -> Result<Vec<(String, String, i32, Option<chrono::DateTime<chrono::Utc>>)>> {
        let mut response = self
            .0
            .db()
            .query("SELECT category, deck, card_index, learned_at FROM card_progress WHERE user_id = $user_id AND learned = true")
            .bind(("user_id", user_id.to_string()))
            .await?;

        #[derive(Deserialize)]
        struct Row {
            category: String,
            deck: String,
            card_index: i32,
            learned_at: Option<chrono::DateTime<chrono::Utc>>,
        }

        let rows: Vec<Row> = response.take(0)?;
        Ok(rows
            .into_iter()
            .map(|r| (r.category, r.deck, r.card_index, r.learned_at))
            .collect())
    }
}
