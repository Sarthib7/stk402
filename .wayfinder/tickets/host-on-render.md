# Host on Render (deploy on hold)

Labels: wayfinder:grilling
Status: closed
Assignee: agent (2026-08-15)

## Question

Which always-on host for Consumer pay page + Paid Resource before the demo video?

## Resolution (2026-08-15)

**Render.**

REPORTED: User locked hosting to Render. Deployment was on hold until they said go.

- Target: always-on Consumer (`demo_url`) + Paid Resource (same or sibling Render service) + `/SKILL.md` on the demo origin.
- Tunnel remains OK for first public proof / local wallet tests before Render deploy.
- Persistent SQLite path and HTTPS public origin still required for mainnet Paid Resource startup (existing server config rules).

## Amendment (2026-08-17)

REPORTED: User asked to fix the failed Render Static Site (`/static/srv-…`).

Cause: root `npm install` requires `file:vendor/starknet-privacy` (submodule not cloned on Render). Vite emits `web/dist` while Render often publishes `dist`.

Fix:

- `vendor-shims/` so root `npm install` works without the submodule
- `npm run build` copies the SPA to `dist/` and `build/`
- Skip vendor compile on Render unless `STK402_BUILD_VENDOR=1`
- Paid Resource stays a Node Web Service (operator secrets + disk)

## Amendment (2026-08-17)

REPORTED: User asked to fix the failed Render Static Site (`/static/srv-…`).

Cause: root `npm install` / `npm run build` against this repo. Root install requires `file:vendor/starknet-privacy` (submodule). There was no Consumer-only build path.

Fix:

- [`render.yaml`](../../render.yaml) Static Site `stk402-consumer`: install/build only `web/`
- [`deploy/render.md`](../../deploy/render.md) dashboard settings for the existing service
- Root `postinstall` skips vendor when the submodule is missing
- Paid Resource stays a **Node Web Service** (operator secrets + disk). Not this static deploy.
