use crate::AppState;
use axum::{
    extract::{OriginalUri, Path, State},
    http::{header, HeaderMap, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
};

fn asset_cache_control(uri: &http::Uri) -> &'static str {
    let query = uri.query().unwrap_or_default();
    if query.contains("v=") || query.contains("t=") {
        "public, max-age=31536000, immutable"
    } else {
        "public, no-cache"
    }
}

pub async fn redirect_images(
    Path(file_path): Path<String>,
    headers: HeaderMap,
    OriginalUri(uri): OriginalUri,
    State(state): State<AppState>,
) -> impl IntoResponse {
    if file_path.contains("..") || file_path.starts_with('/') {
        return (StatusCode::BAD_REQUEST, "Ruta de imagen inválida.").into_response();
    }

    let blob_path = format!("{}/{}", state.settings.gcs_images_prefix, file_path);
    let version = state
        .storage_repo
        .blob_version(&blob_path)
        .await
        .ok()
        .flatten();
    let etag = version.as_ref().map(|value| format!("\"{value}\""));

    if let (Some(client_tag), Some(server_tag)) = (
        headers
            .get(header::IF_NONE_MATCH)
            .and_then(|value| value.to_str().ok()),
        etag.as_deref(),
    ) {
        if client_tag == server_tag {
            return StatusCode::NOT_MODIFIED.into_response();
        }
    }

    // 1. Servir bytes (local u Oracle vía StorageRepository del shell)
    if let Ok(bytes) = state.storage_repo.download_blob(&blob_path).await {
        let content_type = if file_path.ends_with(".png") {
            "image/png"
        } else if file_path.ends_with(".webp") {
            "image/webp"
        } else if file_path.ends_with(".jpg") || file_path.ends_with(".jpeg") {
            "image/jpeg"
        } else {
            "image/avif"
        };
        let mut response = Response::new(bytes.into());
        let response_headers = response.headers_mut();
        response_headers.insert(header::CONTENT_TYPE, HeaderValue::from_static(content_type));
        response_headers.insert(
            header::CACHE_CONTROL,
            HeaderValue::from_static(asset_cache_control(&uri)),
        );
        if let Some(server_tag) = etag {
            if let Ok(value) = HeaderValue::from_str(&server_tag) {
                response_headers.insert(header::ETAG, value);
            }
        }
        return response;
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

pub async fn redirect_audio(
    Path(file_path): Path<String>,
    headers: HeaderMap,
    OriginalUri(uri): OriginalUri,
    State(state): State<AppState>,
) -> impl IntoResponse {
    if file_path.contains("..") || file_path.starts_with('/') {
        return (StatusCode::BAD_REQUEST, "Ruta de audio inválida.").into_response();
    }

    // El nombre determinista hashea los INPUTS del TTS (texto/idioma/modelo), no el
    // contenido: rotar voz reescribe el mismo archivo. Misma política que imágenes:
    // ?v=/?t= → inmutable 1 año; sin versión → no-cache + revalidación ETag (304).
    let blob_path = format!("{}/{}", state.settings.gcs_audio_prefix, file_path);
    let content_type = audio_content_type(&file_path);

    let version = state
        .storage_repo
        .blob_version(&blob_path)
        .await
        .ok()
        .flatten();
    let etag = version.as_ref().map(|value| format!("\"{value}\""));

    if let (Some(client_tag), Some(server_tag)) = (
        headers
            .get(header::IF_NONE_MATCH)
            .and_then(|value| value.to_str().ok()),
        etag.as_deref(),
    ) {
        if client_tag == server_tag {
            return StatusCode::NOT_MODIFIED.into_response();
        }
    }

    match state.storage_repo.download_blob(&blob_path).await {
        Ok(bytes) => {
            let mut response = Response::new(axum::body::Body::from(bytes));
            let response_headers = response.headers_mut();
            response_headers.insert(header::CONTENT_TYPE, HeaderValue::from_static(content_type));
            response_headers.insert(
                header::CACHE_CONTROL,
                HeaderValue::from_static(asset_cache_control(&uri)),
            );
            if let Some(server_tag) = etag {
                if let Ok(value) = HeaderValue::from_str(&server_tag) {
                    response_headers.insert(header::ETAG, value);
                }
            }
            response.into_response()
        }
        Err(_) => StatusCode::NOT_FOUND.into_response(),
    }
}
