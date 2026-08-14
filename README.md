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

VERIFIED (`src/private402/serve.ts`): The server checks the RPC chain ID. It then composes the STRK20 history reader, Starknet account signature checks, SQLite replay storage, persistent invoices, and the paid SHA-256 route.

VERIFIED (`src/private402/server-config.ts` and `src/private402/rpc-finality.ts`): Sepolia and Mainnet require a successful `ACCEPTED_ON_L2` or `ACCEPTED_ON_L1` receipt. Starknet defines `ACCEPTED_ON_L2` as consensus-final and `ACCEPTED_ON_L1` as included in an L1 state update: https://docs.starknet.io/learn/protocol/transactions

VERIFIED (`src/private402/server-config.ts`): The default invoice lifetime is 900 seconds. Set `STK402_INVOICE_TIMEOUT_SECONDS` to a positive integer when production proof latency needs more time.

VERIFIED (`src/private402/signed-receipt.ts` and `src/private402/agent-payer.ts`): Each receipt binds the absolute invoice expiry. For new payments, the payer checks the remaining lifetime before proving and again before submission. The payer also enforces a configured clock-skew limit.

VERIFIED (local smoke command on 2026-08-14): The entrypoint listened on `127.0.0.1:3402`. A request to `/tools/sha256?text=stk402` returned HTTP 402 and bound the challenge to `https://seller.example/tools/sha256?text=stk402`.

## Mainnet trust boundary

VERIFIED (`vendor/starknet-privacy/sdk/src/internal/indexer-discovery.ts`): The configured discovery service returns the transaction history fields used by receipt settlement. The RPC finality check confirms the transaction status. It does not independently prove each private note field returned by that service.

INFERRED: Mainnet deployment must use a discovery service that the operator trusts. Self-host the service for the highest confidence. A shared service adds a settlement trust assumption. The current runtime requires that service to support OHTTP.

See `deploy/README.md` for the pinned self-hosted discovery setup.

VERIFIED (`src/private402/server-config.ts`): Mainnet startup requires an HTTPS RPC URL, an HTTPS public origin, a filesystem SQLite path, and L2 finality. The server does not load a payer private key.

INFERRED: A filesystem path is durable only when the deployment stores it on a persistent volume. Mount `STK402_LEDGER_PATH` on persistent storage. An ephemeral container filesystem loses replay protection after restart.

## Run the payer

Create the local payer environment file:

```sh
cp .env.payer.example .env.payer
npm run pay:resource
```

Choose every FRI limit before the first payment. Keep `STK402_PAYER_PRIVATE_KEY` and `STK402_PAYER_VIEWING_KEY` in the local environment or a deployment secret store. The repository ignores `.env.payer`.

VERIFIED (`src/private402/payer-runtime.ts`): The payer uses OHTTP for the proving and discovery services. It requires L2 finality and stores its journal, daily STRK budget, and active payment session in SQLite.

VERIFIED (`src/private402/pay-resource.ts`): The payer rejects redirects and a challenge for another resource. It stores the challenge before payment. A retry resumes that invoice instead of requesting a new invoice.

VERIFIED (`src/private402/claim-ledger.ts`): An exact retry of one accepted invoice and transaction is idempotent. Reusing that transaction for another invoice still fails.

VERIFIED (`src/private402/invoice-store.ts` and `src/private402/paid-sha256.test.ts`): The server keeps accepted invoice requirements in SQLite. An exact paid retry still returns the SHA result after invoice expiry and a server restart.

The command keeps a completed result in SQLite and prints it again on restart. After the caller stores the result, clear that completed session:

```sh
npm run pay:ack
```

Stop all payer processes first. If an invoice expires before any payer attempt starts, clear only that unstarted session:

```sh
npm run pay:recover
```

VERIFIED (`src/private402/payment-recovery.ts`): Recovery refuses to clear a session when its invoice has a payer journal entry. Do not delete the SQLite file to bypass that check. An existing attempt needs chain reconciliation.

VERIFIED (`src/private402/payer-config.ts`): The default new-payment validity margin is 360 seconds. This exceeds the payer's 300-second L2 receipt wait.

VERIFIED: The test suite uses mocked payments for this command. A real Sepolia proof and payment has not run yet.

## Local checks

```sh
npm run typecheck
npm test
npm run test:devnet
```

VERIFIED: The Devnet integration uses `CallMockProofProvider`. A passing Devnet test does not prove production proof generation.
