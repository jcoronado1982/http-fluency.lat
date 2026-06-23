use image::{codecs::avif::AvifEncoder, ImageEncoder};
use std::io::Cursor;

/// Comprime una imagen en bytes (PNG/JPEG) recibida desde la IA y la codifica a AVIF en memoria
/// manteniendo la resolución original de 512x512 píxeles de Flux.2.
pub fn compress_bytes_to_avif(image_bytes: &[u8], quality: u8) -> Result<Vec<u8>, String> {
    // 1. Decodificar la imagen generada por ComfyUI/Flux.2
    let img = image::load_from_memory(image_bytes)
        .map_err(|e| format!("Fallo al decodificar imagen de la IA: {}", e))?;

    // 2. Comprimir la imagen en formato AVIF manteniendo su resolución original
    let mut buf = Cursor::new(Vec::new());

    // Usamos velocidad 8 (rápida y optimizada) y la calidad dada (ej: 80)
    let encoder = AvifEncoder::new_with_speed_quality(&mut buf, 8, quality);

    // Codificamos la imagen directamente al buffer
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
        use image::{ImageBuffer, Rgb, ImageFormat};
        let img: ImageBuffer<Rgb<u8>, Vec<u8>> = ImageBuffer::from_fn(512, 512, |x, y| {
            Rgb([(x % 256) as u8, (y % 256) as u8, 128])
        });
        let mut original = Vec::new();
        img.write_to(
            &mut std::io::Cursor::new(&mut original),
            ImageFormat::Png,
        )
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
}
