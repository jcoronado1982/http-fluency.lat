use image::{codecs::avif::AvifEncoder, imageops::FilterType, ImageEncoder};
use std::io::Cursor;

/// Tamaño canónico de tarjetas (Flux 512×512); el demo Gemini se reescala aquí antes del AVIF.
pub const CARD_IMAGE_SIZE: u32 = 512;

/// Decodifica, normaliza a 512×512 si hace falta, y codifica AVIF (misma pipeline que Flux).
pub fn compress_bytes_to_avif(image_bytes: &[u8], quality: u8) -> Result<Vec<u8>, String> {
    let img = image::load_from_memory(image_bytes)
        .map_err(|e| format!("Fallo al decodificar imagen de la IA: {}", e))?;

    let img = if img.width() == CARD_IMAGE_SIZE && img.height() == CARD_IMAGE_SIZE {
        img
    } else {
        img.resize_exact(CARD_IMAGE_SIZE, CARD_IMAGE_SIZE, FilterType::Lanczos3)
    };

    let mut buf = Cursor::new(Vec::new());
    let encoder = AvifEncoder::new_with_speed_quality(&mut buf, 8, quality);

    let width = img.width();
    let height = img.height();
    let color = img.color();

    encoder
        .write_image(img.as_bytes(), width, height, color.into())
        .map_err(|e| format!("Error en la codificación AVIF: {}", e))?;

    Ok(buf.into_inner())
}

#[cfg(test)]
mod tests {
    use super::compress_bytes_to_avif;

    #[test]
    fn compress_logo_png_to_avif_works() {
        use image::{ImageBuffer, ImageFormat, Rgb};
        let img: ImageBuffer<Rgb<u8>, Vec<u8>> = ImageBuffer::from_fn(512, 512, |x, y| {
            Rgb([(x % 256) as u8, (y % 256) as u8, 128])
        });
        let mut original = Vec::new();
        img.write_to(&mut std::io::Cursor::new(&mut original), ImageFormat::Png)
            .expect("PNG sintético de prueba");

        let avif_bytes = compress_bytes_to_avif(&original, 80)
            .expect("la compresión AVIF debe funcionar con PNG de prueba");

        assert!(
            !avif_bytes.is_empty(),
            "el AVIF generado no debe estar vacío"
        );
        assert!(
            avif_bytes.len() < original.len(),
            "el AVIF debe ser más pequeño que la imagen PNG sintética"
        );

        let has_avif_brand = avif_bytes
            .windows(8)
            .any(|w| w == b"ftypavif" || w == b"ftypavis");
        assert!(
            has_avif_brand,
            "el AVIF generado debe llevar la marca de contenedor AVIF"
        );
    }

    #[test]
    fn downscales_non_512_to_card_size_before_avif() {
        use image::{ImageBuffer, ImageFormat, Rgb};
        let img: ImageBuffer<Rgb<u8>, Vec<u8>> = ImageBuffer::from_fn(1024, 1024, |x, y| {
            Rgb([(x % 256) as u8, (y % 256) as u8, 64])
        });
        let mut original = Vec::new();
        img.write_to(&mut std::io::Cursor::new(&mut original), ImageFormat::Png)
            .expect("PNG sintético");

        let avif_bytes = compress_bytes_to_avif(&original, 80).expect("AVIF tras resize");

        assert!(!avif_bytes.is_empty());
    }
}
