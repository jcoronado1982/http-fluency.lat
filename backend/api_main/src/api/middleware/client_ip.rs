use axum::http::HeaderMap;

/// Extrae la IP del cliente detrás de proxy (Caddy/Cloudflare).
pub fn extract_client_ip(headers: &HeaderMap) -> Option<String> {
    for key in ["cf-connecting-ip", "x-real-ip", "x-forwarded-for"] {
        if let Some(value) = headers.get(key).and_then(|h| h.to_str().ok()) {
            let ip = value.split(',').next()?.trim();
            if !ip.is_empty() {
                return Some(ip.to_string());
            }
        }
    }
    None
}

/// País desde cabeceras del proxy (sin llamada externa).
pub fn country_from_headers(headers: &HeaderMap) -> Option<String> {
    for key in ["cf-ipcountry", "x-country-code", "x-country"] {
        if let Some(value) = headers.get(key).and_then(|h| h.to_str().ok()) {
            let country = value.trim();
            if !country.is_empty() && !country.eq_ignore_ascii_case("xx") {
                return Some(country.to_string());
            }
        }
    }
    None
}

pub fn is_private_ip(ip: &str) -> bool {
    matches!(ip, "127.0.0.1" | "::1" | "localhost")
        || ip.starts_with("10.")
        || ip.starts_with("192.168.")
        || ip.starts_with("172.16.")
        || ip.starts_with("172.17.")
        || ip.starts_with("172.18.")
        || ip.starts_with("172.19.")
        || ip.starts_with("172.2")
        || ip.starts_with("172.30.")
        || ip.starts_with("172.31.")
}
