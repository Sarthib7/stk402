# STK402

VERIFIED: STK402 tests private STRK20 payments as an x402 payment scheme for agents. See `src/private402/`.

## Sepolia preflight

Create the local environment file:

```sh
cp .env.sepolia.example .env.sepolia
npm run check:sepolia
```

VERIFIED: The check reads public data only. It checks the Sepolia chain ID, STRK20 pool, discovery service, and proving service version. `src/check-sepolia.ts` has no signer or transaction call.

VERIFIED: The example uses Alpha Sepolia service URLs. INFERRED: Ask the STRK20 sprint organizers before you depend on their availability because no availability policy is published.

## Paid tool slice

VERIFIED: `src/private402/paid-sha256.ts` returns a SHA-256 result after x402 settlement. `src/private402/paid-sha256.test.ts` covers the loopback HTTP `402` and paid retry.

VERIFIED: The local paid test uses synthetic evidence. It does not request a proof or submit a Starknet transaction.

## Run the paid server

Create the server environment file:

```sh
cp .env.server.example .env.server
npm run serve:paid
```

Fill every `replace_me` value before startup. Keep `STK402_RECIPIENT_VIEWING_KEY` only in the local environment or a deployment secret store. The repository ignores `.env.server`.

VERIFIED (`src/private402/serve.ts`): The server checks the RPC chain ID. It then composes the STRK20 history reader, Starknet account signature checks, SQLite replay storage, and the paid SHA-256 route.

VERIFIED (`src/private402/rpc-finality.ts`): Sepolia accepts successful `ACCEPTED_ON_L2` or `ACCEPTED_ON_L1` receipts. Mainnet accepts only successful `ACCEPTED_ON_L1` receipts. Starknet defines `ACCEPTED_ON_L2` as consensus-final and `ACCEPTED_ON_L1` as included in an L1 state update: https://docs.starknet.io/learn/protocol/transactions

VERIFIED (local smoke command on 2026-08-14): The entrypoint listened on `127.0.0.1:3402`. A request to `/tools/sha256?text=stk402` returned HTTP 402 and bound the challenge to `https://seller.example/tools/sha256?text=stk402`.

## Mainnet trust boundary

VERIFIED (`vendor/starknet-privacy/sdk/src/internal/indexer-discovery.ts`): The configured discovery service returns the transaction history fields used by receipt settlement. The RPC finality check confirms the transaction status. It does not independently prove each private note field returned by that service.

INFERRED: Mainnet deployment must use a discovery service that the operator trusts. Self-host the service for the highest confidence. A shared service adds a settlement trust assumption. The current runtime requires that service to support OHTTP.

VERIFIED (`src/private402/server-config.ts`): Mainnet startup requires an HTTPS RPC URL, an HTTPS public origin, a filesystem SQLite path, and L1 finality. The server does not load a payer private key.

INFERRED: A filesystem path is durable only when the deployment stores it on a persistent volume. Mount `STK402_LEDGER_PATH` on persistent storage. An ephemeral container filesystem loses replay protection after restart.

## Local checks

```sh
npm run typecheck
npm test
npm run test:devnet
```

VERIFIED: The Devnet integration uses `CallMockProofProvider`. A passing Devnet test does not prove production proof generation.
