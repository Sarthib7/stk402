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

REPORTED: Failed Static Site at https://stk402.onrender.com (`static-no-asset`).

Cause: Render runs root `npm install` on Node 22 (`.nvmrc` / dashboard). `package.json` required `node: >=24` with engine-strict → `EBADENGINE`, no publish (`static-no-asset`). Also: missing submodule `file:vendor` and Vite `web/dist` vs publish `dist`.

Fix:

- `engines.node` `>=22` + `.npmrc` `engine-strict=false`
- `vendor-shims/` so root npm install works without the submodule
- `npm run build` copies the SPA to `dist/` and `build/`
- Skip vendor compile on Render unless `STK402_BUILD_VENDOR=1`
- Paid Resource stays a Node Web Service (operator secrets + disk)
