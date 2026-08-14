# Unlock mainnet discovery and proving URLs

Labels: wayfinder:task
Status: closed
Assignee: agent (2026-08-14)

## Question

How do we obtain usable mainnet `INDEXER_URL` and `PROVING_SERVICE_URL` (or an approved substitute) so agent CLI can settle stk402 invoices on SN_MAIN?

## Resolution (2026-08-14)

**Still unpublished.** VERIFIED: Day 0 still says discovery/indexer and proving URLs are missing. VERIFIED: awesome-strk20 points at self-host prover crate, not hosted mainnet URLs. VERIFIED: guessed `*.alpha-mainnet.sw-dev.io` / `*.mainnet.sw-dev.io` hostnames did not connect (no URLs written into env).

Actions taken:
- Documented placeholders in `.env.mainnet.example` with empty proving/indexer slots and "do not guess".
- Score-hash path without agent prover: pursue [Design browser Wallet API invoice pay](design-browser-wallet-invoice-pay.md) so invoice settles can use wallet proving.
- If still missing after 2026-08-20: open self-host prover Task (already in map out-of-scope contingency).

Blocked tickets remain blocked on real URLs or browser invoice path.
