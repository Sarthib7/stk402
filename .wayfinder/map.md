# STK402 Dual-Client Mainnet Map

## Destination

By 2026-08-31: a public dual-client stk402 product (Agent Payer via CLI/SDK/MCP/skill, and Consumer via Ready/Xverse Wallet API) that settles real x402 invoices with STRK20 note-to-note transfers on Starknet mainnet, with three invoice-settling mainnet pool txs in `strk20.json`, a live demo URL, and a 3-minute video. No hardcoded settlement.

## Notes

- Domain: private x402 on STRK20. Skills: grill-with-docs glossary in `CONTEXT.md`; research under `research/`; ponytail YAGNI on code.
- VERIFIED: Sepolia agent invoice settle works (`EVIDENCE.md`). Mainnet agent settle needs published discovery + proving URLs or self-host.
- Grill locks 2026-08-14: destination C; dual surfaces C; score hashes must settle stk402 invoices (3B); network order Devnet→Sepolia→Mainnet (4A); ship CLI+SDK+MCP (5); viewing key in env (6A); wallets Ready+Xverse (8B).
- Agent demo path: skill connects the agent, then CLI or MCP pays a payable x402 endpoint through stk402. Browser path integrates SDK / Wallet API.
- Standing prefs: real settlement only; honest privacy copy from `research/privacy-claims-what-we-can-say.md`; merchant must be pool-registered.
- Calendar risk: full dual client in one sprint is high. Frontier order: **browser Wallet API invoice settles for score hashes** (locked A, 2026-08-15), then always-on demo host; agent mainnet CLI waits on published URLs.

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

- Exact MCP auth model for remote agent hosts (stdio MCP is local operator env today).
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

- **Primary for score hashes:** live Consumer Wallet API invoice settle (Ready/Xverse) → three mainnet invoice txs in `strk20.json` (grill 2026-08-15: path **A**, no self-host prover push)
- Host always-on Consumer page + Paid Resource (tunnel first OK; Railway/Fly before video)
- Prove browser Receipt verify on Sepolia with Ready before relying on it for mainnet hashes
- Optional: root-level skill install notes once `demo_url` is live

Blocked (agent CLI path only):

- [Prove agent mainnet invoice settle](tickets/prove-agent-mainnet-invoice.md) — needs mainnet proving/indexer URLs
- [Record three invoice score hashes](tickets/record-invoice-score-hashes.md) — unblocked for **browser** path; still blocked for agent CLI until URLs exist

## Decisions so far (appended 2026-08-14 work session)

- [Unlock mainnet discovery and proving URLs](tickets/unlock-mainnet-service-urls.md) — still unpublished; `.env.mainnet.example` placeholders only; `npm run check:mainnet` reports blocked.
- [Package CLI SDK and MCP surfaces](tickets/package-cli-sdk-mcp.md) — SDK barrel + MCP tools shipped; skill.md deferred.
- [Design browser Wallet API invoice pay](tickets/design-browser-wallet-invoice-pay.md) — `web/` WalletAccountV6 path locked; shared Receipt typed data.
- [Browser envelope open for encrypted 402 terms](tickets/browser-envelope-open.md) — portable `@noble` open/seal; Vite env pins authorized client key.
- [Choose public demo URL shape](tickets/choose-public-demo-url.md) — `demo_url` = Consumer pay page; same origin `/SKILL.md` for agent CLI/MCP pay against the Paid Resource.
- [Score hashes via browser Wallet API](tickets/score-hashes-via-browser.md) — Aug 20 URL miss → push Consumer settles for 3B hashes; no self-host prover as the plan.

## Least confident decisions

1. ~~Destination C + score hashes while mainnet URLs missing~~ — **resolved 2026-08-15: path A** (browser Wallet API for hashes; do not open self-host prover as the plan). Residual risk: browser Receipt must verify on-server.
2. Whether Wallet API browser settle can produce a stk402-verifiable Receipt without Node `signMessage`.
3. Hosting pick (Railway vs Fly vs other) for always-on page + Paid Resource before video.
