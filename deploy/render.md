# Render

Always-on host for the Consumer pay page and Paid Resource.

## Consumer (Static Site)

Root `npm install` used to fail because `file:vendor/starknet-privacy/*` needs the git submodule. Default Publish Directory `dist` was also empty because Vite writes `web/dist`.

Consumer install uses `vendor-shims/` so npm does not need the submodule. `npm run build` copies the SPA to `dist/` and `build/`.

Default Static Site commands:

| Field | Value |
| --- | --- |
| **Root Directory** | empty / repo root |
| **Install Command** | `npm install` or `npm ci --include=dev` |
| **Build Command** | `npm run build` |
| **Publish Directory** | `dist` (also copied to `build` and `web/dist`) |
| **NODE_VERSION** | `22` |

Leave these at Render defaults if they already match. Then **Manual Deploy**.

Or apply [`render.yaml`](../render.yaml) (service name `stk402-consumer`).

SPA routes (`/pay`) rewrite to `index.html`. `/SKILL.md` is a real file in `web/public`.

Optional Vite env (rebuild after change): `VITE_STK402_RESOURCE_URL`, envelope keys. See `web/README.md`.

## Paid Resource (Web Service)

Not a static site. Create a **Node** web service:

| Field | Value |
| --- | --- |
| **Install Command** | `git submodule update --init --recursive && npm ci` |
| **Build Command** | `npm run typecheck` |
| **Start Command** | `npm run serve:paid` |
| **NODE_VERSION** | `22` |

Set `STK402_HOST=0.0.0.0`. Render injects `PORT`; the server uses it.

Copy secrets from `.env.server.example`. `STK402_PUBLIC_ORIGIN` must be this service’s HTTPS origin. Mount a persistent disk at the directory used by `STK402_LEDGER_PATH`.

Do not put the recipient viewing key in the Consumer static site.
