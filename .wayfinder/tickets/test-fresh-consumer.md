# Test Sepolia preflight as a fresh consumer

Status: closed
Type: task
Parent: [STK402 Mainnet Readiness Map](../map.md)

## Question

Can a new consumer verify the live Sepolia pool, indexer, and prover without a key or transaction?

## Resolution

VERIFIED: The first run failed because `src/config.ts` added a trailing slash and the SDK appended `/health`. The resulting `//health` request returned HTTP 404.

VERIFIED: `src/config.test.ts` now checks that service root URLs have no trailing slash.

VERIFIED: After the fix, a fresh subagent ran `src/check-sepolia.ts` with inline public values and received exit code 0.

VERIFIED: The run returned Sepolia chain ID `0x534e5f5345504f4c4941`, pool class hash `0x56ab118a8a6e38efc93ad758cefe909fee421fa931ce3cf72df624d345623b2`, indexer status `OK`, indexer lag `7`, and prover version `0.10.3-rc.2`.

VERIFIED: The test used no private key, proof request, or transaction.

## Limits

- The indexer head and lag are one live snapshot, not an availability measure.
- The preflight does not test proof generation.
