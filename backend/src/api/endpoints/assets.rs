use axum::{
    extract::{Path, State},
    http::{header, HeaderValue, StatusCode},
    response::IntoResponse,
};
use crate::AppState;

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
    } else {
        "audio/ogg"
    }
}

/// Sirve audio siempre desde storage (Oracle/local), sin redirect al CDN.
/// Misma ruta de archivo tras rotar voz → evita caché del navegador/CDN.
pub async fn redirect_audio(
    Path(file_path): Path<String>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    if file_path.contains("..") || file_path.starts_with('/') {
        return (StatusCode::BAD_REQUEST, "Ruta de audio inválida.").into_response();
    }

    let blob_path = format!("{}/{}", state.settings.gcs_audio_prefix, file_path);

    match state.audio_use_cases.download_blob(&blob_path).await {
        Ok(bytes) => {
            let content_type = audio_content_type(&file_path);
            (
                [
                    (header::CONTENT_TYPE, HeaderValue::from_static(content_type)),
                    (
                        header::CACHE_CONTROL,
                        HeaderValue::from_static("no-store, no-cache, must-revalidate"),
                    ),
                    (header::PRAGMA, HeaderValue::from_static("no-cache")),
                ],
                bytes,
            )
                .into_response()
        }
        Err(_) => StatusCode::NOT_FOUND.into_response(),
    }
}
