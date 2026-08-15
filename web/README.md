# stk402 consumer web (React dApp)

React + Vite SPA for Ready / Xverse Wallet API payments against a stk402 Paid Resource.

Works as:

- **Web app** — open in a desktop browser, connect an extension wallet
- **Wallet dApp** — open the URL inside Ready / Xverse’s in-app browser (responsive, safe-area, installable manifest)

This Consumer path is the **primary route for grill 3B score hashes** while Agent Payer mainnet discovery/proving URLs stay unpublished. Each scored hash must settle a stk402 Invoice (not shield-only). See [`.wayfinder/tickets/score-hashes-via-browser.md`](../.wayfinder/tickets/score-hashes-via-browser.md).

## Run

```sh
cd web
npm install
npm run dev
```

From the repo root: `npm run web:dev`

Build / preview:

```sh
npm run build
npm run preview
```

## App shape

| Path | Role |
| --- | --- |
| `src/main.tsx` | React root + `BrowserRouter` |
| `src/App.tsx` | Routes (`/`, `/pay`) |
| `src/pages/PayPage.tsx` | Consumer pay screen |
| `src/components/` | Atmosphere, wallet, pay form, status, agent footer |
| `src/hooks/` | `useWalletSession`, `usePayFlow` |
| `public/manifest.webmanifest` | Installable web app metadata |

## Env

Optional `.env`:

```sh
VITE_STK402_RESOURCE_URL=https://your.host/tools/sha256?text=stk402
# Optional override; default is {demo_origin}/SKILL.md
VITE_STK402_SKILL_URL=https://your.host/SKILL.md
# Required when the Paid Resource uses exact-private-envelope-v1
VITE_STK402_ENVELOPE_PUBLIC_KEY=...
VITE_STK402_CLIENT_ENVELOPE_PRIVATE_KEY=...
VITE_STK402_CLIENT_ENVELOPE_PUBLIC_KEY=...
```

Client public key must match `STK402_AUTHORIZED_CLIENT_ENVELOPE_PUBLIC_KEY` on the server.

## Demo shape (locked)

- `demo_url` = this Consumer pay page
- Same origin `/SKILL.md` (`public/SKILL.md`) for agent CLI/MCP pay
- Paid Resource = separate always-on HTTPS URL (may be same Render project, different service or path)
- **Host:** Render for always-on Consumer + Paid Resource ([ticket](../.wayfinder/tickets/host-on-render.md))
- **Deploy:** on hold until operators say go. Tunnel OK for first public proof / wallet tests

## Status

- Connect + STRK20 capability probe: shipped
- `exact-private` transfer + Receipt sign + settle: shipped in code
- `exact-private-envelope-v1` open + seal in browser: shipped (`../src/shared/envelope-portable.ts`)
- Agent skill file on demo origin: shipped (`public/SKILL.md`)
- Live browser invoice settle (Sepolia or Mainnet): not measured yet
- Render deploy: on hold

## Stack

- React 19 + React Router 7
- Vite 8 (`@vitejs/plugin-react`)
- `starknet@10.7` (`WalletAccountV6`)
- get-starknet discovery v6
- Shared Receipt typed data + portable envelope from `../src/shared/`
