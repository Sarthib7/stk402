# Bind payment claims with a signed Starknet receipt

Status: closed
Type: grilling
Parent: [STK402 Mainnet Readiness Map](../map.md)

## Question

How must an agent bind a public transaction hash to one x402 invoice?

## Resolution

REPORTED: The user approved a SNIP-12 receipt signed by the payer account.

VERIFIED: `src/private402/signed-receipt.ts` binds the invoice ID, transaction hash, recipient, token, and amount.

VERIFIED: `src/private402/signed-receipt.test.ts` rejects a signature from a different key and payment evidence with a different amount.
