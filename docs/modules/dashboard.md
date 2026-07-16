# Módulo `dashboard` — Shell de app autenticada + home

## Propósito

Doble rol: (1) **home post-login** en `/dashboard` (hub con tarjetas de acceso a módulos, stats,
recomendaciones) y (2) **appShell de toda la app autenticada** — aporta `DashboardShell` (sidebar,
header, footer, menú flotante) dentro del cual se renderizan los demás módulos.

## Estado y roadmap

- Estado: **activo** (opt-out; default on).
- Si el módulo no está en disco o está desactivado, la app cae a `MinimalAppShell` y el home
  post-login pasa al módulo default — nada debe romperse.

## Mapa de archivos

| Capa | Ruta | Qué contiene |
|---|---|---|
| Manifiesto | `client/src/modules/dashboard/index.jsx` | ruta `/dashboard`, nav "Panel", `appShell: DashboardShell` |
| Shell de app | `client/src/modules/dashboard/DashboardShell.jsx` | layout con `<Outlet/>` (árbol estable, sin remount) |
| Home | `client/src/modules/dashboard/DashboardHome.jsx` + `.css` | hub post-login |
| Layout | `client/src/modules/dashboard/layout/` | Sidebar, Header, Footer, FloatingMenu (sidebar 256px + offset 260px deliberado) |
| Datos | `client/src/modules/dashboard/ports/`, `adapters/`, `useCases/` (`dashboardProgress.js`), `features/` | stats y recomendaciones |
| Routing shell | `client/src/App.jsx`, `client/src/components/routing/SafeRedirect.jsx`, `client/src/components/shell/` | rutas bare vs app, fallbacks |

## Contratos / endpoints

Sin endpoints propios. Consume stats de flashcards (`/api/learning-stats`) y sesión del shell
vía puertos (`ports/` del módulo) — nunca importando internals de otros módulos.

## Flags y activación

- Cargo feature: — (solo frontend).
- Vite: `VITE_ENABLE_DASHBOARD` (**opt-out**, default on) → `/dashboard` tras login (`getAuthenticatedHomePath()`).
- Sparse: `./scripts/sparse-module.sh dashboard`.

## Dependencias con otros módulos

- **shell-auth** ([`shell-auth.md`](shell-auth.md)): sesión y layout base.
- Contrato `client/src/contracts/courseDirection.js` compartido con flashcards (el import directo dashboard→flashcards se eliminó en jul 2026 — no reintroducirlo).

## Datos

Ninguna colección propia; lee progreso/stats vía API de flashcards.

## Cómo probar

```bash
./scripts/sparse-module.sh dashboard
cd client && npm run dev
curl -X POST http://127.0.0.1:5173/api/auth/dev-guest   # login dev
# UI: http://localhost:5173/dashboard
npm run test:routing    # login → /dashboard y fallbacks sin dashboard
```
