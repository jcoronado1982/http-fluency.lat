# Módulo `flashcards` — Estudio con tarjetas

## Propósito

Módulo principal del producto: estudio de vocabulario con flashcards por categorías gramaticales
y pares de idiomas (es_en, en_es, en_fr…), con progreso por usuario (SRS), audio TTS (.ogg Opus)
e imágenes generadas por IA (.avif).

## Estado y roadmap

- Estado: **activo** — es el módulo por defecto (`VITE_DEFAULT_MODULE=flashcards`).
- La generación de media (audio/imágenes) es tooling transversal: ver
  [`media-generation.md`](media-generation.md).

## Mapa de archivos

| Capa | Ruta | Qué contiene |
|---|---|---|
| Dominio | `backend/core/src/domain/models/flashcard.rs` | modelo de tarjeta |
| Puerto DB | `backend/core/src/ports/db_repository.rs` | `CardProgressRepository` |
| Casos de uso | `backend/mod_flashcards/src/lib.rs` | `DeckUseCases` |
| Casos de uso media | `backend/mod_flashcards/src/audio_use_cases.rs`, `image_use_cases.rs` | síntesis/generación |
| Prompt demo | `backend/mod_flashcards/src/landing_demo_image_prompt.rs` | prompts de imagen del demo |
| Batch | `backend/mod_flashcards/src/batch/` | generación batch de media |
| Registro rutas | `backend/api_main/src/modules/flashcards.rs` | los 17 endpoints del módulo |
| Handlers decks | `backend/api_main/src/api/endpoints/decks.rs` | catálogo, progreso, stats |
| Handlers media | `backend/api_main/src/api/endpoints/generation.rs` | resolve/generate/upload/delete |
| Frontend módulo | `client/src/modules/flashcards/` | manifiesto (`index.jsx`), `FlashcardPage.jsx` (orquestador), `composition.js`, `ports/`, `adapters/`, `useCases/`, `context/`, `features/` |
| Kit compartido UI | `client/src/components/flashcardStudy/` | la tarjeta compartida con el demo de landing — **leer `client/CLAUDE.md` §4 antes de tocarla** |
| Contenido | `json/<par>/<categoría>/<nivel>/*.json` | decks (sincronizados a Oracle) |
| Media | `card_audio/`, `card_images/` | audio .ogg e imágenes .avif por categoría |

## Plano del módulo (diagrama)

```mermaid
flowchart LR
    subgraph Frontend
        FP[FlashcardPage.jsx<br/>orquestador] --> UC[useCases/<br/>deckUseCases, deckSessionUseCases]
        UC --> P[ports/<br/>flashcardPort · audioPort · imagePort]
        P --> A[adapters/*HttpAdapter.js]
        A --> HC[httpClient.js<br/>JWT Bearer]
    end
    HC -->|/api/*| R[modules/flashcards.rs<br/>registro de rutas]
    subgraph Backend
        R --> H1[endpoints/decks.rs]
        R --> H2[endpoints/generation.rs]
        H1 --> DU[DeckUseCases<br/>mod_flashcards/lib.rs]
        H2 --> AU[audio_use_cases.rs]
        H2 --> IU[image_use_cases.rs]
        DU --> DB[(SurrealDB<br/>card_progress)]
        DU --> FS[/json/ decks en disco/]
        AU & IU --> MEDIA[/card_audio · card_images/]
    end
```

## Contratos / endpoints

Registrados en `backend/api_main/src/modules/flashcards.rs`; DTOs en
`api_main/src/api/endpoints/decks.rs` y `api_main/src/api/dto/generation.rs`. Todos con JWT.
Convención: `course_direction` (`es_en` default | `en_es`…) es query/campo opcional en casi todos.

### Catálogo y progreso (`decks.rs`)

| Método | Ruta | Entrada exacta | Devuelve |
|---|---|---|---|
| GET | `/api/categories` | query: `course_direction`, `include_counts` (default true) | categorías con conteos |
| GET | `/api/available-flashcards-files` | query: `course_direction`, `category` | decks de la categoría |
| GET | `/api/flashcards-data` | query: `user_id`, `category`, `deck`, `course_direction` | tarjetas del deck + progreso del usuario |
| POST | `/api/update-status` | `{user_id, category, deck, index, learned, course_direction?}` | progreso de 1 tarjeta |
| POST | `/api/update-batch` | `{user_id, category, deck, course_direction?, cards: [CardUpdateItem]}` | progreso en lote |
| POST | `/api/reset-all` | `{user_id, category, deck, course_direction?, scope?, confirm}` | reset de progreso |
| GET | `/api/srs/due` | query: `course_direction`, `limit` (default 5000) | tarjetas SRS pendientes |
| GET | `/api/learning-stats` | query: `course_direction` | estadísticas de aprendizaje |
| GET | `/api/phonics-data` | — | datos de fonética |
| POST | `/api/study/touch` | — (usuario del JWT) | registra día de estudio (racha) |

### Media (`generation.rs` — dto/generation.rs)

| Método | Ruta | Entrada exacta | Devuelve |
|---|---|---|---|
| POST | `/api/resolve-audio` | `SynthesizeSpeechBody` (ver abajo) | URL `?v=` si el audio EXISTE; 404 si no — **nunca genera** |
| POST | `/api/synthesize-speech` | `SynthesizeSpeechBody` | `{audio_url, voice_name, from_cache}` — genera si falta (premium/admin) |
| POST | `/api/resolve-image` | `{category, deck, index, def_index, course_direction?, form?}` | URL `?v=` si existe; 404 si no — **nunca genera** |
| POST | `/api/generate-image` | `GenerateImageBody`: lo de resolve + `{prompt, meaning?, usage_example?, usage_context?, alternative_example?, force_generation?, form?, legacy_image_path?, prompt_engine?, scene_complement?}` | `{path}` — pipeline Qwen→ComfyUI (premium/admin) |
| POST | `/api/upload-image` | multipart (ver `UploadImageRequest` en `mod_flashcards/src/image_use_cases.rs`) | sube imagen manual |
| DELETE | `/api/delete-image` | `{category, deck, index, def_index, course_direction?, form?}` | borra imagen |
| POST | `/api/delete-audio` | `DeleteAudioBody` (como Synthesize sin force) | borra audio |

`SynthesizeSpeechBody`: `{category, deck, text, voice_name, verb_name?, tone?, lang?, course_direction?, exclude_voice?, force_regenerate?}`.

### Invariantes (no romper)

- **`resolve-*` jamás genera media** — un 404 en resolve termina la anticipación/precarga (regla de `AI_OPERATIONS_CONTEXT.md`).
- **`update-batch` es UNA transacción SurrealDB** (`BEGIN…COMMIT`), no N peticiones — no descomponerla.
- Las URLs de media devuelven query `?v=<mtime>-<tamaño>`: la identidad cambia al sobrescribir el archivo; no cachear sin la query.
- Las imágenes web/responsive nuevas usan **768×512 (3:2) AVIF** en generación individual,
  batch y subida manual. Los assets 896×512 existentes siguen siendo compatibles y no se
  regeneran ni eliminan automáticamente.
- Generación/borrado exigen rol `premium`/`admin` (hoy validado en frontend — deuda #2 de `client/CLAUDE.md` §9).
- `category='landing-demo'` enruta a otro proveedor TTS (ElevenLabs) — contrato con el módulo landing.
- **Piel de la app (jul 2026)**: la zona de estudio usa los tokens de profundidad de
  `client/src/styles/app-brand.css` — lienzo `--brand-canvas` (#0b1120), tarjeta sólida
  `--brand-surface-card` (#1b2438) con borde hairline `--brand-border-subtle`. Iconos de
  acción neutros en reposo (`--brand-icon-idle`) que pasan a rosa de marca al interactuar;
  el verde queda reservado al check de "aprendida" y el demo de landing conserva su piel
  propia (`--lp-demo-*`). Todo override de color de la app va con ámbito
  `[data-variant='app']` para no tocar el demo. Iconografía: familia única Lucide
  (`react-icons/lu`) con trazo `--brand-icon-stroke: 2`; Feather (`fi`) solo donde el kit
  se comparte con el demo; Font Awesome prohibido (regla completa en `client/CLAUDE.md` §6).
- En la app autenticada, el layout responsive (`max-width: 768px`, incluida la PWA) mantiene
  15 px de separación lateral compartida para la tarjeta y la barra de controles; el demo de
  landing conserva su geometría independiente. Los controles de navegación y el botón SRS
  miden 48 × 48 px en ese layout. Las filas de ejemplos usan `gap: 5px` y `padding: 3px`
  tanto en tarjetas estándar como de conjugación. En estas últimas, la imagen deja de imponer
  una relación de aspecto fija y ocupa el espacio vertical libre. La imagen principal usa
  `object-fit: contain` para mostrarse completa y una copia decorativa desenfocada cubre el
  espacio sobrante sin deformar ni recortar el contenido relevante. La tarjeta conserva el
  cálculo por espacio disponible, con `--fc-card-max-height: 560px` como tope móvil/PWA para
  evitar que se estire en pantallas altas y mantener cerca la barra y el footer; la separación
  entre tarjeta y barra de controles es de 20 px y la palabra principal usa `1.7rem`
  (jerarquía: la palabra manda sobre los ejemplos de `1.5rem`; en escritorio usa
  `clamp(1.6rem, 5vw, 2.25rem)` y la fonética baja a `clamp(1.05rem, 2.6vw, 1.15rem)`
  con mono moderno del sistema — solo variante app, el demo conserva sus valores). El botón
  SRS/calendario mantiene el círculo visual oculto hasta hover o focus. El footer absorbe el
  remanente inferior del shell móvil para no dejar una franja oscura al final, pero se oculta
  mientras está abierta la confirmación de nivel para no bloquear sus acciones. En móvil, el
  menú de cuenta expone el selector del idioma de interfaz; el aviso instalable PWA es no modal
  y solo sus botones capturan eventos, por lo que no puede bloquear tarjetas del catálogo.
- **Sesión PWA instalada**: bajo `display-mode: standalone` y hasta 768 px, el frente de la
  tarjeta adopta una composición inmersiva exclusiva: en conjugaciones, la imagen principal
  empieza en el final calculado de la barra verbal (`58px + 48px + safe-area`) y se alinea arriba,
  mientras los controles administrativos de imagen conservan 20 px de separación respecto a esa
  barra y el acceso SRS/calendario suma 10 px a su desplazamiento vertical para no pegarse a ella;
  sin hueco interno de `object-fit`, una copia desenfocada se prolonga detrás de la cabecera; la
  palabra/fonética/frases se superponen sobre un degradado inferior que concentra su oscuridad
  desde el 60% y alcanza su tramo fuerte al 84%, dejando visible una mayor parte de la foto. La barra de acciones se
  monta sobre el pie del hero y cada cambio real de tarjeta conserva el gesto horizontal con
  una transición de entrada, sin renderizar carrusel ni indicadores. Debajo se reserva la
  sección `Continuar estudiando` con recomendaciones reales de `/api/learning-stats` (imagen,
  categoría, nivel y deck) navegables dentro de la sesión. Sus tarjetas PWA usan composición
  cinematográfica: imagen a sangre completa, degradado de contraste, metadatos en cristal y título
  superpuesto. Debajo permanece un dock fijo con accesos a
  `Dashboard`, `Study language` (selector inglés/español) y
  `Categories`, deliberadamente sin buscador. El dock vive en el componente compartido
  `components/pwa/PwaBottomDock.jsx` y replica el cristal cinematográfico del
  header, con opacidad reforzada para conservar contraste sobre las recomendaciones. La vista web responsive,
  el demo de landing y los flujos de carga/finalización conservan su composición anterior.
  La cabecera visual PWA vive en `components/flashcardStudy/features/PwaCardHeader.jsx` y muestra
  el isotipo blanco centrado; reemplaza dentro de esta sesión al header compartido, por lo que no
  aparecen hamburguesa, nombre `Fluency`, avatar ni segundo menú.
  En tarjetas de verbos irregulares, `ConjugationTable` se presenta como una cápsula de cristal
  única con v1/v2/v3 visibles; las frases PWA aumentan de tamaño y tanto la barra de acciones
  como el dock inferior usan superficies translúcidas con botones de contraste independiente.
  El isotipo queda libre de contenedor visual y la cápsula irregular comparte la franja superior,
  a su derecha. Los controles siguen el patrón de acciones flotantes tipo Tinder: no existe una
  cápsula exterior y cada acción tiene su propio círculo, contraste y jerarquía táctil.
  La navegación anterior/siguiente no se renderiza visualmente en PWA: el cambio se hace con
  swipe. `PwaStudyControls.jsx` concentra únicamente reinicio, progreso y aprendida con Lucide;
  el control web compartido permanece intacto. `PwaConjugationNav.jsx` y su CSS aíslan por
  completo V1/V2/V3 de `ConjugationTable`: ocupan una segunda fila dentro del mismo header
  difuminado, como navegación por pestañas de una app de streaming, sin cápsulas y con subrayado
  activo; muestran solo la forma verbal en mayúsculas, sin pronunciación. La transparencia
  base se controla con `--pwa-header-glass-opacity` en `PwaCardHeader.module.css`; el cristal
  oscurece progresivamente los laterales y deja el centro más transparente sin desplazar la imagen.
  Cuando la tarjeta no tiene conjugación, la cabecera se reduce a 64 px y la imagen comienza
  a 58 px; palabra, frases y acciones suben los 48 px que ocuparía V1/V2/V3, sin dejar hueco.
  Las frases de ejemplo PWA flotan sin franja de fondo, separadas 8 px; su audio usa el mismo
  círculo oscuro translúcido del reproductor de la palabra. El hero ocupa hasta 80svh para que
  dos ejemplos conserven aire antes de `Continuar estudiando`. `DefinitionList` publica
  `data-count` y el título se posiciona según haya una o dos frases, siempre inmediatamente encima;
  el bloque completo termina a 8 px de la barra flotante para aprovechar el hero sin dejar un vacío;
  palabra, frases y acciones comparten un desplazamiento vertical para conservar esa relación.
  El contenedor que realiza el giro PWA conserva `overflow: visible`; el recorte pertenece a cada
  cara para no aplanar `preserve-3d` ni ocultar el reverso en WebKit/Chrome instalados.
  El reverso PWA reutiliza la imagen y deja únicamente el isotipo en una cabecera corta, sin
  V1/V2/V3, controles de estudio, sección `Continuar estudiando` ni dock inferior. Cada definición
  se presenta como bloque de cristal desplazable con contraste reforzado y tipografía móvil mayor;
  el reverso web conserva su composición tradicional. La visibilidad de la foto y del cristal se
  ajusta con `--pwa-back-image-opacity` y `--pwa-back-glass-opacity` en `CardBack.module.css`.

## Flags y activación

- Cargo feature: `flashcards` (default). Build aislado: `cargo build -p api_main --no-default-features --features auth,flashcards`.
- Vite: `VITE_ENABLE_FLASHCARDS` (opt-out), `VITE_DEFAULT_MODULE=flashcards`. Ruta `/flashcard` (o `/` sin landing).
- Sparse: `./scripts/sparse-module.sh flashcards`.

## Dependencias con otros módulos

- **shell-auth** ([`shell-auth.md`](shell-auth.md)): JWT, `AuthContext`, httpClient.
- **Kit `flashcardStudy`** (shell, no módulo): compartido con el demo de `landing` — un cambio en la tarjeta afecta a ambos.
- **media-generation** ([`media-generation.md`](media-generation.md)): pipeline de generación de audio/imágenes.
- `dashboard` y `landing` consumen contratos compartidos en `client/src/contracts/` (`courseDirection.js`, `landingDemoNamespace.js`) — no imports directos entre módulos.

## Datos

SurrealDB: `card_progress` (índice `idx_card_progress_user` sobre `user_id`), días de estudio/racha.
Ver [`database_schema_diagram.md`](../../database_schema_diagram.md). Los decks NO viven en la DB:
viven en `json/` (disco de Oracle en prod).

## Cómo probar

```bash
./scripts/sparse-module.sh flashcards      # aislar el módulo
./start.sh                                 # stack local completo
curl -X POST http://127.0.0.1:5173/api/auth/dev-guest   # login sin OAuth
# UI: http://localhost:5173/flashcard
cd client && npm test                      # incluye test-deck-use-cases y test-deck-session-use-cases
# Desde la raíz: matriz local completa (requiere ./start.sh activo)
./scripts/test-local-preprod.sh --full
```

Cambios visuales en la tarjeta: arnés pixel-diff obligatorio (`client/CLAUDE.md` §8).

El gate `--quick` no requiere servicios. `--full` añade smoke HTTP, SurrealDB 1.5.5 real y E2E
en escritorio/móvil/WebKit; `--all` agrega una carga k6 corta limitada por código a localhost.

### Matriz cubierta por el gate local

| Capa | Cobertura automatizada |
|---|---|
| Dominio JS | rutas, contratos, catálogo, sesión, SRS (1.000 propiedades), cachés de audio/imagen y armado del mazo SRS |
| Componentes | tarjeta/dorso, controles y teclado, imagen (carga/error/timeout), idioma, viewport y puente UI |
| Servicios frontend | todos los métodos de los adaptadores de flashcards, audio, imagen y SRS; fallback estático, IndexedDB y compresión HEIC/canvas/WASM→AVIF |
| Backend Rust | unitarias existentes, mocks de puertos, propiedades de racha y validación SRS, handler Axum y snapshot de features |
| API + DB local | catálogo, mazo, progreso individual y lote transaccional, SRS, reset, estadísticas, racha, fonética, resolución y descarga de media |
| E2E | sesión dev-guest; cambio español/inglés y dirección de estudio; dashboard; catálogo, ayuda, niveles, varias categorías y orden persistido; reset cancelar/confirmar; navegación por botones y gestos; giro frente/dorso; audio; checks múltiples; final de nivel y de ruta; aislamiento de progreso entre dos usuarios, en Chrome, Pixel 7 y WebKit/iPhone |
| Carga | k6 sobre catálogo, decks, mazo, estadísticas y escrituras de progreso; restaura el progreso al terminar |

Los E2E permiten resolver y descargar media existente, pero interceptan generación, subida y
borrado. Esos proveedores se validan con adaptadores/mocks para no consumir Gemini/ElevenLabs ni
mutar `card_audio/`, `card_images/` o `img/`. Durante toda la integración, el runner crea
`.local-preprod-media.lock`: el backend debe responder `423 Locked` a una mutación inocua antes de
comenzar. Además compara un inventario SHA-256 de **todos** los archivos de esas tres rutas,
incluidos los ignorados y no versionados. Si detecta una diferencia, falla y no intenta limpiar ni
borrar el archivo afectado: la recuperación siempre es manual y explícita.
