# STK402 Dual-Client Mainnet Map

## Destination

By 2026-08-31: a public dual-client stk402 product (Agent Payer via CLI/SDK/MCP/skill, and Consumer via Ready/Xverse Wallet API) that settles real x402 invoices with STRK20 note-to-note transfers on Starknet mainnet, with three invoice-settling mainnet pool txs in `strk20.json`, a live demo URL, and a 3-minute video. No hardcoded settlement.

## Notes

- Domain: private x402 on STRK20. Skills: grill-with-docs glossary in `CONTEXT.md`; research under `research/`; ponytail YAGNI on code.
- VERIFIED: Sepolia agent invoice settle works (`EVIDENCE.md`). Mainnet agent settle needs published discovery + proving URLs or self-host.
- Grill locks 2026-08-14: destination C; dual surfaces C; score hashes must settle stk402 invoices (3B); network order Devnet→Sepolia→Mainnet (4A); ship CLI+SDK+MCP (5); viewing key in env (6A); wallets Ready+Xverse (8B).
- Agent demo path: skill connects the agent, then CLI or MCP pays a payable x402 endpoint through stk402. Browser path integrates SDK / Wallet API.
- Standing prefs: real settlement only; honest privacy copy from `research/privacy-claims-what-we-can-say.md`; merchant must be pool-registered.
- Calendar risk: full dual client in one sprint is high. Frontier order prefers mainnet URL gate + invoice score hashes before polishing MCP/skill.

## Decisions so far

- [Bind payment claims with a signed Starknet receipt](tickets/bind-payment-claims.md) — SNIP-12 signature over invoice and payment facts.
- [Use production STRK20 services on Sepolia](tickets/use-production-services.md) — hosted Alpha Sepolia prover and indexer.
- [Find usable Sepolia prover and indexer endpoints](tickets/find-sepolia-services.md) — live hosted Alpha Sepolia services.
- [Test Sepolia preflight as a fresh consumer](tickets/test-fresh-consumer.md) — URL normalization and public read-only path.
- [Choose durable replay storage](tickets/choose-replay-storage.md) — SQLite for first single-instance deploy.
- [Choose the first paid HTTP resource](tickets/choose-paid-resource.md) — deterministic SHA-256 tool result.
- [Run one production private payment on Sepolia](tickets/run-sepolia-payment.md) — VERIFIED HTTP 200 + digest; see `EVIDENCE.md`.
- [Define the Sepolia acceptance gate](tickets/define-sepolia-gate.md) — Sepolia gate passed for functional settle; privacy caveats documented.
- [Lock Aug 31 destination and dual-client surfaces](tickets/lock-destination-dual-client.md) — score + agent mainnet + browser Wallet API; CLI+SDK+MCP; skill→pay demo.
- [What privacy claims can we publish](tickets/research-privacy-claims.md) — amount-hidden from public observers without viewing key; ban unlinkable/full private; 2-sentence README claim.
- [Must the merchant be pool-registered](tickets/research-merchant-recipient.md) — yes; unregistered `payTo` fails `RECIPIENT_NOT_REGISTERED`.
- [Is paymaster required](tickets/research-paymaster-necessity.md) — not for settle or score; required only to claim L2 sender hidden. Direct submit OK if documented.
- [Hosting and out-of-scope defaults](tickets/decide-hosting-and-scope.md) — always-on host before video; no new Cairo, no Braavos private, no cross-chain; self-host prover only if URLs missing past Aug 20.

## Not yet specified

- Exact MCP tool names and auth model for agent hosts.
- Skill.md content shape (Cursor/Claude) once CLI/MCP stabilize.
- Whether browser path uses Wallet API only or also Privacy SDK browser bundle.
- Envelope-on live Sepolia measurement (code exists; live run was plaintext challenge).
- AVNU mainnet allowlist for plain private transfer (not swap).
- How judges treat agent MCP demo vs browser demo if one slips.

## Out of scope

- New Cairo contracts unless signed-receipt route fails.
- Braavos as a promised private-pay wallet (not on STRK20 Wallet API lists).
- Cross-chain / Solana settlement in this sprint.
- Self-hosted Stwo prover unless mainnet discovery/proving URLs stay unpublished past 2026-08-20 (then reopen as a Task).
- Claiming unlinkable or fully private x402 without measured paymaster/relayer + later-channel evidence.

## Frontier (local index; open tickets live under `tickets/`)

- [Browser envelope open for encrypted 402 terms](tickets/browser-envelope-open.md)
- [Choose public demo URL shape](tickets/choose-public-demo-url.md)

Blocked:

- [Prove agent mainnet invoice settle](tickets/prove-agent-mainnet-invoice.md) — needs mainnet proving/indexer URLs
- [Record three invoice score hashes](tickets/record-invoice-score-hashes.md) — needs invoice settles (agent URLs or browser path)

## Decisions so far (appended 2026-08-14 work session)

- [Unlock mainnet discovery and proving URLs](tickets/unlock-mainnet-service-urls.md) — still unpublished; `.env.mainnet.example` placeholders only; `npm run check:mainnet` reports blocked.
- [Package CLI SDK and MCP surfaces](tickets/package-cli-sdk-mcp.md) — SDK barrel + MCP tools shipped; skill.md deferred.
- [Design browser Wallet API invoice pay](tickets/design-browser-wallet-invoice-pay.md) — `web/` WalletAccountV6 path locked; shared Receipt typed data; envelope open is follow-up.

## Least confident decisions

1. Destination C + score hashes must be invoice settles (3B) while Day 0 mainnet prover/indexer URLs are still missing — calendar and infra risk.
2. MCP + skill + browser Wallet API all as equal surfaces by Aug 31.
3. Whether Wallet API browser settle can produce a stk402-verifiable Receipt without Node `signMessage`.
