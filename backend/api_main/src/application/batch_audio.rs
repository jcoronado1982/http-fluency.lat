//! Generación masiva de audio en inglés (Gemini AI Studio → Opus local → Oracle).
//!
//! Por mazo: **un solo `ls` remoto** → lista en RAM (`HashSet`). Los que ya existen
//! se saltan sin SSH por archivo (~1.3 s cada uno antes). Solo los faltantes generan TTS.
//!
//! Guarda en la **capa global compartida** (`card_audio/{cat}/{deck}/…`), igual que si un
//! admin generara el audio desde la app. Cualquier usuario (viewer, premium, admin) lo
//! recibe al pulsar play — mismo patrón que `--batch-gen-images`.
//!
//! No altera el flujo HTTP del usuario.
//!
//! Uso local (laptop) — la clave `GEMINI_TTS_API_KEY_BACKUP` es **solo para este batch**,
//! no se inyecta en producción ni en el API HTTP.
//!
//!   SYNC_TO_ORACLE=true GEMINI_TTS_API_KEY=... GEMINI_TTS_API_KEY_BACKUP=... ORACLE_SSH_PASSWORD=... \
//!     cargo run -p api_main -- --batch-gen-audio [categoría] [deck]
//!
//! Ejemplos:
//!   --batch-gen-audio                    → todos los mazos + phonics
//!   --batch-gen-audio verbs              → categoría verbs
//!   --batch-gen-audio verbs 1-basic      → un mazo

use crate::application::batch::BatchFilter;
use crate::application::use_cases::audio_use_cases::{AudioSynthRequest, AudioUseCases};
use crate::domain::models::flashcard::Flashcard;
use crate::infrastructure::ai::gemini_tts_provider::GeminiTtsProvider;
use crate::AppState;
use std::collections::HashSet;
use std::io::{stdout, Write};
use std::path::PathBuf;
use std::sync::Arc;

const EN_LANG: &str = "en";
const PHONICS_CATEGORY: &str = "phonics";
const PHONICS_DECK: &str = "phonics";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum FormVariant {
    V1,
    V2,
    V3,
}

pub async fn run_batch_audio_generation(
    state: AppState,
    filter: BatchFilter,
) -> anyhow::Result<()> {
    run_batch_audio(state, filter).await
}

async fn run_batch_audio(state: AppState, filter: BatchFilter) -> anyhow::Result<()> {
    println!("\n========================================================");
    println!("🎧 GENERACIÓN MASIVA DE AUDIO EN INGLÉS (RUST BATCH)");
    println!("   Motor: Gemini AI Studio → Opus (CPU local) → Oracle");
    if state.settings.sync_to_oracle {
        println!("   Destino: Oracle ({})", state.settings.oracle_host);
    } else {
        println!("   ⚠️  SYNC_TO_ORACLE=false — archivos solo en disco local");
    }
    if state.settings.gemini_tts_api_key_backup.is_some() {
        println!("   Respaldo TTS local: GEMINI_TTS_API_KEY_BACKUP (solo batch, no producción)");
    }
    if let Some(ref cat) = filter.category {
        print!("   Filtro categoría: {cat}");
        if let Some(ref deck) = filter.deck {
            println!(" / deck: {deck}");
        } else {
            println!(" / todos los decks");
        }
    } else {
        println!("   Sin filtro: todos los mazos + phonics");
    }
    println!("========================================================\n");
    let _ = stdout().flush();

    let mut stats = BatchAudioStats::default();
    let failures_log = failures_log_path(&state.settings.local_storage_path);
    println!("   Log de fallos: {failures_log}");
    let _ = stdout().flush();

    let batch_tts = Arc::new(GeminiTtsProvider::new_for_batch(&state.settings)?);
    let batch_audio = state.audio_use_cases.with_audio_generator(batch_tts);

    let mut global_counter = 0usize;

    let run_phonics = filter
        .category
        .as_deref()
        .map(|c| c == PHONICS_CATEGORY)
        .unwrap_or(true)
        && filter.deck.is_none();

    if run_phonics {
        global_counter += process_phonics(&state, &batch_audio, &mut stats, &failures_log).await?;
    }

    let mut categories = state.deck_use_cases.list_categories().await?;
    if let Some(ref cat) = filter.category {
        if cat == PHONICS_CATEGORY {
            categories.clear();
        } else {
            categories.retain(|c| c == cat);
            if categories.is_empty() {
                println!("❌ Categoría no encontrada: {cat}");
                print_summary(global_counter, &stats, &failures_log);
                return Ok(());
            }
        }
    }

    if !categories.is_empty() {
        println!(
            "🔍 Categorías a procesar: {} → {:?}",
            categories.len(),
            categories
        );
        let _ = stdout().flush();
    }

    for cat_name in categories {
        println!("\n📂 CATEGORÍA: {cat_name}");
        let _ = stdout().flush();

        let mut decks = state.deck_use_cases.list_decks(&cat_name).await?;
        if let Some(ref deck) = filter.deck {
            let deck_file = if deck.ends_with(".json") {
                deck.clone()
            } else {
                format!("{deck}.json")
            };
            decks.retain(|d| d == &deck_file);
            if decks.is_empty() {
                println!("  ❌ Deck no encontrado: {deck_file}");
                continue;
            }
        }

        for deck_name in decks {
            let deck_id = deck_name.replace(".json", "");
            println!("  📦 Mazo: {deck_id}");
            let _ = stdout().flush();

            let audio_dir = format!(
                "{}/{}/{}",
                state.settings.gcs_audio_prefix, cat_name, deck_id
            );
            let mut file_index: HashSet<String> = state
                .deck_use_cases
                .list_files_in_dir(&audio_dir)
                .await?
                .into_iter()
                .collect();
            println!(
                "  🔊 Índice de audio: {} archivos en {audio_dir}",
                file_index.len()
            );
            let _ = stdout().flush();

            let deck_data = state
                .deck_use_cases
                .get_deck_json(&cat_name, &deck_name)
                .await?;
            let card_count = deck_data.flashcards().len();
            println!("  🏷️  Procesando {card_count} tarjetas (solo frases EN)...");
            let _ = stdout().flush();

            let mut seen_in_deck: HashSet<(String, String)> = HashSet::new();

            for i in 0..card_count {
                let card = &deck_data.flashcards()[i];
                let card_name = card_display_name(card);
                let verb_name = card_verb_name(card);

                let mut tasks: Vec<(String, Option<String>)> = Vec::new();

                for slot in collect_def_slots(card) {
                    if let Some(text) = extract_usage_example_en(card, slot.def_index, slot.form) {
                        tasks.push((text, verb_name.clone()));
                    }
                }

                for text in collect_conjugation_forms(card) {
                    tasks.push((text, verb_name.clone()));
                }

                for (text, verb) in tasks {
                    let verb_key = verb.clone().unwrap_or_else(|| "none".to_string());
                    if !seen_in_deck.insert((text.clone(), verb_key)) {
                        continue;
                    }

                    global_counter += 1;
                    let preview = truncate_preview(&text, 48);

                    print!(
                        "    [{global_counter}] [{}/{}] \"{card_name}\" > \"{preview}\" ",
                        i + 1,
                        card_count
                    );
                    let _ = stdout().flush();

                    let req = build_en_audio_request(&cat_name, &deck_id, text, verb);

                    process_one_item(
                        &batch_audio,
                        &mut file_index,
                        &mut stats,
                        &failures_log,
                        &req,
                        Some(card_name.as_str()),
                    )
                    .await;
                }
            }
            let _ = stdout().flush();
        }
    }

    print_summary(global_counter, &stats, &failures_log);
    Ok(())
}

enum SynthOutcome {
    Generated(String),
    Skipped(String),
}

/// Misma forma que `audioRepository.synthesize` + `useAudioPlayback` (deck sin `.json`, lang en).
fn build_en_audio_request(
    category: &str,
    deck_id: &str,
    text: String,
    verb_name: Option<String>,
) -> AudioSynthRequest {
    AudioSynthRequest {
        category: category.to_string(),
        deck: deck_id.to_string(),
        text,
        voice_name: String::new(),
        verb_name,
        tone: None,
        lang: Some(EN_LANG.to_string()),
        exclude_voice: None,
        force_regenerate: false,
    }
}

async fn process_one_item(
    batch_audio: &AudioUseCases,
    file_index: &mut HashSet<String>,
    stats: &mut BatchAudioStats,
    failures_log: &str,
    req: &AudioSynthRequest,
    card_label: Option<&str>,
) {
    match synthesize_shared_global(batch_audio, file_index, req).await {
        Ok(SynthOutcome::Generated(voice)) => {
            println!("... ✨ GENERADO (voz={voice})");
            stats.generated += 1;
        }
        Ok(SynthOutcome::Skipped(voice)) => {
            println!("... ⏭️  YA EXISTÍA (voz={voice})");
            stats.skipped += 1;
        }
        Err(e) => {
            let err_msg = e.to_string();
            println!("... ❌ NO CREADO: {err_msg}");
            stats.errors += 1;

            let failure = AudioBatchFailure {
                category: req.category.clone(),
                deck: req.deck.clone(),
                card_label: card_label.unwrap_or("-").to_string(),
                verb: req.verb_name.clone().unwrap_or_else(|| "none".to_string()),
                text: req.text.clone(),
                expected_blob: batch_audio.global_audio_blob_path(req),
                error: err_msg.clone(),
            };

            tracing::error!(
                target: "batch_audio",
                category = %failure.category,
                deck = %failure.deck,
                card = %failure.card_label,
                verb = %failure.verb,
                text = %failure.text,
                expected_blob = %failure.expected_blob,
                error = %failure.error,
                "batch-audio:not-created"
            );

            stats.failures.push(failure.clone());
            let _ = append_failure_log(failures_log, &failure);
        }
    }
}

async fn synthesize_shared_global(
    batch_audio: &AudioUseCases,
    file_index: &mut HashSet<String>,
    req: &AudioSynthRequest,
) -> anyhow::Result<SynthOutcome> {
    let basename = batch_audio.global_audio_basename(req);
    if file_index.contains(&basename) {
        return Ok(SynthOutcome::Skipped("cached".into()));
    }

    let result = batch_audio
        .get_or_synthesize_audio(req, "batch", "admin")
        .await?;

    file_index.insert(basename);
    Ok(SynthOutcome::Generated(result.voice_name))
}

async fn process_phonics(
    state: &AppState,
    batch_audio: &AudioUseCases,
    stats: &mut BatchAudioStats,
    failures_log: &str,
) -> anyhow::Result<usize> {
    println!("\n📂 PHONICS (categoría {PHONICS_CATEGORY})");
    let _ = stdout().flush();

    let data = match state.deck_use_cases.get_phonics_data().await {
        Ok(d) => d,
        Err(e) => {
            println!("  ⚠️  Sin datos phonics ({e}), omitiendo.");
            return Ok(0);
        }
    };

    let rules = data.as_array().cloned().unwrap_or_default();
    if rules.is_empty() {
        println!("  ⚠️  phonics.json vacío, omitiendo.");
        return Ok(0);
    }

    let audio_dir = format!(
        "{}/{}/{}",
        state.settings.gcs_audio_prefix, PHONICS_CATEGORY, PHONICS_DECK
    );
    let mut file_index: HashSet<String> = state
        .deck_use_cases
        .list_files_in_dir(&audio_dir)
        .await?
        .into_iter()
        .collect();
    println!(
        "  🔊 Índice de audio: {} archivos en {audio_dir}",
        file_index.len()
    );
    let _ = stdout().flush();

    let mut count = 0usize;
    let mut seen: HashSet<String> = HashSet::new();

    for (ri, rule) in rules.iter().enumerate() {
        let examples = rule
            .get("examples")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();

        for example in examples {
            let Some(text) = example.as_str().map(|s| s.trim().to_string()) else {
                continue;
            };
            if text.is_empty() || !seen.insert(text.clone()) {
                continue;
            }

            count += 1;
            let preview = truncate_preview(&text, 48);
            print!("    [{count}] [phonics rule {}] \"{preview}\" ", ri + 1);
            let _ = stdout().flush();

            // Igual que useAudioPlayback cuando currentDeckName === 'phonics': verb_name = texto
            let req = build_en_audio_request(
                PHONICS_CATEGORY,
                PHONICS_DECK,
                text.clone(),
                Some(text.clone()),
            );

            process_one_item(
                batch_audio,
                &mut file_index,
                stats,
                failures_log,
                &req,
                Some("phonics"),
            )
            .await;
        }
    }

    Ok(count)
}

fn failures_log_path(local_storage: &str) -> String {
    PathBuf::from(local_storage)
        .join("batch_audio_failures.log")
        .to_string_lossy()
        .into_owned()
}

fn append_failure_log(path: &str, failure: &AudioBatchFailure) -> std::io::Result<()> {
    use std::io::Write;
    let ts = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ");
    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)?;
    writeln!(
        file,
        "[{ts}]\tcategory={}\tdeck={}\tcard={}\tverb={}\ttext={}\texpected={}\terror={}",
        failure.category,
        failure.deck,
        failure.card_label,
        failure.verb,
        failure.text.replace('\t', " "),
        failure.expected_blob,
        failure.error.replace('\n', " ").replace('\t', " "),
    )?;
    Ok(())
}

fn print_summary(global_counter: usize, stats: &BatchAudioStats, failures_log: &str) {
    println!("\n========================================================");
    println!("✨ BATCH AUDIO EN COMPLETADO (entradas: {global_counter})");
    println!("   Generados:   {}", stats.generated);
    println!("   Ya existían: {}", stats.skipped);
    println!("   NO creados:  {}", stats.errors);

    if stats.failures.is_empty() {
        println!("   ✅ Todos los audios solicitados existen o se generaron.");
    } else {
        println!(
            "\n📋 DETALLE — AUDIOS NO CREADOS ({})",
            stats.failures.len()
        );
        println!("   (también en: {failures_log})\n");
        for (i, f) in stats.failures.iter().enumerate() {
            println!(
                "   {:>3}. {}/{} | {} | verb={} | \"{}\"",
                i + 1,
                f.category,
                f.deck,
                f.card_label,
                f.verb,
                truncate_preview(&f.text, 60),
            );
            println!("        blob esperado: {}", f.expected_blob);
            println!("        error: {}", truncate_preview(&f.error, 120));
        }
        println!("\n   💡 Reejecuta el mismo batch: solo intentará los que faltan.");
    }

    println!("========================================================\n");
}

#[derive(Clone, Debug)]
struct AudioBatchFailure {
    category: String,
    deck: String,
    card_label: String,
    verb: String,
    text: String,
    expected_blob: String,
    error: String,
}

#[derive(Default)]
struct BatchAudioStats {
    generated: usize,
    skipped: usize,
    errors: usize,
    failures: Vec<AudioBatchFailure>,
}

// ---------------------------------------------------------------------------
// Helpers (alineados con batch.rs de imágenes y el frontend)
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct DefSlot {
    form: FormVariant,
    def_index: usize,
}

fn card_display_name(card: &Flashcard) -> String {
    card.extra
        .get("name")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .unwrap_or_else(|| {
            if card.word.is_empty() {
                "?".to_string()
            } else {
                card.word.clone()
            }
        })
}

fn card_verb_name(card: &Flashcard) -> Option<String> {
    card.extra
        .get("name")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
}

fn collect_def_slots(card: &Flashcard) -> Vec<DefSlot> {
    let mut slots = Vec::new();

    let v1_count = card
        .extra
        .get("definitions")
        .and_then(|v| v.as_array())
        .map(|arr| arr.len())
        .unwrap_or(1);
    for def_index in 0..v1_count {
        slots.push(DefSlot {
            form: FormVariant::V1,
            def_index,
        });
    }

    for (form, irregular_key) in [(FormVariant::V2, "past"), (FormVariant::V3, "participle")] {
        if let Some(block) = card
            .extra
            .get("irregular")
            .and_then(|v| v.get(irregular_key))
        {
            if let Some(arr) = block.get("definitions").and_then(|v| v.as_array()) {
                if !arr.is_empty() {
                    for def_index in 0..arr.len() {
                        slots.push(DefSlot { form, def_index });
                    }
                }
            } else if block
                .get("usage_example")
                .and_then(|v| v.as_str())
                .is_some()
            {
                slots.push(DefSlot { form, def_index: 0 });
            }
        }
    }

    slots
}

fn get_definition_object<'a>(
    extra: &'a serde_json::Value,
    def_index: usize,
    form: FormVariant,
) -> Option<&'a serde_json::Value> {
    match form {
        FormVariant::V1 => extra
            .get("definitions")
            .and_then(|v| v.as_array())
            .and_then(|arr| arr.get(def_index)),
        FormVariant::V2 | FormVariant::V3 => {
            let key = if form == FormVariant::V2 {
                "past"
            } else {
                "participle"
            };
            let block = extra.get("irregular").and_then(|v| v.get(key))?;
            if let Some(arr) = block.get("definitions").and_then(|v| v.as_array()) {
                arr.get(def_index)
            } else if def_index == 0 && block.get("usage_example").is_some() {
                Some(block)
            } else {
                None
            }
        }
    }
}

fn extract_usage_example_en(
    card: &Flashcard,
    def_index: usize,
    form: FormVariant,
) -> Option<String> {
    let text = get_definition_object(&card.extra, def_index, form)
        .and_then(|d| d.get("usage_example"))
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())?;

    Some(text)
}

/// Formas v1/v2/v3 que el usuario puede reproducir desde ConjugationTable (solo EN).
fn collect_conjugation_forms(card: &Flashcard) -> Vec<String> {
    let mut forms = Vec::new();

    if let Some(name) = card.extra.get("name").and_then(|v| v.as_str()) {
        let t = name.trim();
        if !t.is_empty() {
            forms.push(t.to_string());
        }
    }

    if let Some(irregular) = card.extra.get("irregular") {
        for key in ["past", "participle"] {
            if let Some(form) = irregular
                .get(key)
                .and_then(|b| b.get("form"))
                .and_then(|v| v.as_str())
            {
                let t = form.trim();
                if !t.is_empty() {
                    forms.push(t.to_string());
                }
            }
        }
    }

    forms
}

fn truncate_preview(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        return s.to_string();
    }
    let mut out: String = s.chars().take(max).collect();
    out.push('…');
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn verb_name_none_when_card_has_no_name_like_frontend() {
        let card = Flashcard {
            word: "run".to_string(),
            translation: String::new(),
            example: None,
            learned: false,
            learned_at: None,
            extra: json!({
                "definitions": [{"usage_example": "I run every day."}]
            }),
        };
        assert!(card_verb_name(&card).is_none());
    }

    #[test]
    fn batch_deck_id_matches_frontend_without_json_suffix() {
        assert_eq!("1-basic.json".replace(".json", ""), "1-basic");
    }

    #[test]
    fn collects_en_examples_and_conjugations() {
        let card = Flashcard {
            word: String::new(),
            translation: String::new(),
            example: None,
            learned: false,
            learned_at: None,
            extra: json!({
                "name": "be",
                "definitions": [{"usage_example": "She is a student."}],
                "irregular": {
                    "past": {"form": "was / were", "definitions": [{"usage_example": "I was tired."}]},
                    "participle": {"form": "been", "definitions": [{"usage_example": "She has been here."}]}
                }
            }),
        };

        let slots = collect_def_slots(&card);
        assert_eq!(slots.len(), 3);

        let mut examples: Vec<_> = slots
            .iter()
            .filter_map(|s| extract_usage_example_en(&card, s.def_index, s.form))
            .collect();
        examples.sort();
        assert!(examples.contains(&"She is a student.".to_string()));

        let forms = collect_conjugation_forms(&card);
        assert!(forms.contains(&"be".to_string()));
        assert!(forms.contains(&"was / were".to_string()));
        assert!(forms.contains(&"been".to_string()));
    }
}
