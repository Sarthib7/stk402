# Choose durable replay storage

Status: closed
Type: grilling
Parent: [STK402 Mainnet Readiness Map](../map.md)

## Question

Which atomic store should enforce unique invoice IDs and transaction hashes for the first deployment?

## Current options

- INFERRED: SQLite fits one service process with a persistent disk and adds no package dependency.
- INFERRED: PostgreSQL fits multiple instances and serverless runtimes, but adds deployment work before the HTTP slice exists.

## Blocking

The hosting target can invalidate the SQLite option.

## Resolution

VERIFIED: `src/private402/claim-ledger.ts` uses Node's built-in SQLite database with unique constraints on invoice ID and transaction hash.

VERIFIED: `src/private402/claim-ledger.test.ts` closes and reopens the database, then rejects both invoice and transaction reuse.

INFERRED: This option is valid only for one service instance with a persistent filesystem. A multi-instance or serverless deployment needs shared atomic storage.
