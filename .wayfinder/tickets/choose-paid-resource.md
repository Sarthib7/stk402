# Choose the first paid HTTP resource

Status: closed
Type: grilling
Parent: [STK402 Mainnet Readiness Map](../map.md)

## Question

What useful response should the first STK402 endpoint return after payment settles?

## Current options

- An agent tool result from a deterministic local function.
- Access to a protected JSON payload that proves the payment flow only.
- A proxied third-party API call, which adds another trust and failure boundary.

## Resolution

REPORTED: The user approved the recommended deterministic tool result.

VERIFIED: `src/private402/paid-sha256.ts` returns a SHA-256 digest only after x402 settlement succeeds.

VERIFIED: The server records each issued invoice, binds it to the exact request URL, and enforces its 60-second expiry.

VERIFIED: `src/private402/paid-sha256.test.ts` tests a real loopback HTTP `402` response followed by a signed paid retry and HTTP `200` result.

VERIFIED: Tests reject an unknown invoice, a different resource request, an expired invoice, changed payment requirements, and transaction replay.

## Limits

- The local test uses synthetic payment evidence and a local signing key.
- The local test does not generate a STRK20 proof or submit a Starknet transaction.
