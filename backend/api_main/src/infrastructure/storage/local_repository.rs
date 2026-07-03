use crate::config::Settings;
use crate::domain::models::flashcard::DeckData;
use crate::domain::repositories::storage::StorageRepository;
use anyhow::{Context, Result};
use async_trait::async_trait;
use moka::future::Cache;
use std::path::{Component, Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::fs;

/// Caché de mazos: clave = "categoria/deck.json", valor = datos parseados.
/// Límite: 150 entradas × ~50 KB promedio ≈ 7.5 MB máximo.
/// TTL: 5 minutos (los mazos cambian muy raramente).
type DeckCache = Cache<String, Arc<DeckData>>;

/// Caché de listas: clave = prefijo de directorio, valor = lista de nombres.
type ListCache = Cache<String, Arc<Vec<String>>>;

/// Caché ligera de existencia de blobs (evita SSH/stat repetidos).
type ExistsCache = Cache<String, bool>;

pub struct LocalStorageRepository {
    base_path: PathBuf,
    json_prefix: String,
    sync_to_oracle: bool,
    oracle_repository_only: bool,
    oracle_host: String,
    oracle_public_url: String,
    oracle_ssh_password: String,
    oracle_remote_path: String,
    /// Pool de conexiones HTTP reusado en todas las llamadas a Oracle.
    http_client: reqwest::Client,
    /// Caché in-process para deck data: elimina RTTs repetidos a Oracle.
    deck_cache: DeckCache,
    /// Caché para listados de categorías y mazos.
    list_cache: ListCache,
    /// Evita comprobar el mismo .ogg/.meta en cada clic de audio (TTL corto).
    exists_cache: ExistsCache,
}

impl LocalStorageRepository {
    pub async fn new(settings: &Settings) -> Result<Self> {
        let base_path = PathBuf::from(&settings.local_storage_path);
        if !base_path.exists() {
            fs::create_dir_all(&base_path).await?;
        }

        let http_client = reqwest::ClientBuilder::new()
            .pool_max_idle_per_host(8)
            .pool_idle_timeout(Duration::from_secs(120))
            .tcp_nodelay(true)
            .timeout(Duration::from_secs(30))
            .build()?;

        // Acotado en entradas — no en bytes, para simplificar con DeckData variable.
        // 150 decks × ~50 KB = ~7.5 MB máx. Seguro en servidores de 1 GB.
        let deck_cache: DeckCache = Cache::builder()
            .max_capacity(150)
            .time_to_live(Duration::from_secs(300))
            .time_to_idle(Duration::from_secs(600))
            .build();

        let list_cache: ListCache = Cache::builder()
            .max_capacity(50)
            .time_to_live(Duration::from_secs(600))
            .build();

        let exists_cache: ExistsCache = Cache::builder()
            .max_capacity(3_000)
            .time_to_live(Duration::from_secs(300))
            .build();

        let repo = Self {
            base_path,
            json_prefix: settings.gcs_json_prefix.clone(),
            sync_to_oracle: settings.sync_to_oracle,
            oracle_repository_only: settings.oracle_repository_only,
            oracle_host: settings.oracle_host.clone(),
            oracle_public_url: settings.public_base_url.trim_end_matches('/').to_string(),
            oracle_ssh_password: settings.oracle_ssh_password.clone(),
            oracle_remote_path: settings.oracle_remote_path.clone(),
            http_client,
            deck_cache,
            list_cache,
            exists_cache,
        };

        if repo.sync_to_oracle && !repo.oracle_host.is_empty() {
            repo.setup_ssh_controlmaster().await;
        }

        Ok(repo)
    }

    /// Ruta del socket ControlMaster para este host.
    fn control_path(&self) -> String {
        format!(
            "/tmp/oracle-cm-{}",
            self.oracle_host.replace('.', "-").replace(':', "-")
        )
    }

    /// Lanza `ssh -N -o ControlMaster=yes` en background la primera vez.
    /// Si el socket ya existe, el comando termina solo (sin error).
    /// Usa SSHPASS env var para evitar exposición de la contraseña en argumentos.
    async fn setup_ssh_controlmaster(&self) {
        let cp = self.control_path();
        match tokio::process::Command::new("sshpass")
            .env("SSHPASS", &self.oracle_ssh_password)
            .args([
                "-e",
                "ssh",
                "-o",
                "StrictHostKeyChecking=no",
                "-o",
                "ControlMaster=yes",
                "-o",
                &format!("ControlPath={}", cp),
                "-o",
                "ControlPersist=600",
                "-N",
                &format!("root@{}", self.oracle_host),
            ])
            .spawn()
        {
            Ok(_) => tracing::info!("🔗 SSH ControlMaster iniciado hacia {}", self.oracle_host),
            Err(e) => tracing::warn!("⚠️ No se pudo iniciar SSH ControlMaster: {}", e),
        }
    }

    fn get_full_path(&self, relative_path: &str) -> PathBuf {
        let relative = relative_path.trim_start_matches('/');
        self.base_path.join(relative)
    }

    fn oracle_as_source_of_truth(&self) -> bool {
        self.oracle_repository_only
    }

    fn can_read_from_oracle(&self) -> bool {
        !self.oracle_base_url().is_empty()
    }

    fn can_write_to_oracle(&self) -> bool {
        self.sync_to_oracle && !self.oracle_host.is_empty()
    }

    fn uses_nested_level_decks(category: &str) -> bool {
        matches!(
            category.to_ascii_lowercase().as_str(),
            "verbs"
                | "nouns"
                | "adjectives"
                | "adverbs"
                | "connectors"
                | "determinant"
                | "phrasal_verbs"
                | "preposition"
                | "pronouns"
        )
    }

    fn validate_relative_path(relative_path: &str) -> Result<()> {
        let relative = relative_path.trim_start_matches('/');
        if relative.is_empty()
            || relative.contains('\\')
            || relative.contains('\0')
            || relative.contains('\n')
            || relative.contains('\r')
            || relative.contains('\t')
            || relative.contains('\'')
            || relative.contains('"')
            || relative.contains(';')
            || relative.contains('&')
            || relative.contains('|')
            || relative.contains('`')
            || relative.contains('$')
        {
            anyhow::bail!("Ruta de storage inválida");
        }

        for component in Path::new(relative).components() {
            match component {
                Component::Normal(segment) if !segment.is_empty() => {}
                _ => anyhow::bail!("Ruta de storage inválida"),
            }
        }

        Ok(())
    }

    /// Ruta local del blob (Oracle prod: mismo disco que sirve Caddy en /card_audio).
    #[allow(dead_code)]
    pub fn local_blob_path(&self, blob_path: &str) -> PathBuf {
        self.get_full_path(blob_path)
    }

    /// Oracle base URL — Caddy sirve /json/*, /card_images/*, /card_audio/* como archivos estáticos.
    fn oracle_base_url(&self) -> &str {
        // Usa public_base_url (siempre correcto) en vez de oracle_host
        // que puede estar vacío en Cloud Run si la variable no está en el grupo de secretos.
        &self.oracle_public_url
    }

    /// Descarga bytes de Oracle via HTTP (reutiliza pool de conexiones).
    async fn fetch_from_oracle(&self, path: &str) -> Result<Vec<u8>> {
        Self::validate_relative_path(path)?;
        let url = format!(
            "{}/{}",
            self.oracle_base_url(),
            path.trim_start_matches('/')
        );
        let res = self
            .http_client
            .get(&url)
            .send()
            .await
            .context(format!("HTTP GET fallido: {}", url))?;
        if res.status().is_success() {
            Ok(res.bytes().await?.to_vec())
        } else {
            Err(anyhow::anyhow!(
                "Oracle devolvió {} para {}",
                res.status(),
                url
            ))
        }
    }

    /// Lee bytes directamente del disco de Oracle (sin pasar por HTTP/CDN).
    async fn fetch_from_oracle_ssh(&self, blob_path: &str) -> Result<Vec<u8>> {
        Self::validate_relative_path(blob_path)?;
        if self.oracle_host.is_empty() {
            return Err(anyhow::anyhow!("Oracle host no configurado"));
        }

        let remote_file = format!(
            "{}/{}",
            self.oracle_remote_path,
            blob_path.trim_start_matches('/')
        );
        let cp = self.control_path();

        let output = tokio::process::Command::new("sshpass")
            .env("SSHPASS", &self.oracle_ssh_password)
            .args([
                "-e",
                "ssh",
                "-o",
                "StrictHostKeyChecking=no",
                "-o",
                "ControlMaster=auto",
                "-o",
                &format!("ControlPath={}", cp),
                &format!("root@{}", self.oracle_host),
                &format!("cat '{}'", remote_file),
            ])
            .output()
            .await
            .context(format!("ssh cat fallido: {}", remote_file))?;

        if output.status.success() && !output.stdout.is_empty() {
            tracing::debug!("📥 Oracle SSH read: {}", blob_path);
            return Ok(output.stdout);
        }

        Err(anyhow::anyhow!(
            "ssh cat falló para {}: {}",
            remote_file,
            String::from_utf8_lossy(&output.stderr).trim()
        ))
    }

    async fn remote_blob_mtime(&self, blob_path: &str) -> Result<Option<String>> {
        Self::validate_relative_path(blob_path)?;
        if self.oracle_host.is_empty() {
            return Ok(None);
        }

        let remote_file = format!(
            "{}/{}",
            self.oracle_remote_path,
            blob_path.trim_start_matches('/')
        );
        let cp = self.control_path();

        let output = tokio::process::Command::new("sshpass")
            .env("SSHPASS", &self.oracle_ssh_password)
            .args([
                "-e",
                "ssh",
                "-o",
                "StrictHostKeyChecking=no",
                "-o",
                "ControlMaster=auto",
                "-o",
                &format!("ControlPath={}", cp),
                &format!("root@{}", self.oracle_host),
                &format!("stat -c %Y '{}'", remote_file),
            ])
            .output()
            .await?;

        if !output.status.success() {
            return Ok(None);
        }

        let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if version.is_empty() {
            Ok(None)
        } else {
            Ok(Some(version))
        }
    }

    async fn local_blob_mtime(&self, blob_path: &str) -> Result<Option<String>> {
        Self::validate_relative_path(blob_path)?;
        let path = self.get_full_path(blob_path);
        if !path.exists() {
            return Ok(None);
        }

        let metadata = fs::metadata(&path).await?;
        let modified = metadata.modified().unwrap_or(SystemTime::UNIX_EPOCH);
        let version = modified
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs()
            .to_string();
        Ok(Some(version))
    }

    /// Lista entradas en Oracle via Caddy browse (reutiliza pool de conexiones).
    async fn list_oracle_entries(&self, rel_path: &str, dirs_only: bool) -> Result<Vec<String>> {
        Self::validate_relative_path(rel_path)?;
        let url = format!(
            "{}/{}/",
            self.oracle_base_url(),
            rel_path.trim_start_matches('/')
        );
        let res = self
            .http_client
            .get(&url)
            .send()
            .await
            .context(format!("HTTP listing fallido: {}", url))?;
        if !res.status().is_success() {
            return Ok(vec![]);
        }
        let body = res.text().await?;

        // Caddy browse genera links como: href="nombre/" (dirs) o href="nombre.ext" (files)
        let mut results = Vec::new();
        for line in body.lines() {
            if let Some(start) = line.find("href=\"") {
                let rest = &line[start + 6..];
                if let Some(end) = rest.find('"') {
                    let mut entry = &rest[..end];
                    if entry.starts_with("./") {
                        entry = &entry[2..];
                    }
                    if entry.starts_with('/') || entry.starts_with("..") || entry.starts_with("?") {
                        continue;
                    }
                    if dirs_only && entry.ends_with('/') {
                        results.push(entry.trim_end_matches('/').to_string());
                    } else if !dirs_only && !entry.ends_with('/') {
                        results.push(entry.to_string());
                    }
                }
            }
        }
        Ok(results)
    }

    async fn list_nested_remote_decks(&self, rel: &str) -> Result<Vec<String>> {
        let mut level_dirs = if let Ok(remote) = self.list_oracle_dir_via_ssh(rel).await {
            remote
        } else {
            self.list_oracle_entries(rel, true)
                .await
                .unwrap_or_default()
        };

        level_dirs.sort();
        level_dirs.dedup();

        let mut decks = Vec::new();
        for level_dir in level_dirs {
            let nested_rel = format!("{rel}/{level_dir}");
            let mut files: Vec<String> =
                if let Ok(remote) = self.list_oracle_dir_via_ssh(&nested_rel).await {
                    remote
                        .into_iter()
                        .filter(|name| name.ends_with(".json") && !name.contains(".bak"))
                        .collect()
                } else {
                    self.list_oracle_entries(&nested_rel, false)
                        .await
                        .unwrap_or_default()
                        .into_iter()
                        .filter(|name| name.ends_with(".json") && !name.contains(".bak"))
                        .collect()
                };

            files.sort();
            files.dedup();

            for file in files {
                decks.push(format!("{level_dir}/{file}"));
            }
        }

        Ok(decks)
    }

    async fn list_nested_local_decks(&self, rel: &str) -> Result<Vec<String>> {
        let local_path = self.get_full_path(rel);
        if !local_path.exists() {
            return Ok(vec![]);
        }

        let mut level_entries = fs::read_dir(&local_path).await?;
        let mut decks = Vec::new();

        while let Some(level_entry) = level_entries.next_entry().await? {
            if !level_entry.file_type().await?.is_dir() {
                continue;
            }

            let Some(level_name) = level_entry.file_name().to_str().map(str::to_string) else {
                continue;
            };

            let mut files = fs::read_dir(level_entry.path()).await?;
            while let Some(file_entry) = files.next_entry().await? {
                if !file_entry.file_type().await?.is_file() {
                    continue;
                }

                if let Some(file_name) = file_entry.file_name().to_str() {
                    if file_name.ends_with(".json") && !file_name.contains(".bak") {
                        if Self::local_json_file_has_cards(&file_entry.path()).await {
                            decks.push(format!("{level_name}/{file_name}"));
                        }
                    }
                }
            }
        }

        decks.sort();
        decks.dedup();
        Ok(decks)
    }

    async fn local_json_file_has_cards(path: &Path) -> bool {
        match fs::read(path).await {
            Ok(bytes) => match serde_json::from_slice::<serde_json::Value>(&bytes) {
                Ok(serde_json::Value::Array(cards)) => !cards.is_empty(),
                _ => true,
            },
            Err(_) => true,
        }
    }

    /// Transfiere un archivo a Oracle.
    ///
    /// Usa `Command::arg()` directamente (sin `sh -c`) y pasa la contraseña via la
    /// variable de entorno `SSHPASS` con `sshpass -e`. Esto evita:
    ///   - Problemas de quoting de shell cuando la contraseña tiene caracteres especiales.
    ///   - Exposición de la contraseña en `ps aux` (está en el entorno, no en args).
    ///
    /// Retorna `Result<()>` para que el caller pueda propagar el error al cliente
    /// en vez de devolver una URL que apunta a un archivo que nunca llegó a Oracle.
    async fn scp_to_oracle(&self, local_path: &Path, remote_relative: &str) -> Result<()> {
        Self::validate_relative_path(remote_relative)?;
        let cp = self.control_path();
        let parent_dir = Path::new(remote_relative)
            .parent()
            .and_then(|p| p.to_str())
            .unwrap_or("")
            .to_string();
        let remote_dir = format!("{}/{}", self.oracle_remote_path, parent_dir);
        let remote_file = format!("{}/{}", self.oracle_remote_path, remote_relative);
        let remote_target = format!(
            "root@{}:\"{}\"",
            self.oracle_host,
            remote_file.replace("\"", "\\\"")
        );

        // Paso 1: mkdir -p en el servidor remoto.
        let mkdir = tokio::process::Command::new("sshpass")
            .env("SSHPASS", &self.oracle_ssh_password)
            .args([
                "-e",
                "ssh",
                "-o",
                "StrictHostKeyChecking=no",
                "-o",
                "ControlMaster=auto",
                "-o",
                &format!("ControlPath={}", cp),
                &format!("root@{}", self.oracle_host),
                &format!("mkdir -p '{}'", remote_dir),
            ])
            .status()
            .await
            .context("ssh mkdir: proceso no se pudo lanzar")?;

        if !mkdir.success() {
            return Err(anyhow::anyhow!(
                "ssh mkdir -p '{}' falló con código {:?}",
                remote_dir,
                mkdir.code()
            ));
        }

        // Paso 2: copiar el archivo.
        let scp = tokio::process::Command::new("sshpass")
            .env("SSHPASS", &self.oracle_ssh_password)
            .args([
                "-e",
                "scp",
                "-o",
                "StrictHostKeyChecking=no",
                "-o",
                "ControlMaster=auto",
                "-o",
                &format!("ControlPath={}", cp),
                &local_path.to_string_lossy().to_string(),
                &remote_target,
            ])
            .status()
            .await
            .context("scp: proceso no se pudo lanzar")?;

        if !scp.success() {
            return Err(anyhow::anyhow!(
                "scp '{}' → '{}' falló con código {:?}",
                local_path.display(),
                remote_target,
                scp.code()
            ));
        }

        tracing::info!("✅ SCP Oracle: {}", remote_relative);
        Ok(())
    }
}

#[async_trait]
impl StorageRepository for LocalStorageRepository {
    async fn list_categories(&self) -> Result<Vec<String>> {
        let cache_key = format!("cats:{}", self.json_prefix);
        if let Some(cached) = self.list_cache.get(&cache_key).await {
            return Ok((*cached).clone());
        }

        let path = self.get_full_path(&self.json_prefix);
        let result = if self.oracle_as_source_of_truth() {
            if !self.can_read_from_oracle() {
                anyhow::bail!(
                    "Oracle repository mode activo pero public_base_url no está configurado"
                );
            }
            self.list_oracle_entries(&self.json_prefix.clone(), true)
                .await?
        } else if path.exists() {
            let mut entries = fs::read_dir(&path).await?;
            let mut categories = Vec::new();
            while let Some(entry) = entries.next_entry().await? {
                if entry.file_type().await?.is_dir() {
                    if let Some(name) = entry.file_name().to_str() {
                        categories.push(name.to_string());
                    }
                }
            }
            categories
        } else if self.sync_to_oracle {
            self.list_oracle_entries(&self.json_prefix.clone(), true)
                .await?
        } else {
            vec![]
        };

        // Strip defensivo: algunos templates de Caddy browse devuelven "./nombre"
        let result: Vec<String> = result
            .into_iter()
            .map(|s| s.trim_start_matches("./").to_string())
            .filter(|s| !s.is_empty())
            .collect();

        self.list_cache
            .insert(cache_key, Arc::new(result.clone()))
            .await;
        Ok(result)
    }

    async fn list_decks(&self, category: &str) -> Result<Vec<String>> {
        Self::validate_relative_path(category)?;
        let cache_key = format!("decks:{}/{}", self.json_prefix, category);
        if let Some(cached) = self.list_cache.get(&cache_key).await {
            return Ok((*cached).clone());
        }

        let rel = format!("{}/{}", self.json_prefix, category);
        let mut result = Vec::new();

        if Self::uses_nested_level_decks(category) {
            let mut nested_result = Vec::new();

            let mut local_nested = self.list_nested_local_decks(&rel).await?;
            if !local_nested.is_empty() {
                local_nested.sort();
                local_nested.dedup();
                result = local_nested;
            } else {
                if self.oracle_as_source_of_truth()
                    || (self.sync_to_oracle && !self.oracle_host.is_empty())
                {
                    nested_result = self
                        .list_nested_remote_decks(&rel)
                        .await
                        .unwrap_or_default();
                }

                if !self.oracle_as_source_of_truth() {
                    let mut fallback_local_nested = self.list_nested_local_decks(&rel).await?;
                    nested_result.append(&mut fallback_local_nested);
                    nested_result.sort();
                    nested_result.dedup();
                }

                if !nested_result.is_empty() {
                    result = nested_result;
                }
            }
        }

        if self.oracle_as_source_of_truth() || (self.sync_to_oracle && !self.oracle_host.is_empty())
        {
            if result.is_empty() {
                if let Ok(remote) = self.list_oracle_dir_via_ssh(&rel).await {
                    result = remote
                        .into_iter()
                        .filter(|n| n.ends_with(".json") && !n.contains(".bak"))
                        .collect();
                }
            }
            if result.is_empty() {
                result = self
                    .list_oracle_entries(&rel, false)
                    .await
                    .unwrap_or_default()
                    .into_iter()
                    .filter(|n| n.ends_with(".json") && !n.contains(".bak"))
                    .collect();
            }
        }

        if result.is_empty() && !self.oracle_as_source_of_truth() {
            let local_path = self.get_full_path(&rel);
            if local_path.exists() {
                let mut entries = fs::read_dir(&local_path).await?;
                while let Some(entry) = entries.next_entry().await? {
                    if entry.file_type().await?.is_file() {
                        if let Some(name) = entry.file_name().to_str() {
                            if name.ends_with(".json") && !name.contains(".bak") {
                                result.push(name.to_string());
                            }
                        }
                    }
                }
            }
        }

        self.list_cache
            .insert(cache_key, Arc::new(result.clone()))
            .await;
        Ok(result)
    }

    async fn get_deck_data(&self, category: &str, deck_name: &str) -> Result<DeckData> {
        Self::validate_relative_path(category)?;
        Self::validate_relative_path(deck_name)?;
        let mut full_name = deck_name.to_string();
        if !full_name.ends_with(".json") {
            full_name.push_str(".json");
        }
        let cache_key = format!("{}/{}", category, full_name);

        // Cache hit → 0 ms, sin I/O ni red
        if let Some(cached) = self.deck_cache.get(&cache_key).await {
            return Ok((*cached).clone());
        }

        let object_name = format!("{}/{}/{}", self.json_prefix, category, full_name);
        let path = self.get_full_path(&object_name);

        let data = if Self::uses_nested_level_decks(category)
            && full_name.contains('/')
            && path.exists()
        {
            fs::read(&path)
                .await
                .context(format!("Failed to read {}", object_name))?
        } else if self.oracle_as_source_of_truth() {
            match self.fetch_from_oracle(&object_name).await {
                Ok(bytes) => bytes,
                Err(_) if self.oracle_host.is_empty() => {
                    anyhow::bail!(
                        "Oracle repository mode activo pero ORACLE_HOST no está configurado"
                    );
                }
                Err(_) => self
                    .fetch_from_oracle_ssh(&object_name)
                    .await
                    .context(format!("Deck no encontrado en Oracle: {}", object_name))?,
            }
        } else if self.sync_to_oracle {
            match self.fetch_from_oracle(&object_name).await {
                Ok(bytes) => bytes,
                Err(e) if path.exists() => {
                    tracing::warn!(
                        "Oracle falló para {} ({:?}), usando copia local",
                        object_name,
                        e
                    );
                    fs::read(&path)
                        .await
                        .context(format!("Failed to read {}", object_name))?
                }
                Err(e) => {
                    return Err(e.context(format!("Deck no encontrado en Oracle: {}", object_name)))
                }
            }
        } else if path.exists() {
            fs::read(&path)
                .await
                .context(format!("Failed to read {}", object_name))?
        } else {
            return Err(anyhow::anyhow!("Deck file not found: {}", object_name));
        };

        let deck: DeckData = serde_json::from_slice(&data)?;
        self.deck_cache
            .insert(cache_key, Arc::new(deck.clone()))
            .await;
        Ok(deck)
    }

    async fn save_deck_data(&self, category: &str, deck_name: &str, data: &DeckData) -> Result<()> {
        Self::validate_relative_path(category)?;
        Self::validate_relative_path(deck_name)?;
        let mut full_name = deck_name.to_string();
        if !full_name.ends_with(".json") {
            full_name.push_str(".json");
        }
        let object_name = format!("{}/{}/{}", self.json_prefix, category, full_name);
        let path = self.get_full_path(&object_name);

        if self.oracle_as_source_of_truth() && !self.can_write_to_oracle() {
            anyhow::bail!(
                "Oracle repository mode activo pero no hay escritura a Oracle configurada"
            );
        }

        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).await?;
        }
        let content = serde_json::to_vec_pretty(data)?;
        fs::write(&path, &content).await?;

        // Invalidar cache del deck modificado
        let cache_key = format!("{}/{}", category, full_name);
        self.deck_cache.invalidate(&cache_key).await;
        self.list_cache
            .invalidate(&format!("decks:{}/{}", self.json_prefix, category))
            .await;

        if self.sync_to_oracle {
            if let Err(err) = self.scp_to_oracle(&path, &object_name).await {
                tracing::error!("Failed to sync deck to Oracle via SCP: {:?}", err);
                return Err(err);
            }
            if self.oracle_as_source_of_truth() || self.sync_to_oracle {
                if let Err(e) = fs::remove_file(&path).await {
                    tracing::warn!("No se pudo eliminar temporal local {:?}: {}", path, e);
                }
            }
        }

        Ok(())
    }

    async fn get_phonics_data(&self) -> Result<serde_json::Value> {
        let blob_path = "static/phonics_audio/phonics.json";
        let data = if self.oracle_as_source_of_truth() {
            self.fetch_from_oracle(blob_path).await?
        } else {
            let path = self.get_full_path(blob_path);
            fs::read(&path).await?
        };
        let val: serde_json::Value = serde_json::from_slice(&data)?;
        Ok(val)
    }

    async fn download_blob(&self, blob_path: &str) -> Result<Vec<u8>> {
        Self::validate_relative_path(blob_path)?;
        let path = self.get_full_path(blob_path);

        if self.oracle_as_source_of_truth() {
            if let Ok(bytes) = self.fetch_from_oracle(blob_path).await {
                return Ok(bytes);
            }
            if !self.oracle_host.is_empty() {
                if let Ok(bytes) = self.fetch_from_oracle_ssh(blob_path).await {
                    return Ok(bytes);
                }
            }
            return Err(anyhow::anyhow!(
                "Archivo no encontrado en Oracle: {}",
                blob_path
            ));
        }

        if path.exists() {
            return Ok(fs::read(&path).await?);
        }

        if self.sync_to_oracle {
            if let Ok(bytes) = self.fetch_from_oracle(blob_path).await {
                return Ok(bytes);
            }
            if let Ok(bytes) = self.fetch_from_oracle_ssh(blob_path).await {
                return Ok(bytes);
            }
        }

        Err(anyhow::anyhow!("Archivo no encontrado: {}", blob_path))
    }

    async fn upload_blob(
        &self,
        blob_path: &str,
        content: Vec<u8>,
        _content_type: &str,
    ) -> Result<()> {
        Self::validate_relative_path(blob_path)?;
        if self.oracle_as_source_of_truth() && !self.can_write_to_oracle() {
            anyhow::bail!(
                "Oracle repository mode activo pero no hay escritura a Oracle configurada"
            );
        }
        let path = self.get_full_path(blob_path);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).await?;
        }
        fs::write(&path, &content).await?;
        self.exists_cache.insert(blob_path.to_string(), true).await;

        if self.sync_to_oracle {
            self.scp_to_oracle(&path, blob_path).await.map_err(|e| {
                tracing::error!("❌ SCP fallido para '{}': {}", blob_path, e);
                e
            })?;
            if self.oracle_as_source_of_truth() {
                if let Err(e) = fs::remove_file(&path).await {
                    tracing::warn!("No se pudo eliminar temporal local {:?}: {}", path, e);
                }
            }
        }

        Ok(())
    }

    async fn blob_exists(&self, blob_path: &str) -> Result<bool> {
        Self::validate_relative_path(blob_path)?;
        if let Some(cached) = self.exists_cache.get(blob_path).await {
            return Ok(cached);
        }

        let exists = self.blob_exists_uncached(blob_path).await?;
        self.exists_cache
            .insert(blob_path.to_string(), exists)
            .await;
        Ok(exists)
    }

    async fn blob_version(&self, blob_path: &str) -> Result<Option<String>> {
        Self::validate_relative_path(blob_path)?;

        if !self.oracle_as_source_of_truth() {
            if let Some(version) = self.local_blob_mtime(blob_path).await? {
                return Ok(Some(version));
            }
        }

        if (self.oracle_as_source_of_truth() || self.sync_to_oracle) && !self.oracle_host.is_empty()
        {
            if let Some(version) = self.remote_blob_mtime(blob_path).await? {
                return Ok(Some(version));
            }
        }

        Ok(None)
    }

    async fn find_blob_by_prefix(&self, prefix: &str) -> Result<Option<String>> {
        Self::validate_relative_path(prefix)?;
        let prefix_path = Path::new(prefix);
        let dir_str = prefix_path
            .parent()
            .and_then(|p| p.to_str())
            .unwrap_or("")
            .to_string();
        let file_prefix = prefix_path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();

        if self.oracle_as_source_of_truth() || self.sync_to_oracle {
            let entries = if let Ok(remote) = self.list_oracle_dir_via_ssh(&dir_str).await {
                remote
            } else {
                self.list_oracle_entries(&dir_str, false)
                    .await
                    .unwrap_or_default()
            };
            for name in entries {
                if name.starts_with(&file_prefix)
                    && !name.contains(".archive.")
                    && !name.ends_with(".meta.json")
                {
                    let result = if dir_str.is_empty() {
                        name
                    } else {
                        format!("{}/{}", dir_str, name)
                    };
                    return Ok(Some(result));
                }
            }
        }

        let dir = self.get_full_path(&dir_str);
        if !self.oracle_as_source_of_truth() && dir.exists() && dir.is_dir() {
            let mut entries = fs::read_dir(&dir).await?;
            while let Some(entry) = entries.next_entry().await? {
                if entry.file_type().await?.is_file() {
                    if let Some(name) = entry.file_name().to_str() {
                        if name.starts_with(&file_prefix)
                            && !name.contains(".archive.")
                            && !name.ends_with(".meta.json")
                        {
                            let result = if dir_str.is_empty() {
                                name.to_string()
                            } else {
                                format!("{}/{}", dir_str, name)
                            };
                            return Ok(Some(result));
                        }
                    }
                }
            }
        }

        Ok(None)
    }

    async fn rename_blob(&self, from_path: &str, to_path: &str) -> Result<()> {
        Self::validate_relative_path(from_path)?;
        Self::validate_relative_path(to_path)?;
        let remote_from = format!(
            "{}/{}",
            self.oracle_remote_path,
            from_path.trim_start_matches('/')
        );
        let remote_to = format!(
            "{}/{}",
            self.oracle_remote_path,
            to_path.trim_start_matches('/')
        );

        if self.sync_to_oracle && !self.oracle_host.is_empty() {
            let cp = self.control_path();
            let parent = Path::new(to_path.trim_start_matches('/'))
                .parent()
                .and_then(|p| p.to_str())
                .unwrap_or("");
            let remote_parent = if parent.is_empty() {
                self.oracle_remote_path.clone()
            } else {
                format!("{}/{}", self.oracle_remote_path, parent)
            };
            let script = format!(
                "mkdir -p '{}' && mv -f '{}' '{}'",
                remote_parent, remote_from, remote_to
            );
            let status = tokio::process::Command::new("sshpass")
                .env("SSHPASS", &self.oracle_ssh_password)
                .args([
                    "-e",
                    "ssh",
                    "-o",
                    "StrictHostKeyChecking=no",
                    "-o",
                    "ControlMaster=auto",
                    "-o",
                    &format!("ControlPath={}", cp),
                    &format!("root@{}", self.oracle_host),
                    &script,
                ])
                .status()
                .await?;
            if !status.success() {
                anyhow::bail!("Oracle rename falló: {} → {}", from_path, to_path);
            }
            tracing::info!("📦 Archivado en Oracle: {} → {}", from_path, to_path);
        }

        let from = self.get_full_path(from_path);
        let to = self.get_full_path(to_path);
        if from.exists() {
            if let Some(parent) = to.parent() {
                fs::create_dir_all(parent).await?;
            }
            fs::rename(&from, &to).await?;
        }

        Ok(())
    }

    async fn delete_blob(&self, blob_path: &str) -> Result<()> {
        Self::validate_relative_path(blob_path)?;
        // Borrar local si existe (backends efímeros pueden tener copia temporal)
        let path = self.get_full_path(blob_path);
        if path.exists() {
            let _ = fs::remove_file(&path).await;
        }

        // Borrar en Oracle (repositorio permanente) via SSH.
        // Usa SSHPASS env var para evitar quoting issues con la contraseña.
        if self.sync_to_oracle {
            let remote_file = format!(
                "{}/{}",
                self.oracle_remote_path,
                blob_path.trim_start_matches('/')
            );
            let cp = self.control_path();
            match tokio::process::Command::new("sshpass")
                .env("SSHPASS", &self.oracle_ssh_password)
                .args([
                    "-e",
                    "ssh",
                    "-o",
                    "StrictHostKeyChecking=no",
                    "-o",
                    "ControlMaster=auto",
                    "-o",
                    &format!("ControlPath={}", cp),
                    &format!("root@{}", self.oracle_host),
                    &format!("rm -f '{}'", remote_file),
                ])
                .status()
                .await
            {
                Ok(s) if s.success() => tracing::info!("✅ Deleted from Oracle: {}", blob_path),
                other => tracing::warn!("⚠️ Oracle delete fallido para {}: {:?}", blob_path, other),
            }
        }

        Ok(())
    }

    async fn list_files_in_dir(&self, rel_dir: &str) -> Result<Vec<String>> {
        Self::validate_relative_path(rel_dir)?;
        let rel = rel_dir.trim_start_matches('/');
        let mut names = Vec::new();

        // Con SYNC_TO_ORACLE: Oracle primero (el disco local suele estar vacío/incompleto).
        if self.sync_to_oracle && !self.oracle_host.is_empty() {
            if let Ok(remote) = self.list_oracle_dir_via_ssh(rel).await {
                names = remote;
            }
        }

        if names.is_empty() && !self.oracle_as_source_of_truth() {
            let local_dir = self.get_full_path(rel);
            if local_dir.exists() && local_dir.is_dir() {
                let mut entries = fs::read_dir(&local_dir).await?;
                while let Some(entry) = entries.next_entry().await? {
                    if entry.file_type().await?.is_file() {
                        if let Some(name) = entry.file_name().to_str() {
                            names.push(name.to_string());
                        }
                    }
                }
                names.sort();
            }
        }

        Ok(names)
    }
}

impl LocalStorageRepository {
    async fn blob_exists_uncached(&self, blob_path: &str) -> Result<bool> {
        Self::validate_relative_path(blob_path)?;
        if (self.oracle_as_source_of_truth() || self.sync_to_oracle) && !self.oracle_host.is_empty()
        {
            let remote_file = format!(
                "{}/{}",
                self.oracle_remote_path,
                blob_path.trim_start_matches('/')
            );
            let cp = self.control_path();

            let output = tokio::process::Command::new("sshpass")
                .env("SSHPASS", &self.oracle_ssh_password)
                .args([
                    "-e",
                    "ssh",
                    "-o",
                    "StrictHostKeyChecking=no",
                    "-o",
                    "ControlMaster=auto",
                    "-o",
                    &format!("ControlPath={}", cp),
                    &format!("root@{}", self.oracle_host),
                    &format!("test -f '{}' && echo yes || echo no", remote_file),
                ])
                .output()
                .await;

            match output {
                Ok(out) if out.status.success() => {
                    let exists = String::from_utf8_lossy(&out.stdout).trim() == "yes";
                    tracing::debug!("🔍 Oracle blob_exists: {} → {}", remote_file, exists);
                    return Ok(exists);
                }
                Ok(out) => {
                    let stderr = String::from_utf8_lossy(&out.stderr);
                    tracing::warn!(
                        "⚠️ blob_exists SSH falló para '{}': {}",
                        blob_path,
                        stderr.trim()
                    );
                }
                Err(e) => {
                    tracing::warn!("⚠️ blob_exists SSH error para '{}': {}", blob_path, e);
                }
            }
            return Ok(false);
        }

        if self.oracle_as_source_of_truth() {
            return Ok(false);
        }

        let path = self.get_full_path(blob_path);
        Ok(path.exists())
    }

    /// Un solo `ls` por directorio — mucho más rápido que HEAD por archivo.
    async fn list_oracle_dir_via_ssh(&self, rel_dir: &str) -> Result<Vec<String>> {
        Self::validate_relative_path(rel_dir)?;
        let remote_dir = format!("{}/{}", self.oracle_remote_path, rel_dir);
        let cp = self.control_path();

        let output = tokio::process::Command::new("sshpass")
            .env("SSHPASS", &self.oracle_ssh_password)
            .args([
                "-e",
                "ssh",
                "-o",
                "StrictHostKeyChecking=no",
                "-o",
                "ControlMaster=auto",
                "-o",
                &format!("ControlPath={}", cp),
                &format!("root@{}", self.oracle_host),
                &format!("ls -1 '{}'", remote_dir),
            ])
            .output()
            .await?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            tracing::warn!("⚠️ ls remoto falló para {}: {}", rel_dir, stderr.trim());
            return Ok(vec![]);
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let names: Vec<String> = stdout
            .lines()
            .map(str::trim)
            .filter(|l| !l.is_empty())
            .map(|l| l.to_string())
            .collect();
        Ok(names)
    }
}
