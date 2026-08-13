# Find usable Sepolia prover and indexer endpoints

Status: closed
Type: research
Parent: [STK402 Mainnet Readiness Map](../map.md)

## Question

Does STRK20 provide hosted Sepolia prover and indexer endpoints for hackathon builders, or must STK402 deploy them?

## Evidence required

- Official documentation, repository configuration, or an organizer statement.
- Exact service compatibility with the pinned STRK20 revision.
- Authentication and OHTTP requirements without recording secret values.

## Resolution

VERIFIED: The hosted indexer is `https://discovery-service.alpha-sepolia.sw-dev.io`.

VERIFIED: On 2026-08-14, `GET /health` returned HTTP 200 with `status: "OK"`, block `13425234`, and `lag_secs: 6`.

VERIFIED: The hosted prover is `https://transaction-prover.alpha-sepolia.sw-dev.io`.

VERIFIED: On 2026-08-14, `starknet_specVersion` returned `0.10.3-rc.2` without authentication.

VERIFIED: `docs/MAINNET-DAY-0.md` in `starkience/strk20-hackathon` says the starter kit ships hosted Sepolia prover and indexer endpoints.

REPORTED: A research subagent used the pinned SDK `0.14.3-rc.5` to complete OHTTP health and specification calls to both services.

INFERRED: Self-hosting is not required for the first Sepolia test.

## Limits

- VERIFIED: No full proof request was sent during research.
- VERIFIED: The hackathon guide does not state a service availability promise or builder traffic policy.
- REPORTED: No stable public OHTTP relay was found.
- INFERRED: Ask organizers to approve sprint use and provide their OHTTP relay and key rotation policy.
