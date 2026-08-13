# Use production STRK20 services on Sepolia

Status: closed
Type: grilling
Parent: [STK402 Mainnet Readiness Map](../map.md)

## Question

Which STRK20 proof and discovery route must the Sepolia test use?

## Resolution

REPORTED: The user selected a production prover plus indexer.

VERIFIED: `.env.sepolia.example` requires separate prover and indexer URLs.

VERIFIED: `src/check-sepolia.ts` checks the Sepolia chain, pool class, indexer health, and prover specification version.
