from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent
OUTPUT_FILE = BASE_DIR / "verbs" / "verbs_relationship.html"


HTML_TEMPLATE = """<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Relacion de Verbos</title>
  <style>
    :root {{
      --bg: #f5f1e8;
      --paper: #fffdf7;
      --ink: #1f2937;
      --muted: #6b7280;
      --line: #d6d3c8;
      --accent: #0f766e;
      --accent-soft: #ccfbf1;
      --basic: #2563eb;
      --intermediate: #d97706;
      --advanced: #7c3aed;
      --shadow: 0 12px 30px rgba(31, 41, 55, 0.08);
    }}

    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      font-family: Georgia, "Times New Roman", serif;
      color: var(--ink);
      background:
        radial-gradient(circle at top left, rgba(15, 118, 110, 0.12), transparent 30%),
        linear-gradient(180deg, #f8f5ef 0%, #f1ebdf 100%);
    }}

    .wrap {{
      width: min(1200px, calc(100% - 32px));
      margin: 0 auto;
      padding: 32px 0 48px;
    }}

    .hero {{
      background: var(--paper);
      border: 1px solid var(--line);
      border-radius: 24px;
      padding: 28px;
      box-shadow: var(--shadow);
      margin-bottom: 24px;
    }}

    .eyebrow {{
      font-size: 12px;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: var(--accent);
      margin-bottom: 10px;
    }}

    h1 {{
      margin: 0 0 10px;
      font-size: clamp(32px, 5vw, 54px);
      line-height: 0.95;
    }}

    .hero p {{
      margin: 0;
      max-width: 720px;
      color: var(--muted);
      font-size: 17px;
      line-height: 1.5;
    }}

    .stats {{
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 12px;
      margin-top: 24px;
    }}

    .stat {{
      background: #faf7ef;
      border: 1px solid var(--line);
      border-radius: 16px;
      padding: 14px 16px;
    }}

    .stat strong {{
      display: block;
      font-size: 28px;
      line-height: 1;
      margin-bottom: 6px;
    }}

    .controls {{
      display: grid;
      grid-template-columns: 2fr 1fr 1fr 1fr;
      gap: 12px;
      margin-bottom: 18px;
    }}

    input, select {{
      width: 100%;
      padding: 14px 16px;
      border-radius: 14px;
      border: 1px solid var(--line);
      background: var(--paper);
      color: var(--ink);
      font: inherit;
      box-shadow: var(--shadow);
    }}

    .legend {{
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-bottom: 24px;
    }}

    .pill {{
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      border-radius: 999px;
      border: 1px solid var(--line);
      background: var(--paper);
      font-size: 14px;
    }}

    .dot {{
      width: 10px;
      height: 10px;
      border-radius: 50%;
      display: inline-block;
    }}

    .dot.basic {{ background: var(--basic); }}
    .dot.intermediate {{ background: var(--intermediate); }}
    .dot.advanced {{ background: var(--advanced); }}

    .themes {{
      display: grid;
      gap: 24px;
    }}

    .theme {{
      background: rgba(255, 253, 247, 0.86);
      border: 1px solid var(--line);
      border-radius: 22px;
      overflow: hidden;
      box-shadow: var(--shadow);
    }}

    .theme-head {{
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: center;
      padding: 18px 20px;
      background: linear-gradient(135deg, rgba(15, 118, 110, 0.10), rgba(255,255,255,0.75));
      border-bottom: 1px solid var(--line);
    }}

    .theme-head h2 {{
      margin: 0;
      font-size: 28px;
      text-transform: capitalize;
    }}

    .theme-meta {{
      color: var(--muted);
      font-size: 14px;
    }}

    .level-groups {{
      display: grid;
      gap: 18px;
      padding: 18px;
    }}

    .level-group {{
      border: 1px solid var(--line);
      border-radius: 18px;
      background: rgba(255, 255, 255, 0.55);
      overflow: hidden;
    }}

    .level-head {{
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 14px 16px;
      border-bottom: 1px solid var(--line);
      background: #fcfaf4;
    }}

    .level-title {{
      display: inline-flex;
      align-items: center;
      gap: 10px;
      font-size: 16px;
      font-weight: 700;
    }}

    .level-count {{
      color: var(--muted);
      font-size: 13px;
    }}

    .swatch {{
      width: 12px;
      height: 12px;
      border-radius: 999px;
      display: inline-block;
    }}

    .swatch[data-level="1-basic"] {{ background: var(--basic); }}
    .swatch[data-level="2-intermediate"] {{ background: var(--intermediate); }}
    .swatch[data-level="3-advanced"] {{ background: var(--advanced); }}

    .cards {{
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 14px;
      padding: 16px;
    }}

    .card {{
      background: var(--paper);
      border: 1px solid var(--line);
      border-radius: 18px;
      padding: 16px;
    }}

    .card-top {{
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: start;
      margin-bottom: 10px;
    }}

    .word {{
      margin: 0;
      font-size: 24px;
      line-height: 1;
    }}

    .badge {{
      flex: 0 0 auto;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.04em;
      padding: 6px 10px;
      border-radius: 999px;
      color: white;
    }}

    .badge[data-level="1-basic"] {{ background: var(--basic); }}
    .badge[data-level="2-intermediate"] {{ background: var(--intermediate); }}
    .badge[data-level="3-advanced"] {{ background: var(--advanced); }}

    .essential-chip {{
      display: inline-block;
      margin: 0 0 10px;
      padding: 4px 9px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.04em;
      background: #dcfce7;
      color: #166534;
      border: 1px solid #86efac;
    }}

    .meaning {{
      margin: 0 0 10px;
      color: var(--ink);
      line-height: 1.45;
    }}

    .meta {{
      font-size: 13px;
      color: var(--muted);
      line-height: 1.5;
    }}

    .empty {{
      padding: 28px;
      text-align: center;
      color: var(--muted);
      border: 1px dashed var(--line);
      border-radius: 18px;
      background: rgba(255, 253, 247, 0.75);
    }}

    @media (max-width: 820px) {{
      .controls {{
        grid-template-columns: 1fr;
      }}
    }}
  </style>
</head>
<body>
  <div class="wrap">
    <section class="hero">
      <div class="eyebrow">Mapa Pedagogico</div>
      <h1>Relacion semantica de verbos</h1>
      <p>Vista agrupada por tema para estudiar asociaciones mentales entre verbos, manteniendo el nivel sugerido y el significado principal de cada palabra.</p>
      <div class="stats" id="stats"></div>
    </section>

    <section class="controls">
      <input id="search" type="search" placeholder="Buscar palabra, meaning o grupo original">
      <select id="levelFilter">
        <option value="">Todos los niveles</option>
      </select>
      <select id="themeFilter">
        <option value="">Todos los temas</option>
      </select>
      <select id="essentialFilter">
        <option value="">Esenciales y no esenciales</option>
        <option value="true">Solo esenciales</option>
        <option value="false">Solo no esenciales</option>
      </select>
    </section>

    <section class="legend">
      <span class="pill"><span class="dot basic"></span> 1-basic</span>
      <span class="pill"><span class="dot intermediate"></span> 2-intermediate</span>
      <span class="pill"><span class="dot advanced"></span> 3-advanced</span>
    </section>

    <section class="hero" style="padding:18px 20px; margin-bottom: 24px;">
      <p id="status" style="margin:0 0 12px; color: var(--muted);">Cargando clasificacion...</p>
      <input id="fileInput" type="file" accept=".json,application/json">
    </section>

    <section id="themes" class="themes"></section>
  </div>

  <script>
    let data = [];

    const state = {{
      search: "",
      level: "",
      theme: "",
      essential: "",
    }};

    const statsEl = document.getElementById("stats");
    const themesEl = document.getElementById("themes");
    const searchEl = document.getElementById("search");
    const levelFilterEl = document.getElementById("levelFilter");
    const themeFilterEl = document.getElementById("themeFilter");
    const essentialFilterEl = document.getElementById("essentialFilter");
    const statusEl = document.getElementById("status");
    const fileInputEl = document.getElementById("fileInput");

    function setStatus(text) {{
      statusEl.textContent = text;
    }}

    function escapeHtml(value) {{
      return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
    }}

    function grouped(entries) {{
      const groups = new Map();
      for (const item of entries) {{
        if (!groups.has(item.suggested_theme)) groups.set(item.suggested_theme, []);
        groups.get(item.suggested_theme).push(item);
      }}
      return [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
    }}

    function fillFilters() {{
      levelFilterEl.innerHTML = '<option value="">Todos los niveles</option>';
      themeFilterEl.innerHTML = '<option value="">Todos los temas</option>';

      const levels = [...new Set(data.map(item => item.suggested_level))];
      const themes = [...new Set(data.map(item => item.suggested_theme))].sort();

      levels.forEach(level => {{
        const option = document.createElement("option");
        option.value = level;
        option.textContent = level;
        levelFilterEl.appendChild(option);
      }});

      themes.forEach(theme => {{
        const option = document.createElement("option");
        option.value = theme;
        option.textContent = theme;
        themeFilterEl.appendChild(option);
      }});
    }}

    function renderStats(entries) {{
      const total = entries.length;
      const themesCount = new Set(entries.map(item => item.suggested_theme)).size;
      const low = entries.filter(item => item.confidence === "low").length;
      const relevel = entries.filter(item => item.original_level !== item.suggested_level).length;
      const essentials = entries.filter(item => item.is_essential).length;

      statsEl.innerHTML = `
        <div class="stat"><strong>${{total}}</strong><span>verbos visibles</span></div>
        <div class="stat"><strong>${{themesCount}}</strong><span>temas activos</span></div>
        <div class="stat"><strong>${{relevel}}</strong><span>reubicados de nivel</span></div>
        <div class="stat"><strong>${{essentials}}</strong><span>marcados esenciales</span></div>
        <div class="stat"><strong>${{low}}</strong><span>casos de baja confianza</span></div>
      `;
    }}

    function levelOrder(level) {{
      return ["1-basic", "2-intermediate", "3-advanced"].indexOf(level);
    }}

    function nearestLevelTarget(level, candidates) {{
      const current = levelOrder(level);
      return [...candidates]
        .sort((a, b) => {{
          const distanceA = Math.abs(levelOrder(a) - current);
          const distanceB = Math.abs(levelOrder(b) - current);
          if (distanceA !== distanceB) return distanceA - distanceB;
          return levelOrder(a) - levelOrder(b);
        }})[0];
    }}

    function buildDisplayGroups(items) {{
      const groupedByLevel = new Map();

      for (const item of items) {{
        if (!groupedByLevel.has(item.suggested_level)) groupedByLevel.set(item.suggested_level, []);
        groupedByLevel.get(item.suggested_level).push(item);
      }}

      const levels = [...groupedByLevel.keys()].sort((a, b) => levelOrder(a) - levelOrder(b));
      const stableLevels = levels.filter(level => groupedByLevel.get(level).length >= 2);

      if (!stableLevels.length || stableLevels.length === levels.length) {{
        return levels.map(level => ({{
          displayLevel: level,
          items: groupedByLevel.get(level),
        }}));
      }}

      for (const level of levels) {{
        const levelItems = groupedByLevel.get(level);
        if (levelItems.length >= 2) continue;

        const targetLevel = nearestLevelTarget(level, stableLevels);
        groupedByLevel.set(
          targetLevel,
          groupedByLevel.get(targetLevel).concat(levelItems),
        );
        groupedByLevel.delete(level);
      }}

      return [...groupedByLevel.entries()]
        .sort((a, b) => levelOrder(a[0]) - levelOrder(b[0]))
        .map(([displayLevel, levelItems]) => ({{
          displayLevel,
          items: levelItems.sort((a, b) => a.name.localeCompare(b.name)),
        }}));
    }}

    function renderThemes(entries) {{
      const groups = grouped(entries);
      if (!groups.length) {{
        themesEl.innerHTML = '<div class="empty">No hay resultados con esos filtros.</div>';
        return;
      }}

      themesEl.innerHTML = groups.map(([theme, items]) => `
        <article class="theme">
          <header class="theme-head">
            <div>
              <h2>${{escapeHtml(theme.replaceAll("_", " "))}}</h2>
              <div class="theme-meta">Categoria semantica · ${{items.length}} palabras relacionadas</div>
            </div>
          </header>
          <div class="level-groups">
            ${{
              buildDisplayGroups(items)
                .map(group => {{
                  const level = group.displayLevel;
                  const levelItems = group.items;
                  return `
                    <section class="level-group">
                      <div class="level-head">
                        <div class="level-title">
                          <span class="swatch" data-level="${{escapeHtml(level)}}"></span>
                          <span>${{escapeHtml(level)}}</span>
                        </div>
                        <div class="level-count">${{levelItems.length}} palabras</div>
                      </div>
                      <div class="cards">
                        ${{
                          levelItems
                            .map(item => `
                              <section class="card">
                                <div class="card-top">
                                  <h3 class="word">${{escapeHtml(item.name)}}</h3>
                                  <span class="badge" data-level="${{escapeHtml(item.suggested_level)}}">${{escapeHtml(item.suggested_level)}}</span>
                                </div>
                                ${{item.is_essential ? '<div class="essential-chip">ESENCIAL</div>' : ''}}
                                <p class="meaning">${{escapeHtml(item.main_meaning)}}</p>
                                <div class="meta">Registro: ${{item.registro}}</div>
                                <div class="meta">Grupo original: ${{escapeHtml(item.original_group_name)}}</div>
                                <div class="meta">Nivel original: ${{escapeHtml(item.original_level)}}</div>
                                <div class="meta">Esencial: ${{item.is_essential ? 'true' : 'false'}}</div>
                                <div class="meta">Confianza: ${{escapeHtml(item.confidence)}}</div>
                              </section>
                            `)
                            .join("")
                        }}
                      </div>
                    </section>
                  `;
                }})
                .join("")
            }}
          </div>
        </article>
      `).join("");
    }}

    function filteredData() {{
      const query = state.search.trim().toLowerCase();
      return data.filter(item => {{
        const haystack = [
          item.name,
          item.main_meaning,
          item.original_group_name,
          item.suggested_theme,
          item.suggested_level,
        ].join(" ").toLowerCase();

        if (state.level && item.suggested_level !== state.level) return false;
        if (state.theme && item.suggested_theme !== state.theme) return false;
        if (state.essential === "true" && !item.is_essential) return false;
        if (state.essential === "false" && item.is_essential) return false;
        if (query && !haystack.includes(query)) return false;
        return true;
      }});
    }}

    function render() {{
      const entries = filteredData();
      renderStats(entries);
      renderThemes(entries);
    }}

    async function loadFromUrl() {{
      const response = await fetch("./verbs_semantic_classification.json", {{ cache: "no-store" }});
      if (!response.ok) {{
        throw new Error(`HTTP ${{response.status}}`);
      }}
      return response.json();
    }}

    async function loadFromFile(file) {{
      const text = await file.text();
      return JSON.parse(text);
    }}

    function applyData(nextData, sourceLabel) {{
      data = Array.isArray(nextData) ? nextData : [];
      fillFilters();
      render();
      setStatus(`Fuente: ${{sourceLabel}}. Entradas: ${{data.length}}.`);
    }}

    searchEl.addEventListener("input", event => {{
      state.search = event.target.value;
      render();
    }});

    levelFilterEl.addEventListener("change", event => {{
      state.level = event.target.value;
      render();
    }});

    themeFilterEl.addEventListener("change", event => {{
      state.theme = event.target.value;
      render();
    }});

    essentialFilterEl.addEventListener("change", event => {{
      state.essential = event.target.value;
      render();
    }});

    fileInputEl.addEventListener("change", async event => {{
      const file = event.target.files?.[0];
      if (!file) return;

      try {{
        const parsed = await loadFromFile(file);
        applyData(parsed, file.name);
      }} catch (error) {{
        setStatus(`No se pudo leer el JSON seleccionado: ${{error.message}}`);
      }}
    }});

    (async () => {{
      try {{
        const parsed = await loadFromUrl();
        applyData(parsed, "verbs_semantic_classification.json");
      }} catch (error) {{
        setStatus("No se pudo cargar automaticamente el JSON. Si abriste el HTML directo, usa el selector de archivo o sirvelo desde un servidor local.");
        renderStats([]);
        renderThemes([]);
      }}
    }})();
  </script>
</body>
</html>
"""


def main():
    html = HTML_TEMPLATE.replace("{{", "{").replace("}}", "}")
    OUTPUT_FILE.write_text(html, encoding="utf-8")
    print(f"Guardado en: {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
