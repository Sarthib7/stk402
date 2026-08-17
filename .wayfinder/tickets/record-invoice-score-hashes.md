# Record three invoice score hashes

Labels: wayfinder:task
Status: open
Blocked by: live Consumer Wallet API invoice settle (primary); agent CLI still needs [Unlock mainnet discovery and proving URLs](unlock-mainnet-service-urls.md)

## Question

Which three mainnet pool-touching transaction hashes settle stk402 invoices and go into `strk20.json`?

## Constraint

Grill 3B: Ready shield-only txs do not count. Each hash must settle a stk402 invoice (agent or browser path).

## Path lock (2026-08-15)

Grill [Score hashes via browser Wallet API](score-hashes-via-browser.md): **A**. Produce the three hashes via Consumer Ready/Xverse settles against a hosted Paid Resource. Do not wait on self-host prover for this ticket.