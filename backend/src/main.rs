mod config;
mod domain;
mod application;
mod infrastructure;
mod api;

use axum::{
    routing::{get, post, delete},
    Router,
};
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;
use tower::ServiceBuilder;
use tower_http::cors::{Any, CorsLayer};
use tower_http::timeout::TimeoutLayer;
use tower_http::compression::CompressionLayer;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};
use tokio::sync::broadcast;

use crate::config::Settings;
use crate::infrastructure::storage::local_repository::LocalStorageRepository;
use crate::infrastructure::storage::surreal_repository::SurrealRepository;
use crate::infrastructure::storage::null_db_repository::NullDbRepository;
use crate::infrastructure::ai::gemini_grpc_provider::GeminiGrpcProvider;
use crate::infrastructure::ai::routing_tts_provider::RoutingTtsProvider;
use crate::infrastructure::ai::comfy_provider::ComfyUIProvider;
use crate::domain::repositories::storage::StorageRepository;
use crate::domain::repositories::db_repository::{
    UserRepository, SubscriptionRepository, CardProgressRepository, StoryArcadeRepository,
    UserActivityRepository,
};
use crate::domain::repositories::tutor::AITutor;
use crate::domain::repositories::audio::AudioGenerator;
use crate::domain::repositories::image::ImageGenerator;
use crate::domain::repositories::image_compressor::ImageCompressor;
use crate::infrastructure::ai::avif_compressor::AvifCompressor;
use crate::application::use_cases::deck_use_cases::DeckUseCases;
use crate::application::use_cases::tutor_use_cases::TutorUseCases;
use crate::application::use_cases::audio_use_cases::AudioUseCases;
use crate::application::use_cases::image_use_cases::ImageUseCases;
#[cfg(feature = "story_arcade")]
use crate::application::use_cases::story_use_cases::StoryUseCases;
#[cfg(feature = "auth")]
use crate::application::use_cases::auth::AuthUseCases;
#[cfg(feature = "auth")]
use crate::application::use_cases::presence_use_cases::PresenceUseCases;
#[cfg(feature = "subscriptions")]
use crate::application::use_cases::subscription_use_cases::SubscriptionUseCases;
#[cfg(feature = "payments")]
use crate::domain::repositories::payment::PaymentProvider;
#[cfg(feature = "payments")]
use crate::infrastructure::payment::null_payment_provider::NullPaymentProvider;
#[cfg(feature = "payments")]
use crate::infrastructure::payment::stripe_provider::StripeProvider;

/// Application state exposed to HTTP handlers.
/// Only contains use-case facades and shared infrastructure primitives
/// (settings, notification channel). Raw infrastructure ports are NOT
/// exposed here; all business logic must go through a use-case.
#[derive(Clone)]
pub struct AppState {
    pub settings: Arc<Settings>,
    pub deck_use_cases: Arc<DeckUseCases>,
    pub tutor_use_cases: Arc<TutorUseCases>,
    pub audio_use_cases: Arc<AudioUseCases>,
    pub image_use_cases: Arc<ImageUseCases>,
    #[cfg(feature = "story_arcade")]
    pub story_use_cases: Arc<StoryUseCases>,
    #[cfg(feature = "auth")]
    pub auth_use_cases: Arc<AuthUseCases>,
    #[cfg(feature = "auth")]
    pub presence_use_cases: Arc<PresenceUseCases>,
    #[cfg(feature = "subscriptions")]
    pub subscription_use_cases: Arc<SubscriptionUseCases>,
    pub notification_sender: broadcast::Sender<String>,
}


/// Runtime configurado a mano para 1 GB de RAM:
///   - worker_threads: leído de TOKIO_WORKER_THREADS (default = min(cpus, 4))
///     Un t3.micro tiene 2 vCPUs → 2 workers es óptimo.
///   - thread_stack_size: 512 KB (Tokio default 2 MB) → ahorra RAM en picos de carga.
///     Las corutinas async son stackless; solo tareas spawn_blocking necesitan stack.
fn main() -> anyhow::Result<()> {
    let workers = std::env::var("TOKIO_WORKER_THREADS")
        .ok()
        .and_then(|s| s.parse::<usize>().ok())
        .unwrap_or_else(|| std::cmp::min(num_cpus::get(), 4));

    tokio::runtime::Builder::new_multi_thread()
        .worker_threads(workers)
        .thread_stack_size(512 * 1024)   // 512 KB por thread en vez de 2 MB
        .enable_all()
        .build()?
        .block_on(async_main())
}

async fn async_main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();

    // Si GOOGLE_CREDENTIALS_JSON está seteado (Cloud Run sin archivo montado),
    // escribir el JSON a /tmp y apuntar GOOGLE_APPLICATION_CREDENTIALS ahí.
    if let Ok(json_b64) = std::env::var("GOOGLE_CREDENTIALS_JSON") {
        use std::io::Write;
        if let Ok(json_bytes) = base64::Engine::decode(
            &base64::engine::general_purpose::STANDARD,
            json_b64.trim(),
        ) {
            let path = "/tmp/gcp-credentials.json";
            if let Ok(mut f) = std::fs::File::create(path) {
                let _ = f.write_all(&json_bytes);
                std::env::set_var("GOOGLE_APPLICATION_CREDENTIALS", path);
                tracing::info!("🔑 GOOGLE_APPLICATION_CREDENTIALS seteado desde GOOGLE_CREDENTIALS_JSON");
            }
        }
    }

    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::new(
            std::env::var("RUST_LOG").unwrap_or_else(|_| "info".into()),
        ))
        .with(tracing_subscriber::fmt::layer())
        .init();

    let settings = Arc::new(Settings::from_env()?);

    tracing::info!("📁 Utilizando almacenamiento LOCAL en: {}", settings.local_storage_path);
    let storage_repo: Arc<dyn StorageRepository> =
        Arc::new(LocalStorageRepository::new(&settings).await?);

    let surreal_url = std::env::var("SURREAL_URL").unwrap_or_else(|_| "127.0.0.1:8001".to_string());
    let (user_repo, sub_repo, card_repo, story_repo, activity_repo): (
        Arc<dyn UserRepository>,
        Arc<dyn SubscriptionRepository>,
        Arc<dyn CardProgressRepository>,
        Arc<dyn StoryArcadeRepository>,
        Arc<dyn UserActivityRepository>,
    ) = match SurrealRepository::new(&surreal_url, "flashcard", "flashcard").await {
        Ok(repo) => {
            tracing::info!("✅ Conectado a SurrealDB en {}", surreal_url);
            let repo = Arc::new(repo);
            (
                repo.clone(),
                repo.clone(),
                repo.clone(),
                repo.clone(),
                repo.clone(),
            )
        }
        Err(e) => {
            tracing::warn!(
                "⚠️ SurrealDB no disponible en {} ({}). Story Arcade y auth desactivados.",
                surreal_url, e
            );
            let repo = Arc::new(NullDbRepository);
            (
                repo.clone(),
                repo.clone(),
                repo.clone(),
                repo.clone(),
                repo.clone(),
            )
        }
    };

    let ai_tutor: Arc<dyn AITutor> = Arc::new(GeminiGrpcProvider::new(&settings)?);
    let audio_gen: Arc<dyn AudioGenerator> = Arc::new(RoutingTtsProvider::new(&settings).await?);
    let image_gen: Arc<dyn ImageGenerator> = Arc::new(ComfyUIProvider::new(&settings));
    let image_compressor: Arc<dyn ImageCompressor> = Arc::new(AvifCompressor);

    // 1000 slots: soporte para ráfagas de imágenes generadas en batch sin perder eventos SSE.
    let (notification_sender, _) = broadcast::channel(1000);

    // --- Compose use cases (application layer) ---
    let deck_use_cases = Arc::new(DeckUseCases::new(storage_repo.clone(), card_repo.clone()));
    let tutor_use_cases = Arc::new(TutorUseCases::new(ai_tutor.clone(), story_repo.clone()));
    let audio_use_cases = Arc::new(AudioUseCases::new(
        storage_repo.clone(),
        audio_gen.clone(),
        ai_tutor.clone(),
        settings.clone(),
    ));
    let image_use_cases = Arc::new(ImageUseCases::new(
        storage_repo.clone(),
        image_gen.clone(),
        image_compressor.clone(),
        ai_tutor.clone(),
        settings.clone(),
    ));
    #[cfg(feature = "story_arcade")]
    let story_use_cases = Arc::new(StoryUseCases::new(
        story_repo.clone(),
        Some(image_gen.clone()),
        Some(image_compressor.clone()),
        Some(ai_tutor.clone()),
        Some(storage_repo.clone()),
        Some(notification_sender.clone()),
        settings.gcs_images_prefix.clone(),
        settings.public_base_url.clone(),
    ));

    #[cfg(feature = "auth")]
    let auth_use_cases = Arc::new(AuthUseCases::new(user_repo.clone(), sub_repo.clone()));

    #[cfg(feature = "auth")]
    let presence_use_cases = Arc::new(PresenceUseCases::new(
        user_repo.clone(),
        activity_repo.clone(),
    ));

    #[cfg(feature = "payments")]
    let payment: Arc<dyn PaymentProvider> = match std::env::var("STRIPE_SECRET_KEY") {
        Ok(key) if !key.is_empty() => {
            tracing::info!("💳 Proveedor de pago: Stripe");
            Arc::new(StripeProvider::new(key))
        }
        _ => {
            tracing::info!("💳 Proveedor de pago: ninguno (activación manual por admin)");
            Arc::new(NullPaymentProvider)
        }
    };

    #[cfg(feature = "subscriptions")]
    let subscription_use_cases = Arc::new(SubscriptionUseCases::new(sub_repo.clone(), payment));

    let state = AppState {
        settings,
        deck_use_cases,
        tutor_use_cases,
        audio_use_cases,
        image_use_cases,
        #[cfg(feature = "story_arcade")]
        story_use_cases,
        #[cfg(feature = "auth")]
        auth_use_cases,
        #[cfg(feature = "auth")]
        presence_use_cases,
        #[cfg(feature = "subscriptions")]
        subscription_use_cases,
        notification_sender,
    };


    let cors = CorsLayer::new().allow_origin(Any).allow_methods(Any).allow_headers(Any);

    // --- BATCH MODE ---
    // Uso:
    //   --batch-link-images [categoría] [deck]
    //   --batch-gen-images  [categoría] [deck]
    //   --batch-gen-audio   [categoría] [deck]   ← audio EN → Oracle (SYNC_TO_ORACLE=true)
    // Ejemplo rápido: --batch-link-images adjectives 1-basic
    let args: Vec<String> = std::env::args().collect();
    if args.iter().any(|arg| arg == "--batch-link-images") {
        let filter = crate::application::batch::parse_batch_filter(&args, "--batch-link-images");
        return crate::application::batch::run_batch_image_linking(state, filter).await;
    }
    if args.iter().any(|arg| arg == "--batch-gen-images") {
        let filter = crate::application::batch::parse_batch_filter(&args, "--batch-gen-images");
        return crate::application::batch::run_batch_image_generation(state, filter).await;
    }
    if args.iter().any(|arg| arg == "--batch-gen-audio") {
        let filter = crate::application::batch::parse_batch_filter(&args, "--batch-gen-audio");
        return crate::application::batch_audio::run_batch_audio_generation(state, filter).await;
    }
    // ------------------

    #[allow(unused_mut)]
    let mut app = Router::new()

        .route("/card_images/*file_path", get(api::endpoints::assets::redirect_images))
        .route("/card_audio/*file_path", get(api::endpoints::assets::redirect_audio))
        .route("/api/health", get(api::endpoints::health::health_check))
        .route("/api/categories", get(api::endpoints::decks::get_categories))
        .route("/api/available-flashcards-files", get(api::endpoints::decks::get_available_decks))
        .route("/api/flashcards-data", get(api::endpoints::decks::get_deck_data))
        .route("/api/update-status", post(api::endpoints::decks::update_card_status))
        .route("/api/reset-all", post(api::endpoints::decks::reset_all_statuses))
        .route("/api/phonics-data", get(api::endpoints::decks::get_phonics_data))
        .route("/api/features", get(api::endpoints::features::get_features))
        // Tutor
        .route("/api/analyze-error", post(api::endpoints::tutor::analyze_error))
        .route("/api/explain-like-child", post(api::endpoints::tutor::explain_like_child))
        // Media generation
        .route("/api/synthesize-speech", post(api::endpoints::generation::synthesize_speech))
        .route("/api/resolve-image", post(api::endpoints::generation::resolve_image))
        .route("/api/generate-image", post(api::endpoints::generation::generate_image))
        .route("/api/upload-image", post(api::endpoints::generation::upload_image))
        .route("/api/delete-image", delete(api::endpoints::generation::delete_image))
        .route("/api/delete-audio", post(api::endpoints::generation::delete_audio))
        // Notifications (SSE — excluido del timeout global)
        .route("/api/notifications/events", get(api::endpoints::notifications::stream_notifications));

    #[cfg(feature = "auth")]
    {
        app = app
            .route("/api/auth/google", post(api::endpoints::auth::google_login))
            .route("/api/auth/dev-guest", post(api::endpoints::auth::dev_guest_login))
            .route("/api/auth/me", get(api::endpoints::auth::get_me))
            .route("/api/presence/heartbeat", post(api::endpoints::presence::heartbeat))
            .route("/api/presence/leave", post(api::endpoints::presence::leave))
            .route(
                "/api/admin/users/activity",
                get(api::endpoints::admin_users::list_users_activity),
            );
    }

    #[cfg(feature = "story_arcade")]
    {
        app = app.route("/api/progress", get(api::endpoints::story_arcade::get_progress))
            .route("/api/progress/update", post(api::endpoints::story_arcade::update_progress))
            .route("/api/progress/reset", delete(api::endpoints::story_arcade::reset_progress))
            .route("/api/episodes/:episode_id/screens", get(api::endpoints::story_arcade::get_episode_screens))
            .route("/api/episodes/:episode_id/next", get(api::endpoints::story_arcade::get_next_episode))
            .route("/api/stories/:story_id/full-history", get(api::endpoints::story_arcade::get_story_full_history));
    }

    #[cfg(feature = "subscriptions")]
    {
        app = app.route("/api/subscriptions/me", get(api::endpoints::admin::get_my_subscription))
            .route("/api/admin/subscriptions", get(api::endpoints::admin::list_subscriptions))
            .route("/api/admin/subscriptions/activate", post(api::endpoints::admin::activate_subscription))
            .route("/api/admin/subscriptions/cancel", post(api::endpoints::admin::cancel_subscription));
    }

    let app = app
        .layer(
            ServiceBuilder::new()
                // Compresión gzip/brotli automática para respuestas JSON (típicamente -70 % tamaño).
                .layer(CompressionLayer::new())
                // Timeout global: las peticiones lentas no acumulan threads.
                // SSE usa su propia ruta sin este layer (está antes en el stack).
                .layer(TimeoutLayer::new(Duration::from_secs(120)))
                .layer(cors),
        )
        .with_state(state);

    let port = std::env::var("PORT").unwrap_or_else(|_| "8080".into()).parse::<u16>()?;
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    tracing::info!("🚀 Rust backend (Full Arcade) listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}
