# Approach 2 research synthesis (stk402)

Date: 2026-08-14

Provenance: mix of VERIFIED (primary page or local vendor quote in this session) and REPORTED (subagent reports under `research/`). Untagged claims are not allowed in this file.

## Sources

| Report | Lines | Role |
| --- | --- | --- |
| `research/strk20-official-docs.md` | 266 | Official build / hackathon / by-example |
| `research/browser-strk20-wallet.md` | 175 | Browser Wallet API path |
| `research/starknet-privacy-sdk.md` | 157 | Vendor SDK + client (local `@66e3caae`) |
| `research/x402-starknet-scheme.md` | 253 | x402 v2 + Starknet exact + custom schemes |

Primary re-checks this session:

- VERIFIED: https://strk20-by-example.org/starknet-wallet-api/overview.md (Wallet API is the dapp route; pin `starknet@^10.4.0`; no viewing keys in the app)
- VERIFIED: https://raw.githubusercontent.com/starkience/strk20-hackathon/main/docs/MAINNET-DAY-0.md (mainnet pool; discovery and proving URLs still missing from that doc)
- VERIFIED: local `vendor/starknet-privacy/client/src/sdk-wallet.ts` (SdkWallet proves then paymaster-submits; deposit vs apply_action split)

## What Approach 2 must mean (revised)

Approach 2 is **two clients, two key models, one x402 settlement contract**.

| Client | Privacy path | Who holds viewing key | Who proves |
| --- | --- | --- | --- |
| Consumer browser | Starknet Wallet API (`WalletAccountV6`, `strk20InvokeTransaction`) | Wallet (Ready / Xverse) | Wallet (may call hosted prover internally) |
| Agent / CLI / SDK | Privacy SDK + discovery + proving service | Agent runtime | Hosted prover or self-host |

VERIFIED (by-example Wallet API overview): "Do not ask a normal dapp user for their viewing key." "The wallet discovers notes, builds the transaction, generates the proof, and submits it."

VERIFIED (same page): pin `starknet@^10.4.0`. Bare `latest` is still 10.0.x without STRK20.

INFERRED from official naming: consumer "Argent" in Approach 2 maps to **Ready (formerly Argent)**. Braavos is a normal Starknet wallet for Day 0 gas/shield UI, but is **not** listed as a STRK20 Wallet API wallet on fetched pages.

## Score path vs product path

Hackathon (VERIFIED from Day 0 + README research):

- Sprint is mainnet-only for prizes.
- Need >=3 mainnet pool-touching txs in `strk20.json`, demo URL, 3-minute video.
- Day 0 still says mainnet **discovery URL** and **proving service URL** are missing. Do not guess.
- Wallet API demos can hit mainnet pool through Ready/Xverse **without** those URLs (wallet proves).
- Agent SDK that proves itself **cannot** mainnet-settle until those URLs exist or you self-host a prover.

Implication for stk402:

1. Fastest mainnet score txs: Ready Wallet API path (shield / private transfer / pay demo invoice).
2. Agent CLI mainnet: blocked on published mainnet prover/indexer **or** self-host.
3. Devnet / Sepolia: keep proving agent path (already VERIFIED in `EVIDENCE.md` for Sepolia).

## x402 facts that constrain the scheme

REPORTED from `research/x402-starknet-scheme.md` (Foundation specs fetched by subagent):

- Official Starknet `exact` scheme is public SNIP-9 style settlement with payer visibility.
- Custom schemes register via `@x402/core` `register()`.
- Default payment headers are cleartext base64. stk402 already encrypts terms (local code VERIFIED earlier).
- No official Foundation package wires STRK20 private receipts.

Gap (REPORTED, no demo found): nobody ships HTTP 402 -> STRK20 private transfer -> private receipt verify end to end. That is the innovation claim.

## Privacy claims that are safe to write

VERIFIED (Day 0 + what-is-strk20 material in official-docs report):

- Public: deposits (address, token, amount), withdrawals, timing, that a pool interaction happened.
- Private in-pool: sender, receiver, amounts, spent notes (to public observers without viewing key).
- Paymaster / relayer can hide the submitter address on the L2 tx.
- First channel open can still link parties (stk402 `EVIDENCE.md` already recorded Sepolia recipient in `Append`).

Do not claim: amount privacy on public ERC-20 edges; full unlinkability if user shields then pays in one tight window; Braavos private dapp pay.

## Hard product rules (adopt)

1. Never put viewing keys in the consumer page.
2. Browser pay uses Wallet API only. Probe `supportedWalletApi >= 0.10.3`.
3. Agent pay uses Privacy SDK. Separate binary / package entry.
4. Merchant recipient must be pool-registered before private receive.
5. Notes mature ~10 blocks. Demo must wait or pre-fund.
6. Real settlement only. No hardcoded digest / fake tx in demo mode.
7. Network gate: Devnet green checklist before Mainnet agent switch. Mainnet Wallet API can run earlier for scoring hashes.
8. Pin starknet.js `^10.4.0` for the web app. Keep agent stack compatible with vendor sdk (current vendor uses starknet 10.0.2 in stk402 `package.json`; web may need a dual-pin or bump plan).
9. Document operator trust: seller, discovery, prover, paymaster/relayer.
10. Invoice timeout must cover proof latency (starter budgets minutes, not seconds).

## Open factual gaps (do not invent)

1. Live Ready X binary on this machine completing `strk20InvokeTransaction` (not run).
2. Exact mainnet proving and discovery URLs (still absent from Day 0 on 2026-08-14 fetch).
3. Whether AVNU relays a plain private transfer for a third-party x402 facilitator without extra allowlist.
4. Xverse dapp Wallet API: "in progress" vs live (sources disagree by page age).
5. Whether types-js 0.10.3 vs 0.10.4-beta.2 is what Ready ships today.
6. End-to-end wall time: shield -> maturity -> private pay -> x402 200 on mainnet.

## Least confident design calls

1. Shipping browser Wallet API pay in the same sprint as agent SDK mainnet (Approach 2 load).
2. Using Wallet API txs for the three scoring hashes while agent mainnet waits on prover URLs.
3. How the browser client produces an x402-compatible signed receipt without holding the account key the way Node `signMessage` does today (wallet must sign the receipt typed data).
4. Merchant registration UX for first-time Ready users.

## Decision needed before §2

Keep Approach 2 with the **dual-route** correction above, or drop browser Wallet API to post-score stretch and ship Approach 1 (CLI+SDK + status page) until mainnet prover URLs land.
