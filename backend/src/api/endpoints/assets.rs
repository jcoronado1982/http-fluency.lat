use axum::{
    extract::{Path, State},
    http::{header, StatusCode},
    response::{IntoResponse, Redirect},
    body::Body,
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

pub async fn redirect_audio(
    Path(file_path): Path<String>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    if file_path.contains("..") || file_path.starts_with('/') {
        return (StatusCode::BAD_REQUEST, "Ruta de audio inválida.").into_response();
    }

    let blob_path = format!("{}/{}", state.settings.gcs_audio_prefix, file_path);

    // Serve local file via streaming to protect RAM
    let local_file_path =
        std::path::PathBuf::from(&state.settings.local_storage_path).join(&blob_path);
    if let Ok(file) = tokio::fs::File::open(&local_file_path).await {
        let stream = tokio_util::io::ReaderStream::new(file);
        let body = Body::from_stream(stream);
        return ([(header::CONTENT_TYPE, "audio/ogg")], body).into_response();
    }

    // Redirect to the public CDN / Oracle if audio was already synced
    if state.settings.sync_to_oracle {
        let url = format!("{}/{}/{}", state.settings.public_base_url, state.settings.gcs_audio_prefix, file_path);
        return Redirect::temporary(&url).into_response();
    }

    StatusCode::NOT_FOUND.into_response()
}
