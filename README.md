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

## Local checks

```sh
npm run typecheck
npm test
npm run test:devnet
```

VERIFIED: The Devnet integration uses `CallMockProofProvider`. A passing Devnet test does not prove production proof generation.
