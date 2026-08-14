# stk402 consumer web

Ready / Xverse Wallet API client for paying a stk402 Paid Resource.

## Run

```sh
cd web
npm install
npm run dev
```

Env (optional `.env`):

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
- Paid Resource = separate always-on HTTPS URL (tunnel first OK)

## Status

- Connect + STRK20 capability probe: shipped
- `exact-private` transfer + Receipt sign + settle: shipped
- `exact-private-envelope-v1` open + seal in browser: shipped (`../src/shared/envelope-portable.ts`)
- Agent skill file on demo origin: shipped

## Stack

- `starknet@10.7` (`WalletAccountV6`)
- get-starknet discovery v6
- Shared Receipt typed data + portable envelope from `../src/shared/`
