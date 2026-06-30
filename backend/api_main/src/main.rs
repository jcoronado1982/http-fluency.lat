mod api;
mod config;
mod domain;
mod infrastructure;
mod modules;

use axum::{
    http::HeaderValue,
    routing::{get, post},
    Router,
};
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::broadcast;
use tower::ServiceBuilder;
use tower_http::compression::CompressionLayer;
use tower_http::cors::{Any, CorsLayer};
use tower_http::timeout::TimeoutLayer;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use crate::config::Settings;
#[cfg(feature = "flashcards")]
use crate::domain::repositories::audio::AudioGenerator;
use crate::domain::repositories::db_repository::{
    CardProgressRepository, PronounPracticeRepository, SubscriptionRepository,
    UserActivityRepository, UserRepository,
};
#[cfg(any(feature = "flashcards", feature = "pronoun_practice"))]
use crate::domain::repositories::image::ImageGenerator;
#[cfg(any(feature = "flashcards", feature = "pronoun_practice"))]
use crate::domain::repositories::image_compressor::ImageCompressor;
#[cfg(feature = "payments")]
use crate::domain::repositories::payment::PaymentProvider;
use crate::domain::repositories::storage::StorageRepository;
use crate::domain::repositories::tutor::AITutor;
#[cfg(any(feature = "flashcards", feature = "pronoun_practice"))]
use crate::infrastructure::ai::avif_compressor::AvifCompressor;
#[cfg(any(feature = "flashcards", feature = "pronoun_practice"))]
use crate::infrastructure::ai::comfy_provider::ComfyUIProvider;
#[cfg(feature = "flashcards")]
use crate::infrastructure::ai::elevenlabs_tts_provider::ElevenLabsTtsProvider;
use crate::infrastructure::ai::gemini_grpc_provider::GeminiGrpcProvider;
#[cfg(feature = "flashcards")]
use crate::infrastructure::ai::gemini_interactions_image_provider::GeminiInteractionsImageProvider;
#[cfg(feature = "flashcards")]
use crate::infrastructure::ai::gemini_tts_provider::GeminiTtsProvider;
#[cfg(feature = "flashcards")]
use crate::infrastructure::ai::routing_tts_provider::RoutingTtsProvider;
#[cfg(feature = "payments")]
use crate::infrastructure::payment::null_payment_provider::NullPaymentProvider;
#[cfg(feature = "payments")]
use crate::infrastructure::payment::stripe_provider::StripeProvider;
use crate::infrastructure::storage::local_repository::LocalStorageRepository;
use crate::infrastructure::storage::null_db_repository::NullDbRepository;
use crate::infrastructure::storage::surreal::{
    SurrealCardProgressRepository, SurrealConnection, SurrealPronounRepository,
    SurrealSubscriptionRepository, SurrealUserActivityRepository, SurrealUserRepository,
};
#[cfg(feature = "flashcards")]
use mod_flashcards::audio_use_cases::AudioUseCases;
#[cfg(feature = "flashcards")]
use mod_flashcards::batch::{
    parse_batch_filter, run_batch_audio_generation, run_batch_image_generation,
    run_batch_image_linking, AudioBatchContext, BatchSettings, ImageBatchContext,
};
#[cfg(feature = "flashcards")]
use mod_flashcards::image_use_cases::ImageUseCases;
#[cfg(feature = "flashcards")]
use mod_flashcards::{DeckUseCases, FlashcardsConfig};
#[cfg(feature = "auth")]
use mod_shell::auth::AuthUseCases;
#[cfg(feature = "auth")]
use mod_shell::presence_use_cases::PresenceUseCases;
#[cfg(feature = "subscriptions")]
use mod_shell::subscription_use_cases::SubscriptionUseCases;
use mod_shell::tutor_use_cases::TutorUseCases;
#[cfg(feature = "pronoun_practice")]
use pronoun_practice::StoryUseCases;

/// Application state exposed to HTTP handlers.
/// Only contains use-case facades and shared infrastructure primitives
/// (settings, notification channel, storage for media GET). Raw infrastructure
/// ports are otherwise NOT exposed; business logic goes through use-cases.
#[derive(Clone)]
pub struct AppState {
    pub settings: Arc<Settings>,
    pub storage_repo: Arc<dyn StorageRepository>,
    #[cfg(feature = "flashcards")]
    pub deck_use_cases: Arc<DeckUseCases>,
    pub tutor_use_cases: Arc<TutorUseCases>,
    #[cfg(feature = "flashcards")]
    pub audio_use_cases: Arc<AudioUseCases>,
    #[cfg(feature = "flashcards")]
    pub image_use_cases: Arc<ImageUseCases>,
    #[cfg(feature = "pronoun_practice")]
    pub pronoun_practice_use_cases: Arc<StoryUseCases>,
    #[cfg(feature = "auth")]
    pub auth_use_cases: Arc<AuthUseCases>,
    #[cfg(feature = "auth")]
    pub presence_use_cases: Arc<PresenceUseCases>,
    #[cfg(feature = "subscriptions")]
    pub subscription_use_cases: Arc<SubscriptionUseCases>,
    pub notification_sender: broadcast::Sender<String>,
}

#[cfg(feature = "flashcards")]
fn flashcards_batch_settings(settings: &Settings) -> BatchSettings {
    BatchSettings {
        gcs_images_prefix: settings.gcs_images_prefix.clone(),
        gcs_audio_prefix: settings.gcs_audio_prefix.clone(),
        sync_to_oracle: settings.sync_to_oracle,
        oracle_host: settings.oracle_host.clone(),
        local_storage_path: settings.local_storage_path.clone(),
        gemini_tts_api_key_backup: settings.gemini_tts_api_key_backup.clone(),
    }
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
        .thread_stack_size(512 * 1024) // 512 KB por thread en vez de 2 MB
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
        if let Ok(json_bytes) =
            base64::Engine::decode(&base64::engine::general_purpose::STANDARD, json_b64.trim())
        {
            let path = "/tmp/gcp-credentials.json";
            if let Ok(mut f) = std::fs::File::create(path) {
                let _ = f.write_all(&json_bytes);
                std::env::set_var("GOOGLE_APPLICATION_CREDENTIALS", path);
                tracing::info!(
                    "🔑 GOOGLE_APPLICATION_CREDENTIALS seteado desde GOOGLE_CREDENTIALS_JSON"
                );
            }
        }
    }

    // Fallback local: si no hay env configurada pero existe el archivo fuera de Git,
    // apuntar GOOGLE_APPLICATION_CREDENTIALS al JSON local para no romper el flujo dev.
    if std::env::var_os("GOOGLE_APPLICATION_CREDENTIALS").is_none() {
        let local_credentials_path =
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../credentials.json");
        if local_credentials_path.is_file() {
            std::env::set_var("GOOGLE_APPLICATION_CREDENTIALS", &local_credentials_path);
            tracing::info!(
                "🔑 GOOGLE_APPLICATION_CREDENTIALS seteado desde archivo local ignorado por Git"
            );
        }
    }

    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::new(
            std::env::var("RUST_LOG").unwrap_or_else(|_| "info".into()),
        ))
        .with(tracing_subscriber::fmt::layer())
        .init();

    let settings = Arc::new(Settings::from_env()?);

    tracing::info!(
        "📁 Utilizando almacenamiento LOCAL en: {}",
        settings.local_storage_path
    );
    let storage_repo: Arc<dyn StorageRepository> =
        Arc::new(LocalStorageRepository::new(&settings).await?);

    let surreal_url = std::env::var("SURREAL_URL").unwrap_or_else(|_| "127.0.0.1:8001".to_string());
    #[allow(unused_variables)]
    let (user_repo, sub_repo, card_repo, story_repo, activity_repo): (
        Arc<dyn UserRepository>,
        Arc<dyn SubscriptionRepository>,
        Arc<dyn CardProgressRepository>,
        Arc<dyn PronounPracticeRepository>,
        Arc<dyn UserActivityRepository>,
    ) = match SurrealConnection::new(&surreal_url, "flashcard", "flashcard").await {
        Ok(conn) => {
            tracing::info!("✅ Conectado a SurrealDB en {}", surreal_url);
            let conn = Arc::new(conn);
            (
                Arc::new(SurrealUserRepository(conn.clone())) as Arc<dyn UserRepository>,
                Arc::new(SurrealSubscriptionRepository(conn.clone()))
                    as Arc<dyn SubscriptionRepository>,
                Arc::new(SurrealCardProgressRepository(conn.clone()))
                    as Arc<dyn CardProgressRepository>,
                Arc::new(SurrealPronounRepository(conn.clone()))
                    as Arc<dyn PronounPracticeRepository>,
                Arc::new(SurrealUserActivityRepository(conn.clone()))
                    as Arc<dyn UserActivityRepository>,
            )
        }
        Err(e) => {
            tracing::warn!(
                "⚠️ SurrealDB no disponible en {} ({}). Módulos dependientes de DB degradados.",
                surreal_url,
                e
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
    #[cfg(feature = "flashcards")]
    let audio_gen: Arc<dyn AudioGenerator> = Arc::new(RoutingTtsProvider::new(&settings).await?);
    #[cfg(feature = "flashcards")]
    let landing_demo_audio_gen: Option<Arc<dyn AudioGenerator>> =
        ElevenLabsTtsProvider::from_settings(&settings)
            .map(|provider| Arc::new(provider) as Arc<dyn AudioGenerator>);
    #[cfg(feature = "flashcards")]
    if landing_demo_audio_gen.is_some() {
        tracing::info!("🎙️ Landing demo TTS: ElevenLabs activo");
    } else {
        tracing::warn!("⚠️ ELEVENLABS_API_KEY no configurada — demo usará Google TTS");
    }
    #[cfg(any(feature = "flashcards", feature = "pronoun_practice"))]
    let image_gen: Arc<dyn ImageGenerator> = Arc::new(ComfyUIProvider::new(&settings));
    #[cfg(feature = "flashcards")]
    let landing_demo_image_gen: Arc<dyn ImageGenerator> =
        Arc::new(GeminiInteractionsImageProvider::new(&settings));
    #[cfg(any(feature = "flashcards", feature = "pronoun_practice"))]
    let image_compressor: Arc<dyn ImageCompressor> = Arc::new(AvifCompressor);

    // 1000 slots: soporte para ráfagas de imágenes generadas en batch sin perder eventos SSE.
    let (notification_sender, _) = broadcast::channel(1000);

    // --- Compose use cases (application layer) ---
    #[cfg(feature = "flashcards")]
    let deck_use_cases = Arc::new(DeckUseCases::new(
        storage_repo.clone(),
        card_repo.clone(),
        activity_repo.clone(),
    ));
    #[cfg(feature = "flashcards")]
    let flashcards_config = Arc::new(FlashcardsConfig {
        gcs_audio_prefix: settings.gcs_audio_prefix.clone(),
        gcs_images_prefix: settings.gcs_images_prefix.clone(),
        gemini_api_enabled: settings.image_ai_enabled,
    });
    #[cfg(feature = "pronoun_practice")]
    let tutor_db_repo = Some(story_repo.clone());
    #[cfg(not(feature = "pronoun_practice"))]
    let tutor_db_repo = None;
    let tutor_use_cases = Arc::new(TutorUseCases::new(ai_tutor.clone(), tutor_db_repo));
    #[cfg(feature = "flashcards")]
    let audio_use_cases = Arc::new(AudioUseCases::new(
        storage_repo.clone(),
        audio_gen.clone(),
        landing_demo_audio_gen,
        ai_tutor.clone(),
        flashcards_config.clone(),
    ));
    #[cfg(feature = "flashcards")]
    let image_use_cases = Arc::new(ImageUseCases::new(
        storage_repo.clone(),
        image_gen.clone(),
        landing_demo_image_gen.clone(),
        image_compressor.clone(),
        ai_tutor.clone(),
        flashcards_config.clone(),
    ));
    #[cfg(feature = "pronoun_practice")]
    let pronoun_practice_use_cases = Arc::new(StoryUseCases::new(
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
        storage_repo: storage_repo.clone(),
        #[cfg(feature = "flashcards")]
        deck_use_cases,
        tutor_use_cases,
        #[cfg(feature = "flashcards")]
        audio_use_cases,
        #[cfg(feature = "flashcards")]
        image_use_cases,
        #[cfg(feature = "pronoun_practice")]
        pronoun_practice_use_cases,
        #[cfg(feature = "auth")]
        auth_use_cases,
        #[cfg(feature = "auth")]
        presence_use_cases,
        #[cfg(feature = "subscriptions")]
        subscription_use_cases,
        notification_sender,
    };

    let cors = cors_layer();

    // --- BATCH MODE ---
    // Uso:
    //   --batch-link-images [categoría] [deck]
    //   --batch-gen-images  [categoría] [deck]
    //   --batch-gen-audio   [categoría] [deck]   ← audio EN → Oracle (SYNC_TO_ORACLE=true)
    // Ejemplo rápido: --batch-link-images adjectives 1-basic
    #[cfg(feature = "flashcards")]
    {
        let args: Vec<String> = std::env::args().collect();
        if args.iter().any(|arg| arg == "--batch-link-images") {
            let filter = parse_batch_filter(&args, "--batch-link-images");
            let ctx = ImageBatchContext {
                deck: state.deck_use_cases.clone(),
                image: state.image_use_cases.clone(),
                settings: flashcards_batch_settings(&state.settings),
            };
            return run_batch_image_linking(ctx, filter).await;
        }
        if args.iter().any(|arg| arg == "--batch-gen-images") {
            let filter = parse_batch_filter(&args, "--batch-gen-images");
            let ctx = ImageBatchContext {
                deck: state.deck_use_cases.clone(),
                image: state.image_use_cases.clone(),
                settings: flashcards_batch_settings(&state.settings),
            };
            return run_batch_image_generation(ctx, filter).await;
        }
        if args.iter().any(|arg| arg == "--batch-gen-audio") {
            let filter = parse_batch_filter(&args, "--batch-gen-audio");
            let batch_tts = Arc::new(GeminiTtsProvider::new_for_batch(&state.settings)?);
            let batch_audio = state.audio_use_cases.with_audio_generator(batch_tts);
            let ctx = AudioBatchContext {
                deck: state.deck_use_cases.clone(),
                audio: batch_audio,
                settings: flashcards_batch_settings(&state.settings),
            };
            return run_batch_audio_generation(ctx, filter).await;
        }
    }
    // ------------------

    #[allow(unused_mut)]
    let mut app = Router::new()
        .route("/api/health", get(api::endpoints::health::health_check))
        .route("/api/features", get(api::endpoints::features::get_features))
        // Tutor (shell — usado por módulos conversacionales)
        .route(
            "/api/analyze-error",
            post(api::endpoints::tutor::analyze_error),
        )
        .route(
            "/api/explain-like-child",
            post(api::endpoints::tutor::explain_like_child),
        )
        .route(
            "/api/onboarding-guide",
            post(api::endpoints::tutor::guide_onboarding),
        )
        // Notifications (SSE — excluido del timeout global)
        .route(
            "/api/notifications/events",
            get(api::endpoints::notifications::stream_notifications),
        )
        .route(
            "/api/demo-feedback",
            get(api::endpoints::feedback::list_demo_feedback),
        );

    #[cfg(feature = "auth")]
    {
        app = app
            .route("/api/auth/google", post(api::endpoints::auth::google_login))
            .route(
                "/api/auth/dev-guest",
                post(api::endpoints::auth::dev_guest_login),
            )
            .route("/api/auth/me", get(api::endpoints::auth::get_me))
            .route(
                "/api/auth/onboarding",
                post(api::endpoints::auth::update_onboarding),
            )
            .route(
                "/api/presence/heartbeat",
                post(api::endpoints::presence::heartbeat),
            )
            .route("/api/presence/leave", post(api::endpoints::presence::leave))
            .route(
                "/api/admin/users/activity",
                get(api::endpoints::admin_users::list_users_activity),
            )
            .route(
                "/api/demo-feedback",
                post(api::endpoints::feedback::submit_demo_feedback),
            );
    }

    app = modules::register_routes(app);

    #[cfg(feature = "subscriptions")]
    {
        app = app
            .route(
                "/api/subscriptions/me",
                get(api::endpoints::admin::get_my_subscription),
            )
            .route(
                "/api/admin/subscriptions",
                get(api::endpoints::admin::list_subscriptions),
            )
            .route(
                "/api/admin/subscriptions/activate",
                post(api::endpoints::admin::activate_subscription),
            )
            .route(
                "/api/admin/subscriptions/cancel",
                post(api::endpoints::admin::cancel_subscription),
            );
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

    let port = std::env::var("PORT")
        .unwrap_or_else(|_| "8080".into())
        .parse::<u16>()?;
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    tracing::info!("🚀 Rust backend listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}

fn cors_layer() -> CorsLayer {
    let configured = std::env::var("CORS_ALLOWED_ORIGINS")
        .or_else(|_| std::env::var("APP_ALLOWED_ORIGINS"))
        .unwrap_or_default();
    if configured.trim() == "*" {
        return CorsLayer::new()
            .allow_origin(Any)
            .allow_methods(Any)
            .allow_headers(Any);
    }
    let origins: Vec<HeaderValue> = configured
        .split(',')
        .map(str::trim)
        .filter(|origin| !origin.is_empty())
        .filter_map(|origin| match origin.parse::<HeaderValue>() {
            Ok(value) => Some(value),
            Err(_) => {
                tracing::warn!("Origen CORS ignorado por inválido: {}", origin);
                None
            }
        })
        .collect();

    if origins.is_empty() {
        tracing::warn!(
            "CORS abierto: define CORS_ALLOWED_ORIGINS para restringirlo por entorno sin cambiar código"
        );
        return CorsLayer::new()
            .allow_origin(Any)
            .allow_methods(Any)
            .allow_headers(Any);
    }

    CorsLayer::new()
        .allow_origin(origins)
        .allow_methods(Any)
        .allow_headers(Any)
}
