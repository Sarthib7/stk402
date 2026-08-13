# STK402 Mainnet Readiness Map

## Destination

Produce a Sepolia-proven STK402 service that is ready for a Mainnet security review. Mainnet deployment remains a separate approval gate.

## Notes

- VERIFIED: The repository root is `/Users/sarthiborkar/Build/starkhack/stk402`.
- VERIFIED: The local Devnet flow uses the STRK20 pool, discovery service, signed x402 receipt, and replay rejection.
- VERIFIED: `npm run test:devnet` reported one passing integration test in this session.
- VERIFIED: The Devnet test uses `CallMockProofProvider`, so it does not test production proof generation.
- REPORTED: The user selected a production prover and indexer for Sepolia.
- REPORTED: The user wants development work to continue when no external approval is required.
- INFERRED: Implementation can follow a resolved local ticket. Deployment, publishing, spending, and Mainnet calls still require current approval.

## Decisions so far

- [Bind payment claims with a signed Starknet receipt](tickets/bind-payment-claims.md): require a SNIP-12 signature over invoice and payment facts.
- [Use production STRK20 services on Sepolia](tickets/use-production-services.md): test with a production prover and indexer before Mainnet review.
- [Find usable Sepolia prover and indexer endpoints](tickets/find-sepolia-services.md): use the live hosted Alpha Sepolia services, subject to organizer traffic approval.
- [Test Sepolia preflight as a fresh consumer](tickets/test-fresh-consumer.md): fix service URL normalization and verify the public read-only path.
- [Choose durable replay storage](tickets/choose-replay-storage.md): use built-in SQLite for the first single-instance deployment.
- [Choose the first paid HTTP resource](tickets/choose-paid-resource.md): use a deterministic SHA-256 agent tool result.

## Frontier

- [Run one production private payment on Sepolia](tickets/run-sepolia-payment.md)

## Blocked

- [Define the Sepolia acceptance gate](tickets/define-sepolia-gate.md), blocked by one production private payment on Sepolia.

## Not yet specified

- Agent key custody and unattended payment policy.
- Hosting shape after the first paid HTTP slice works locally.
- Mainnet migration checks that depend on Sepolia measurements.

## Out of scope

- Mainnet deployment or transactions before Sepolia passes.
- New Cairo contracts unless the signed receipt route fails.
- Brand and frontend work before the paid HTTP slice works.

## Least confident decisions

1. INFERRED: A hosted Sepolia prover and indexer are available to hackathon builders. Public documentation does not list their URLs.
2. INFERRED: One process with a persistent disk may be enough for the first deployment. The hosting target is not selected.
