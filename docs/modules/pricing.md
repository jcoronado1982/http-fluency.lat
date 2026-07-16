# Módulo `pricing` — Precios y checkout

## Propósito

Páginas públicas de planes (`/pricing`) y checkout de suscripción (`/checkout`). Es el módulo
frontend más pequeño — la receta de `client/CLAUDE.md` lo señala como plantilla para crear módulos nuevos.

## Estado y roadmap

- Estado: **activo** (UI). El cobro transaccional real está **sin desarrollar**: Postgres queda
  reservado para esa capa futura (ver [`shell-auth.md`](shell-auth.md) y
  [`../infrastructure/server_inventory.md`](../infrastructure/server_inventory.md) §Postgres).

## Mapa de archivos

| Capa | Ruta | Qué contiene |
|---|---|---|
| Frontend | `client/src/modules/pricing/` | `index.jsx` (manifiesto), `PricingPage.jsx`, `CheckoutPage.jsx` + `.css`, `translations.js` |
| Lógica | `client/src/modules/pricing/useCases/checkoutForm.js` | formateo y validación del checkout (lógica pura) |
| Puertos/adapters | `client/src/modules/pricing/ports/`, `adapters/`, `composition.js` | contrato HTTP del módulo |
| Config | `client/src/modules/pricing/config/` | navegación pública y catálogo |
| Backend | — | sin crate propio; el estado de suscripción vive en el shell (`mod_shell/src/subscription_use_cases.rs`) |

## Contratos / endpoints

Sin endpoints propios. Consume `/api/subscriptions/me` del shell (feature `subscriptions`).

## Flags y activación

- Cargo feature: — (solo frontend).
- Vite: `VITE_ENABLE_PAYMENTS` (**opt-out**) → rutas públicas `/pricing` y `/checkout` (layout `bare`).
- Sparse: `./scripts/sparse-module.sh pricing`.

## Dependencias con otros módulos

- **shell-auth** ([`shell-auth.md`](shell-auth.md)): suscripciones y sesión.
- Ninguna dependencia con módulos de estudio.

## Datos

SurrealDB: `subscription` (gestionada por el shell). Transacciones de pago: futuras, en Postgres.

## Cómo probar

```bash
./scripts/sparse-module.sh pricing
cd client && npm run dev     # http://localhost:5173/pricing y /checkout sin login
npm run build                # debe compilar con el módulo activo y desactivado
```
