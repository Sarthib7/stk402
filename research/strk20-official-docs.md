# STRK20 official docs: facts for a consumer browser demo + agent SDK (x402 from shielded notes)

Date fetched: 2026-08-14.

Provenance: REPORTED. Distilled from pages fetched on 2026-08-14. Claims below are the sources' claims. Quotes marked VERIFIED were copied from those fetches. Anything not in a fetched page is tagged NOT DETERMINED.

## Source URLs fetched

Primary (requested):

1. https://strk20.starknet.io/build and https://strk20.starknet.io/build.md
2. https://strk20-by-example.org/what-is-strk20 and https://strk20-by-example.org/what-is-strk20.md
3. https://strk20.starknet.io/hackathon and https://strk20.starknet.io/hackathon.md

Linked (Wallet API, private dapp, prover, scoring): https://strk20.starknet.io/llms.txt, https://strk20.starknet.io/llms-full.txt, https://strk20.starknet.io/index.md, https://strk20-by-example.org/llms.txt, https://strk20-by-example.org/llms-full.txt, https://strk20-by-example.org/builder-privacy-overview.md, https://strk20-by-example.org/overview.md, https://strk20-by-example.org/starknet-wallet-api/overview.md, https://strk20-by-example.org/starknet-wallet-api/starknet-js.md, https://strk20-by-example.org/starknet-wallet-api/starknet-start-hook.md, https://strk20-by-example.org/starknet-wallet-api/private-defi.md, https://strk20-by-example.org/starknet-wallet-api/avnu-private-swaps.md, https://strk20-by-example.org/sdk/getting-started.md, https://strk20-by-example.org/sdk/proving-config.md, https://strk20-by-example.org/sdk/discovery-providers.md, https://strk20-by-example.org/helpers/privacy-invoke.md, https://strk20-by-example.org/viewing-keys.md, https://strk20-by-example.org/compliance.md, https://strk20-by-example.org/notes-and-nullifiers.md, https://strk20-by-example.org/channels-and-subchannels.md, https://strk20-by-example.org/actions-and-proofs.md, https://strk20.starknet.io/rfp/privacy-wallet (HTML), https://strk20.starknet.io/rfp/universal-private-payment-rail (HTML), https://strk20.starknet.io/app/live-apps (JS shell only), https://raw.githubusercontent.com/starkience/strk20-hackathon/main/README.md, https://raw.githubusercontent.com/starkience/strk20-hackathon/main/docs/MAINNET-DAY-0.md, https://raw.githubusercontent.com/starkience/strk20-hackathon/main/IDEAS.md, https://raw.githubusercontent.com/starkware-libs/starknet-privacy/main/sdk/README.md, https://raw.githubusercontent.com/Akashneelesh/strk20-starter-kit/main/.env.example, https://raw.githubusercontent.com/Akashneelesh/strk20-starter-kit/main/src/utils/constants.ts, https://starknet-js.com/docs/next/guides/account/walletAccount/ (linked from Wallet API pages).

## TLDR

STRK20 is a note-based privacy pool on Starknet, not a mixer. A consumer browser demo should use the Starknet Wallet API (starknet.js `WalletAccountV6`, Wallet API `>= 0.10.3`) so the wallet holds the viewing key and generates the STARK proof. An agent SDK that spends shielded notes itself should use the Privacy SDK (`createPrivateTransfers`) plus a remote proving service and HTTP discovery indexer. Those two routes must not mix: a normal dapp must not take the user's viewing key. Official docs name Ready and Xverse as STRK20 Wallet API wallets (starknet.js next, 2026-08). They do not document Argent or Braavos as Privacy Wallet API implementations. The sprint is mainnet-only. Hosted mainnet proving and discovery URLs were still unpublished in the Day 0 doc on 2026-08-14. In-browser proving of the SDK path is not documented; proof generation is described as a remote service, and a Stwo proof is quoted at about 29 seconds on a 12-core / 46 GiB machine.

## 1. Integration routes

Status: VERIFIED from `/build.md`, `/builder-privacy-overview.md`, `/overview.md`, `/starknet-wallet-api/overview.md`, `/sdk/getting-started.md`, `/sdk/proving-config.md`.

Four routes on the Build page:

1. Private dapp: anonymizer contracts plus the Starknet Wallet API.
2. Privacy wallet or advanced backend: Privacy SDK.
3. Own prover: operate proof generation yourself.
4. Private sub-accounts: hide the public link between a main wallet and app activity.

Quotes:

- Build.md: "the one most apps should use" is the Starknet Wallet API: "integrate through starknet.js and ask the wallet to perform the private action, so the dapp never touches the user's viewing key or the SDK."
- Builder overview: "The wallet manages viewing keys, notes, proving, and submission."
- Getting started: SDK pages are "for teams building privacy wallets on Starknet or advanced integrations that manage their own account, keys, note discovery, and proving."
- Getting started: "If you are building a private dapp on top of an existing wallet, use the Starknet Wallet API instead."
- Proving-config: "Most dapps do not need to operate proving infrastructure" (same idea on builder overview: wallets, infra teams, and advanced integrators may run a prover).

Extra surfaces (same overview pages):

- Anonymizer / `privacy_invoke` helper: pool withdraws to helper, calls it, credits `OpenNoteDeposit` back into notes. At most one external invoke per pool tx.
- Privacy Bridge (EVM USDC via Circle CCTP): linked GitHub `starkware-libs/privacy-bridge`. Described as early.
- AVNU private swaps: no custom Cairo; needs a STRK20-capable wallet and an already-shielded sell token.

Sub-accounts (conflict, keep both):

- `/build.md`: "coming soon."
- `/what-is-strk20.md`: SDK route ships in Privacy SDK `0.14.3-rc.4`; "the Wallet API route is still pending, so dapps relying on the user's wallet cannot use them yet."
- `/builder-privacy-overview.md`: "no sub-account method is exposed by `@starknet-io/types-js` 0.10.3 or starknet.js."
- starknet.js next WalletAccount guide: documents `shadow_account_invoke` as a `STRK20_ACTION` and gives Mainnet/Sepolia shadow anonymizer addresses.
- Hackathon `IDEAS.md`: "Sub-accounts and confidential compute are in progress, not available today."

Do not treat Wallet API sub-accounts as ready for a dapp until STRK20-by-example and types-js agree. The SDK `subaccounts(...)` path is documented as available for teams that hold the account keys.

## 2. Hidden vs public on-chain

Status: VERIFIED from `/what-is-strk20.md`, `/compliance.md`, `/viewing-keys.md`, `/notes-and-nullifiers.md`, `/starknet-wallet-api/private-defi.md`, hackathon `MAINNET-DAY-0.md`.

Hidden inside the pool (public observer, no viewing key):

- Sender, receiver, amounts, token type, which notes were spent.
- Note storage location (derived from channel key).
- Nullifier-to-note link.

Public to everyone:

- That an address registered (`SetViewingKey`); escrowed viewing-key ciphertext.
- Deposit: depositor address, token, amount (ERC-20 `transfer_from`).
- Withdrawal: recipient, token, amount; user address also encrypted to the auditor.
- `UseNote`: published nullifier (unlinkable without a viewing key).
- Open notes: token and filled amount in plaintext.
- Timing of pool interaction.
- DeFi helper path: observers see pool to helper to AMM to helper. They do not see who initiated it. Helper action and amounts can still be public.
- Channel-open linkability if you open a channel and deposit/withdraw in the same tx or in tight succession.

Quote from `/what-is-strk20.md`: "Inside the pool, the sender, receiver, amounts, token type, and which notes were spent are all private. What stays visible: deposit and withdrawal amounts (the public ERC-20 legs), that someone is interacting with the pool, and timing. A Paymaster can decouple the submitter's address from the transaction."

Quote from Day 0: "Claim identity privacy; never claim amount privacy for swaps."

Day 0 also: private txs "are submitted by rotating shared relayers, not by your wallet. The sender address on the transaction will be a relayer."

Auditor with one recovered private viewing key can open that user's incoming and outgoing channels, decrypt note amounts, match nullifiers, and trace forward and backward. A viewing key cannot spend. Spending needs an account signature inside the proof.

Registration encrypts `k` to the auditor public key (governance-set, threshold keys supported). FPI screens every deposit; the pool verifies the signature onchain. Self-hosted proving does not bypass screening.

## 3. Browser / wallet support (Privacy Wallet API)

Status: VERIFIED for Ready and Xverse from starknet.js next. NOT DETERMINED for Argent-branded or Braavos Wallet API support.

Documented dapp path:

- Pin `starknet@^10.4.0`. STRK20 landed in 10.4.0 on the npm `next` tag. Bare `npm install starknet` resolves to `latest` 10.0.x, which lacks `WalletAccountV6`, `strk20InvokeTransaction`, and `STRK20_ACTION`.
- React: `useStrk20` from Starknet Start.
- Non-React: `WalletAccountV6` plus get-starknet v6 (`v6.0.2` min).
- Wallet must support STRK20 Wallet API methods. Proofs and signatures are wallet-side.
- Private DeFi and AVNU pages require Wallet API `0.10.3` / `>= 0.10.3`.
- Tip jar example capability check: `walletV6.supportedWalletApi(wallet)` and `compareVersions(v, "0.10.3") >= 0`.
- WalletAccount "functions only within the scope of a DAPP. It can't be used in a Node.js script."

Wallet names in fetched pages:

- starknet.js next: "As of 2026-08, the Ready and Xverse wallets support the STRK20 wallet API."
- strk20.starknet.io llms-full user walkthroughs: "get a Ready or Xverse wallet."
- proving-config: teams that self-host a prover "typically shield through a privacy-enabled wallet (Ready or Xverse) and then transfer privately to the account their integration controls."
- Day 0 "What you need": "A Starknet wallet | Ready (formerly Argent) or Braavos, switched to Mainnet." That sentence is about having a mainnet wallet for gas and shielding, not about Wallet API STRK20 methods.

NOT DETERMINED: any fetched STRK20 page that lists Braavos or Argent (as opposed to Ready) as implementing the Privacy Wallet API. Ready is documented as formerly Argent. Braavos is named as a generic Starknet wallet on Day 0 only.

Wallet API actions a dapp can request (by-example overview): shield, private transfer, withdraw, swap where the wallet supports it. Detect capabilities before offering an action.

starknet.js next lists five `STRK20_ACTION` types: `deposit`, `withdraw`, `transfer` (amount felt or `"OPEN"`), `invoke`, `shadow_account_invoke`. Submit with `strk20InvokeTransaction` (wallet pays), `strk20PrepareInvoke` (dapp/sponsor submits), or `executeWithProof`. Balances: `strk20Balances`. Proof generation is "much slower than an ordinary invoke."

## 4. Mainnet vs Sepolia service URLs and readiness

Status: pool addresses VERIFIED. Hosted proving and discovery URLs NOT DETERMINED in official docs.

Mainnet (Day 0, "verified mainnet values"):

```
CHAIN_ID=SN_MAIN                  # 0x534e5f4d41494e
RPC_URL=https://rpc.starknet.lava.build
POOL_ADDRESS=0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a
```

Sepolia pool (SDK getting-started): `0x0254a6b2997ef52e9f830ce1f543f6b29768295e8d17e2267d672c552cfe0d91` (privacy pool v2.0).

Shadow account anonymizer (starknet.js next only):

- Mainnet: `0x04f33230dc57855c6e7eabe66dfa0fde82c5458fd0e54827cdb7cb4c474888a7`
- Sepolia: `0x010a2285310c107c731d997afc147afb7495daff6397c2d242133d9fe8d9b147`

AVNU: `PRIVACY_POOL_ADDRESS` is mainnet; `SEPOLIA_PRIVACY_POOL_ADDRESS` is exported for Sepolia.

Starter kit (Akashneelesh) treats provider index 0 as Mainnet and 2 as Sepolia. Echo helper on mainnet: `0x78ae662e0cc6d1ab2cfeaf2a51ba8783d88e31886f88a794d142f95a6f8735b`. Sepolia echo helper is env-gated, default `0x0`. No proving or indexer URL in that starter kit (Wallet API route; the wallet proves).

SDK snippets use env vars only: `PROVING_SERVICE_URL`, `INDEXER_URL`, `POOL_ADDRESS`, with `constants.StarknetChainId.SN_SEPOLIA` in the proving-config example.

Day 0 quote, still present on 2026-08-14 fetch: "Two values are still missing from this document - the mainnet discovery/indexer URL and the mainnet proving service URL. The starter kit ships hosted Sepolia endpoints for both; the mainnet equivalents come from StarkWare and will be filled in here before August 14. Until then, build against Sepolia and open an issue if you need mainnet proving early. Don't guess at endpoints."

The hackathon page still says the sprint is mainnet-only for winning. Wallet API demos can hit the live mainnet pool through Ready/Xverse without those URLs. An agent SDK that proves itself cannot, until those URLs are published or self-hosted.

Pool is described as live on Starknet mainnet on Build and Overview.

## 5. Hackathon scoring (Private Sprint)

Status: VERIFIED from `/hackathon.md` and `starkience/strk20-hackathon` README. Small field mismatch between those two, kept below.

Dates: 2026-08-14 open; 2026-08-31 23:59 UTC close; 2026-09-04 winners.

Prize: $5,000 USD paid in STRK: $2,500 / $1,500 / $1,000.

Apply: one PR against `github.com/starkience/strk20-hackathon`. README: add `{ "repo_url", "telegram" }` to `registry.json`. Webpage: project, GitHub handles, Telegram usernames, description. Merge adds you to the builders group. Registration is the only PR.

Build in a public repo. Hub refresh every 30 minutes.

To win / to be scored:

- App runs on Starknet mainnet against the live STRK20 pool.
- At least three mainnet txs that touched the pool (README: each hash checked: exists, succeeded, touched the pool).
- Public demo anyone can open.
- Public open-source repo with a license.
- One payout address per winning team.

`strk20.json` at the root of your repo (README schema):

```json
{
  "transactions": ["0x07c0...", "0x04b2...", "0x0919..."],
  "contracts": ["0x0abc...", "0x0def..."],
  "demo_video": "https://youtu.be/...",
  "demo_url": "https://your-demo.example"
}
```

README required-for-scoring: `transactions` (three hashes), `demo_video` (3-minute). `contracts` optional. `demo_url` optional if GitHub Pages, repo Website field, or latest deployment is found.

Webpage says judges need four pieces: "demo, contract addresses, Starknet address and demo video" and "Add your Starknet address to your entry." README `strk20.json` has no Starknet-address field. Treat webpage "Starknet address" as NOT DETERMINED relative to the JSON schema.

Judging weights (both sources, README adds stealth accounts):

- STRK20 integration depth 30%: shielded balances, private transfers, anonymizer contracts, the SDK (README also: "using stealth accounts").
- Working mainnet product 30%: runs on mainnet for a real user. Webpage: "Not a prototype behind a login."
- Innovation 25%.
- Documentation and open-source quality 15%.

README: "If another team depends on something you published, that counts in your favour."

Day 0: eligibility is against `user_addr` in the pool `Deposit` event, not the tx sender (relayer).

`IDEAS.md` warns some prompts depend on unshipped infra (sub-accounts, confidential compute). Universal private payment rail RFP assumes Beam, private sub-accounts, Avnu paymaster, chain abstraction. Do not make scoring depend on those unless the team confirms they exist.

Two starter-kit URLs: Build page points at `Akashneelesh/strk20-starter-kit` (fetched, exists). Hackathon page points at `starkware-libs/starknet-privacy-starter-kit` (404 on 2026-08-14).

## 6. Blockers for in-browser proving and viewing keys

Status: VERIFIED. No fetched page documents an in-browser WASM / local Stwo prover for the SDK.

Proof generation:

- `/actions-and-proofs.md`: client builds actions, then "virtual Starknet execution", then "Stwo proof generation" quoted as "~29 s (12-core / 46 GiB; machine-dependent)", then submit, then sequencer verifies before apply.
- `/sdk/proving-config.md`: `ProvingServiceProofProvider` "sends your signed invocation to a proving service, which executes it in a virtual Starknet environment and returns a STARK proof."
- Notes mature 10 blocks after creation. Always pass `provingBlockId = currentBlock - 10`. Proofs older than `proof_validity_blocks` (default 450, about 15 min at 2s/block) expire.
- SDK README: never prove against `pre_confirmed`; prover needs finalized state.

Runtime:

- SDK getting-started and sdk/README: "Node.js >= 24 (its `ohttp-ts` dependency needs modern WebCrypto)."
- WalletAccountV6 cannot run in a Node.js script (dapp-only).
- `ContractDiscoveryProvider` exists in source but is not exported from the published package. Production discovery is `IndexerDiscoveryProvider` over HTTP.

Viewing keys:

- Private dapp: "Do not ask a normal dapp user for their viewing key." Wallet holds `k`. Dapp reads balances via `strk20Balances`.
- SDK: `viewingKeyProvider.getViewingKey` must return a `bigint` in `[1, MAX_VIEWING_KEY]`. A hex string "silently misbehaves."
- Discovery scan needs `k`. Indexer over HTTP sees whatever the client sends unless OHTTP is on. SDK README: OHTTP (RFC 9458) encrypts discovery so "The viewing key never appears in plaintext outside the OHTTP decryption layer." Optional `relayUrl` hides client IP. If OHTTP is enabled and the server lacks `/ohttp-keys`, the SDK throws.
- Privacy Bridge: "only the read-only viewing key may be persisted."
- Agent skill: "Viewing keys, private keys, and secrets never land in files - env-var placeholders only."

npm: `@starkware-libs/starknet-privacy-sdk` "is not on npmjs.com yet" (temporary). GitHub Packages needs a GitHub token even for public packages, or install from git at a commit.

AVNU `sponsored_private` paymaster API key: "passing the key from a browser leaks it." Split: server `buildPrivateSwapFee` / `submitPrivateSwap`; client only `prover` with the wallet.

Direct SDK deposits: proving-config says if production needs direct deposits (not shield-in-wallet then private-transfer-in), raise it in Cairo CoreStars Telegram. FPI still required.

## 7. Least confident / conflicts (do not smooth)

1. Wallet API sub-accounts: by-example and types-js 0.10.3 say pending; starknet.js next documents `shadow_account_invoke`; IDEAS.md says not available today; Build page says coming soon.
2. `strk20.json` fields: webpage four-item list vs README schema.
3. Starter-kit GitHub URL: Akashneelesh exists; starkware-libs starter kit 404.
4. Mainnet proving/discovery URLs promised "before August 14" and still missing in the Day 0 file fetched on August 14.
5. Braavos: Day 0 wallet list vs Wallet API support named only for Ready and Xverse.

## 8. NOT DETERMINED

- Official published HTTPS URLs for mainnet proving service and mainnet discovery/indexer.
- Official published HTTPS URLs for Sepolia proving and discovery (docs use env var names only; Day 0 claims the starter kit ships Sepolia endpoints, but the fetched Akashneelesh starter kit has none).
- Whether Braavos implements Wallet API `>= 0.10.3` STRK20 methods.
- Whether Ready is the only Argent-line wallet that implements them.
- Live-apps wallet/bridge catalog (page is a JS app; fetch returned a shell).
- Whether `github.com/starkware-libs/starknet-privacy-starter-kit` moved or was renamed.
- Whether Wallet API `shadow_account_invoke` is live in shipped Ready/Xverse builds.
- x402 itself: no fetched STRK20 page mentions x402. Payment from shielded notes maps to a private transfer (Wallet API `transfer` or SDK `.transfer()`), plus registration of both parties.

## Rules to adopt (stk402 Approach 2: CLI+SDK + browser wallet)

1. Split the product on the key boundary: browser demo uses only the Starknet Wallet API; agent/CLI uses only the Privacy SDK with keys the agent owns.
2. Never put a consumer viewing key in the dapp, the browser demo, or logs. Ask the wallet to `strk20InvokeTransaction` / `strk20Balances`.
3. Pin `starknet@^10.4.0` from the npm `next` tag. Do not install unpinned `starknet` (lands on 10.0.x without STRK20).
4. Gate the demo on Wallet API `>= 0.10.3` via `supportedWalletApi`. Prompt Ready or Xverse. Do not assume Braavos or a generic Argent build speaks STRK20.
5. Treat `WalletAccountV6` as browser-only. Put the agent payer on Node.js `>= 24` with `createPrivateTransfers`.
6. Register both payer and recipient in the pool before any private transfer. Wallets register on first use; the CLI must `register()` / `autoRegister`.
7. Pass viewing keys to the SDK as `bigint`, never as hex strings.
8. For the CLI, set `provingProvider.url` and `discoveryProvider.url` from config. Do not guess mainnet endpoints. Until Day 0 publishes them, expect Sepolia-only self-prove or wallet-relayed mainnet.
9. Always prove at `currentBlock - 10`. Re-fetch after `waitForTransaction`. Never prove against `pre_confirmed`.
10. After a failed submit (`INVALID_NONCE`, revert, underpriced), call `invalidateProofNonceCache()` before rebuild.
11. Spread `proofDetails` only when `proofFacts` is non-empty. Always pass `tip: 0n` on v3 `account.execute`.
12. Shield in a separate earlier transaction from the x402 private transfer. Deposit is public (address, token, amount). The later note-to-note transfer is the private payment.
13. Wait for 10-block note maturity between shield and spend.
14. Do not claim that an x402 settlement hides deposit amounts, withdrawal amounts, timing, or DeFi helper amounts. Claim unlinkability of in-pool transfers.
15. Keep FPI deposit screening in the design. A self-hosted prover does not skip it. Prefer "user shields in Ready/Xverse, agent spends later" if the CLI cannot get a screening signature.
16. Enable OHTTP on CLI discovery (`{ ohttp: true }`, pin `publicKeyConfig` if you can). Do not send `k` in plaintext HTTP.
17. Do not persist `PrivateRegistry` across sessions. Rediscover notes each run.
18. For scoring, ship mainnet: public repo + license, live demo, 3-minute video, `strk20.json` with at least three successful pool-touching mainnet hashes. Apply once via `registry.json` PR.
19. Count depth as: shielded balance read, private transfer (the x402 pay), optional anonymizer. Do not bet the demo on Wallet API sub-accounts.
20. Keep an AVNU `sponsored_private` paymaster API key on the server (browser only runs the wallet prover). One `invoke` per pool tx; an x402 pay is a `transfer` unless the resource is itself an anonymizer.
