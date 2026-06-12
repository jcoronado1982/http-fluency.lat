use anyhow::Result;
use crate::domain::repositories::image_compressor::ImageCompressor;
use crate::infrastructure::ai::compress::compress_bytes_to_avif;

/// Adapter that compresses raw image bytes (PNG/JPEG) to AVIF.
/// Delegates to the shared `compress` module so the encoding logic lives in one place.
pub struct AvifCompressor;

impl ImageCompressor for AvifCompressor {
    fn compress_to_avif(&self, image_bytes: &[u8], quality: u8) -> Result<Vec<u8>> {
        compress_bytes_to_avif(image_bytes, quality)
            .map_err(|e| anyhow::anyhow!(e))
    }
}
