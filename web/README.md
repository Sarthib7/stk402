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
# Required when the Paid Resource uses exact-private-envelope-v1
VITE_STK402_ENVELOPE_PUBLIC_KEY=...
VITE_STK402_CLIENT_ENVELOPE_PRIVATE_KEY=...
VITE_STK402_CLIENT_ENVELOPE_PUBLIC_KEY=...
```

Client public key must match `STK402_AUTHORIZED_CLIENT_ENVELOPE_PUBLIC_KEY` on the server.

## Status

- Connect + STRK20 capability probe: shipped
- `exact-private` transfer + Receipt sign + settle: shipped
- `exact-private-envelope-v1` open + seal in browser: shipped (`../src/shared/envelope-portable.ts`)

## Stack

- `starknet@10.7` (`WalletAccountV6`)
- get-starknet discovery v6
- Shared Receipt typed data + portable envelope from `../src/shared/`
