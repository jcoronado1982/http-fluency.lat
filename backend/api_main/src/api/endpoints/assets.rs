use std::path::PathBuf;

use crate::AppState;
use axum::{
    body::Body,
    extract::{Path, State},
    http::{header, HeaderValue, StatusCode},
    response::IntoResponse,
};
use tokio_util::io::ReaderStream;

pub async fn redirect_images(
    Path(file_path): Path<String>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    if file_path.contains("..") || file_path.starts_with('/') {
        return (StatusCode::BAD_REQUEST, "Ruta de imagen inválida.").into_response();
    }

    // Normalize legacy extensions (.jpg/.png) to .avif
    let avif_path = match file_path.rfind('.') {
        Some(dot_idx) => format!("{}.avif", &file_path[..dot_idx]),
        None => format!("{}.avif", file_path),
    };

    let blob_path = format!("{}/{}", state.settings.gcs_images_prefix, avif_path);

    // 1. Servir bytes (local u Oracle vía download_blob en el servidor)
    if let Ok(bytes) = state.image_use_cases.download_blob(&blob_path).await {
        return ([(header::CONTENT_TYPE, "image/avif")], bytes).into_response();
    }

    // Sin redirect cross-origin: si no existe, 404 claro para el cliente
    StatusCode::NOT_FOUND.into_response()
}

fn audio_content_type(file_path: &str) -> &'static str {
    if file_path.ends_with(".wav") {
        "audio/wav"
    } else if file_path.ends_with(".mp3") {
        "audio/mpeg"
    } else {
        "audio/ogg"
    }
}

fn audio_cache_control(file_path: &str) -> &'static str {
    // Nombres deterministas incluyen hash → seguro cachear 1 año (Caddy hace lo mismo en prod).
    if file_path.contains('_') && file_path.len() > 24 {
        "public, max-age=31536000, immutable"
    } else {
        "public, max-age=3600"
    }
}

fn local_audio_disk_path(state: &AppState, blob_path: &str) -> PathBuf {
    PathBuf::from(&state.settings.local_storage_path).join(blob_path.trim_start_matches('/'))
}

/// Sirve audio desde disco local cuando existe (streaming, sin cargar todo en RAM).
/// Fallback: download_blob para entornos sin archivo local (mirrors / dev remoto).
pub async fn redirect_audio(
    Path(file_path): Path<String>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    if file_path.contains("..") || file_path.starts_with('/') {
        return (StatusCode::BAD_REQUEST, "Ruta de audio inválida.").into_response();
    }

    let blob_path = format!("{}/{}", state.settings.gcs_audio_prefix, file_path);
    let content_type = audio_content_type(&file_path);
    let cache_control = audio_cache_control(&file_path);
    let disk_path = local_audio_disk_path(&state, &blob_path);

    if disk_path.is_file() {
        match tokio::fs::File::open(&disk_path).await {
            Ok(file) => {
                let stream = ReaderStream::new(file);
                let body = Body::from_stream(stream);
                return (
                    [
                        (
                            header::CONTENT_TYPE,
                            HeaderValue::from_static(content_type),
                        ),
                        (
                            header::CACHE_CONTROL,
                            HeaderValue::from_static(cache_control),
                        ),
                    ],
                    body,
                )
                    .into_response();
            }
            Err(e) => {
                tracing::warn!("No se pudo abrir audio local {}: {}", disk_path.display(), e);
            }
        }
    }

    match state.audio_use_cases.download_blob(&blob_path).await {
        Ok(bytes) => (
            [
                (
                    header::CONTENT_TYPE,
                    HeaderValue::from_static(content_type),
                ),
                (
                    header::CACHE_CONTROL,
                    HeaderValue::from_static(cache_control),
                ),
            ],
            bytes,
        )
            .into_response(),
        Err(_) => StatusCode::NOT_FOUND.into_response(),
    }
}
