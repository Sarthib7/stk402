# stk402 consumer web

Ready / Xverse Wallet API client for paying a stk402 Paid Resource.

## Run

```sh
cd web
npm install
npm run dev
```

Set `VITE_STK402_RESOURCE_URL` to your hosted `/tools/sha256?...` URL.

## Status

- Connect + STRK20 capability probe: shipped
- `exact-private` transfer + Receipt sign + settle: shipped in code
- `exact-private-envelope-v1` open in browser: **next feat** (current server uses envelope; Agent CLI/MCP pays today)

## Stack

- `starknet@10.7` (`WalletAccountV6`)
- get-starknet discovery v6
- Shared Receipt typed data from `../src/shared/receipt-typed-data.ts`
