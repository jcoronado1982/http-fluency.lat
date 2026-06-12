use std::sync::Arc;
use std::time::{Duration, Instant};
use anyhow::{Result, anyhow};
use jsonwebtoken::{encode, decode, Header, Algorithm, Validation, EncodingKey, DecodingKey};
use serde::{Deserialize, Serialize};
use chrono::{Utc, Duration as ChronoDuration};
use tokio::sync::RwLock;
use crate::domain::repositories::db_repository::{UserRepository, SubscriptionRepository};
use crate::domain::models::user::{User, GooglePayload};

#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String,
    pub email: String,
    pub name: String,
    pub role: String,
    pub exp: usize,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AuthResponse {
    pub token: String,
    pub user: User,
}

/// Cache de las llaves públicas de Google (JWKS).
/// Google rota estas llaves cada pocas horas; las cacheamos 1 hora para evitar
/// un round-trip HTTP externo en cada login bajo alta concurrencia.
struct JwksCache {
    value: serde_json::Value,
    fetched_at: Instant,
}

impl JwksCache {
    const TTL: Duration = Duration::from_secs(3600); // 1 hora

    fn is_valid(&self) -> bool {
        self.fetched_at.elapsed() < Self::TTL
    }
}

pub struct AuthUseCases {
    user_repo: Arc<dyn UserRepository>,
    sub_repo: Arc<dyn SubscriptionRepository>,
    /// Cliente HTTP reutilizado para beneficiar del connection pool interno de reqwest.
    http_client: reqwest::Client,
    /// Cache de JWKS protegido por RwLock: N lecturas simultáneas, 1 escritura ocasional.
    jwks_cache: RwLock<Option<JwksCache>>,
    jwt_secret: String,
    google_client_id: String,
    super_admin_email: String,
}

impl AuthUseCases {
    pub fn new(user_repo: Arc<dyn UserRepository>, sub_repo: Arc<dyn SubscriptionRepository>) -> Self {
        let jwt_secret = std::env::var("JWT_SECRET")
            .expect("JWT_SECRET env var must be set — refusing to start with a weak default");
        let google_client_id = std::env::var("GOOGLE_CLIENT_ID").unwrap_or_default();
        let super_admin_email = std::env::var("SUPER_ADMIN_EMAIL").unwrap_or_default();

        Self {
            user_repo,
            sub_repo,
            http_client: reqwest::Client::new(),
            jwks_cache: RwLock::new(None),
            jwt_secret,
            google_client_id,
            super_admin_email,
        }
    }

    pub async fn google_login(&self, id_token: &str) -> Result<AuthResponse> {
        // 1. Validar token de Google (usa JWKS cacheado)
        let payload = self.validate_google_token(id_token).await?;

        let is_super_admin = !self.super_admin_email.is_empty()
            && self.super_admin_email.to_lowercase() == payload.email.to_lowercase();

        // 2. Leer usuario y suscripción en PARALELO — un solo round-trip a SurrealDB
        //    en vez de dos secuenciales: ahorra ~latencia_db por cada login.
        let (user_opt, sub_opt) = tokio::try_join!(
            self.user_repo.get_user_by_email(&payload.email),
            self.sub_repo.get_subscription(&payload.email),
        )?;

        // 3. Upsert del usuario
        let raw_user = match user_opt {
            Some(mut existing) => {
                existing.last_login = Utc::now();
                existing.name = payload.name;
                existing.picture = payload.picture;
                if is_super_admin {
                    existing.role = "admin".to_string();
                }
                self.user_repo.upsert_user(existing).await?
            }
            None => {
                let new_user = User {
                    id: None,
                    email: payload.email.clone(),
                    name: payload.name.clone(),
                    picture: payload.picture.clone(),
                    role: if is_super_admin { "admin".to_string() } else { "viewer".to_string() },
                    created_at: Utc::now(),
                    last_login: Utc::now(),
                };
                self.user_repo.upsert_user(new_user).await?
            }
        };

        // 4. Elevar rol si suscripción está activa
        let effective_role = self.resolve_role(&raw_user, sub_opt.as_ref());
        let user = if raw_user.role != effective_role {
            let mut updated = raw_user.clone();
            updated.role = effective_role;
            self.user_repo.upsert_user(updated).await.unwrap_or(raw_user)
        } else {
            raw_user
        };

        // 5. Generar JWT con exp recortado a expires_at de la suscripción
        let token = self.generate_jwt(&user, sub_opt.as_ref())?;

        Ok(AuthResponse { token, user })
    }

    async fn validate_google_token(&self, id_token: &str) -> Result<GooglePayload> {
        let header = jsonwebtoken::decode_header(id_token)?;
        let kid = header.kid.ok_or_else(|| anyhow!("Missing kid in token header"))?;

        // Intento con caché (solo lock de lectura — sin contención)
        let jwks = {
            let guard = self.jwks_cache.read().await;
            if let Some(cache) = guard.as_ref() {
                if cache.is_valid() {
                    Some(cache.value.clone())
                } else {
                    None
                }
            } else {
                None
            }
        };

        // Si el caché está vacío o expiró, refrescar (lock de escritura exclusiva)
        let jwks = match jwks {
            Some(v) => v,
            None => {
                let fresh = self.fetch_jwks().await?;
                let mut guard = self.jwks_cache.write().await;
                *guard = Some(JwksCache { value: fresh.clone(), fetched_at: Instant::now() });
                fresh
            }
        };

        let keys = jwks["keys"].as_array().ok_or_else(|| anyhow!("Invalid JWKS format"))?;
        let key_data = keys.iter()
            .find(|k| k["kid"].as_str() == Some(&kid))
            .ok_or_else(|| anyhow!("Key ID not found in Google JWKS"))?;

        let n = key_data["n"].as_str().ok_or_else(|| anyhow!("Missing n in key"))?;
        let e = key_data["e"].as_str().ok_or_else(|| anyhow!("Missing e in key"))?;
        let decoding_key = DecodingKey::from_rsa_components(n, e)?;

        let mut validation = Validation::new(Algorithm::RS256);
        validation.set_audience(&[&self.google_client_id]);
        validation.set_issuer(&["https://accounts.google.com", "accounts.google.com"]);

        let token_data = decode::<GooglePayload>(id_token, &decoding_key, &validation)?;

        if !token_data.claims.email_verified {
            return Err(anyhow!("Google email not verified"));
        }

        Ok(token_data.claims)
    }

    async fn fetch_jwks(&self) -> Result<serde_json::Value> {
        let response = self.http_client
            .get("https://www.googleapis.com/oauth2/v3/certs")
            .send()
            .await?;
        let jwks = response.json::<serde_json::Value>().await?;
        Ok(jwks)
    }

    /// Normaliza un rol para comparaciones consistentes (trim + lowercase).
    pub fn normalize_role(role: &str) -> String {
        role.trim().to_lowercase()
    }

    pub fn is_admin_role(role: &str) -> bool {
        Self::normalize_role(role) == "admin"
    }

    pub fn is_premium_role(role: &str) -> bool {
        matches!(Self::normalize_role(role).as_str(), "admin" | "premium")
    }

    /// Resuelve el rol efectivo en tiempo de request (fuente de verdad: DB + suscripción).
    /// El JWT puede quedar desactualizado si el usuario fue promovido sin volver a iniciar sesión.
    pub async fn resolve_effective_role(&self, email: &str, jwt_role: &str) -> String {
        if !self.super_admin_email.is_empty()
            && self.super_admin_email.to_lowercase() == email.to_lowercase()
        {
            tracing::info!("🔐 Rol efectivo para '{}': admin (SUPER_ADMIN_EMAIL)", email);
            return "admin".to_string();
        }

        let user_role = match self.user_repo.get_user_by_email(email).await {
            Ok(Some(user)) if Self::is_admin_role(&user.role) => {
                tracing::info!("🔐 Rol efectivo para '{}': admin (BD)", email);
                return "admin".to_string();
            }
            Ok(Some(user)) => Some(Self::normalize_role(&user.role)),
            Ok(None) => None,
            Err(e) => {
                tracing::warn!("⚠️ No se pudo leer usuario '{}' en BD: {}", email, e);
                None
            }
        };

        if let Ok(Some(sub)) = self.sub_repo.get_subscription(email).await {
            if sub.is_active() {
                tracing::info!("🔐 Rol efectivo para '{}': premium (suscripción)", email);
                return "premium".to_string();
            }
        }

        if let Some(role) = user_role {
            if role == "premium" {
                tracing::info!("🔐 Rol efectivo para '{}': premium (BD)", email);
                return "premium".to_string();
            }
        }

        let effective = Self::normalize_role(jwt_role);
        tracing::info!(
            "🔐 Rol efectivo para '{}': {} (JWT/BD sin privilegios extra)",
            email, effective
        );
        effective
    }

    /// Determina el rol efectivo según la suscripción vigente.
    /// - admin siempre conserva su rol.
    /// - Suscripción activa y no vencida → premium.
    /// - Sin suscripción o vencida → viewer.
    fn resolve_role(
        &self,
        user: &User,
        sub: Option<&crate::domain::models::subscription::Subscription>,
    ) -> String {
        if Self::is_admin_role(&user.role) {
            return "admin".to_string();
        }
        match sub {
            Some(s) if s.is_active() => "premium".to_string(),
            _ => "viewer".to_string(),
        }
    }

    fn generate_jwt(
        &self,
        user: &User,
        sub: Option<&crate::domain::models::subscription::Subscription>,
    ) -> Result<String> {
        let default_exp = Utc::now()
            .checked_add_signed(ChronoDuration::days(7))
            .expect("valid timestamp");

        // Recortar exp al vencimiento de la suscripción premium para que el JWT
        // no conceda acceso más allá del período pagado.
        let expiration = if user.role == "premium" {
            if let Some(s) = sub {
                if s.expires_at < default_exp { s.expires_at.timestamp() as usize }
                else { default_exp.timestamp() as usize }
            } else {
                default_exp.timestamp() as usize
            }
        } else {
            default_exp.timestamp() as usize
        };

        let claims = Claims {
            sub: user.email.clone(),
            email: user.email.clone(),
            name: user.name.clone(),
            role: user.role.clone(),
            exp: expiration,
        };

        let token = encode(
            &Header::default(),
            &claims,
            &EncodingKey::from_secret(self.jwt_secret.as_bytes()),
        )?;

        Ok(token)
    }

    pub fn validate_jwt(&self, token: &str) -> Result<Claims> {
        let mut validation = Validation::new(Algorithm::HS256);
        validation.validate_exp = true;
        validation.required_spec_claims.clear();

        let token_data = decode::<Claims>(
            token,
            &DecodingKey::from_secret(self.jwt_secret.as_bytes()),
            &validation,
        )?;
        Ok(token_data.claims)
    }
}
