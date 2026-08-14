# What privacy claims can we publish

Labels: wayfinder:research
Status: closed

## Question

What can stk402 honestly claim for agent and browser Wallet API invoice settlement?

## Resolution (2026-08-14)

Asset: [research/privacy-claims-what-we-can-say.md](../research/privacy-claims-what-we-can-say.md)

Recommended README claim: stk402 settles an x402 invoice with a STRK20 note-to-note transfer so a public observer without a viewing key cannot read the paid amount from the pool receipt. Deposits, the seller, and a direct L2 sender stay visible unless a later paymaster or Wallet API relayer actually submits the transfer.

Ban: unlinkable x402, full private payments, Braavos private pay, amount privacy on deposit/withdraw edges.
