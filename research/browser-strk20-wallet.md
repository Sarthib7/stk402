# Can a visitor complete a STRK20 private transfer from the browser (Aug 2026)?

Sources:
- https://github.com/Akashneelesh/strk20-starter-kit (README, `package.json`, `SelectWallet.tsx`, `WalletAccountV6Tag.tsx`, `.env.example`)
- https://github.com/Akashneelesh/awesome-strk20 (README)
- https://strk20-by-example.org/ (wallet API, shield/deposit, transfer, proving, viewing keys, overview, private DeFi, AVNU swaps)
- https://starknet-js.com/docs/next/guides/account/walletAccount/ (get-starknet v6 / `WalletAccountV6`)
- https://docs.avnu.fi/docs/privacy/ and private-swap / paymaster pages
- https://www.starknet.io/blog/push-to-private/ and https://www.starknet.io/blog/privacy-live-on-starknet/
- https://strk20.starknet.io/build and https://strk20.starknet.io/rfp/privacy-wallet
- Live pages: https://starknet-privacy-starter.vercel.app/ , https://starknet-wallet-account.vercel.app/
- https://github.com/PhilippeR26/Starknet-WalletAccount (README)
- https://github.com/starkware-libs/privacy-bridge (README)
- https://github.com/starkware-libs/starknet-specs/releases/tag/v0.10.3 and PR 401 (fee-action)
- Ready X: https://www.ready.co/download-ready-x (Chrome listing still `argent-x`)

Date fetched: 2026-08-14

Provenance: REPORTED. Distilled from the sources above. Claims are the authors' unless marked VERIFIED. This session did not connect a wallet or submit a private transfer.

Author cluster: starter kit and awesome-strk20 are both Akashneelesh. Official protocol and wallet-API text comes from StarkWare / Starknet / starknet.js / AVNU.

## Verdict

Conditional yes for Ready X (the Argent X line). No, on public docs, for Braavos.

A visitor can complete an in-browser private transfer if all of these hold:

1. The installed wallet implements Wallet API `>= 0.10.3` STRK20 methods.
2. The dapp talks through `WalletAccountV6` / `strk20InvokeTransaction`, not the Privacy SDK.
3. The payer already has a mature shielded note, or they shield first and wait 10 blocks.
4. The recipient is registered in the pool.

stk402 cannot treat "connect Argent or Braavos" as enough. Connect is public signing. Private transfer needs a privacy-enabled wallet.

## VERIFIED (fetched this session)

- Starter kit is Next.js 16, React 19, TypeScript, `starknet` 10.4.0, `@starknet-io/get-starknet-discovery` 6.0.2, `@starknet-io/get-starknet-wallet-standard` 6.0.2, `@starknet-io/types-js` 0.10.3, zustand. Source: starter `package.json`.
- Starter has a custom wallet picker (`createStore` + modal). It sets `eip1193Adapters: []` to keep MetaMask out. It filters Braavos out of the pickable list. Empty-state copy names Ready or Xverse. Source: `SelectWallet.tsx`.
- Starter does in-browser STRK20 actions through `myWalletAccount.strk20InvokeTransaction(actions)`: shield (`deposit`), self-transfer (`transfer` to the connected address), unshield (`withdraw`), echo `privacy_invoke`, and `strk20Balances([])`. No viewing-key field in that component. Source: `WalletAccountV6Tag.tsx`.
- Live starter HTML at https://starknet-privacy-starter.vercel.app/ shows Shield / Send / Unshield / Echo / Balances and "Connect a Wallet" on Sepolia. Fetched 2026-08-14. No wallet was connected.
- Live Philippe demo at https://starknet-wallet-account.vercel.app/ shows "Test WalletAccountV6 of Starknet.js v10.7.0 with get-starknet v6.0.4 and Wallet API v0.10.4-beta.2". Fetched 2026-08-14.
- Ready download page labels the iOS app "ready-wallet-formerly-argent". Chrome/Firefox/Edge/Brave still install the `argent-x` extension id `dlcobpjiigpikoobohmabehhmhfoodbb`. Source: https://www.ready.co/download-ready-x .
- `get-starknet-discovery` on the develop branch is version 6.0.4. Source: that package.json.
- Citadel search returned HTTP 401. Brave Search returned 422 invalid token. GitHub MCP was in error state.

## REPORTED (source claims, not executed here)

### Wallets that can do STRK20 from a dapp

- starknet.js next WalletAccount page: "As of 2026-08, the Ready and Xverse wallets support the STRK20 wallet API."
- awesome-strk20 Wallets section: Ready has in-wallet privacy live on mainnet and is the current Wallet API start path with starknet.js 10.4.0. Xverse has in-wallet privacy live; dapp-facing Wallet API "is in progress".
- Starknet "Push to Private": "Ready extension + starknet.js v10.4.0 are the current start path, with Xverse’s Wallet API rolling out."
- Starknet launch post (2026-07-14): privacy starts in Ready X and Xverse (mobile and desktop). Private transfers happen inside those wallets. avnu routes private swaps and gasless private flows through its paymaster.
- AVNU privacy docs: STRK20-capable wallets are "Ready and Xverse today". Probe with `walletV6.supportedWalletApi` and `compareVersions(v, '0.10.3')`.
- Braavos is not named as STRK20-capable in those lists. The starter kit excludes it from the picker on purpose.
- Philippe's WalletAccount README still says signatures live in "a browser wallet (as ArgentX or Braavos)". That is the older public `WalletAccount` path, not the STRK20 method set.

Contradiction to keep: strk20.starknet.io/build says "No new wallets" and "existing Starknet wallets via native account abstraction". The Wallet API pages name only Ready and Xverse. Both can be true if Braavos can sign public txs but cannot run `wallet_strk20InvokeTransaction` yet.

### Starter kit behavior (from README and code comments)

- README: "all through the user's wallet, never touching a viewing key." Needs a privacy-enabled wallet (Ready) on Sepolia or Mainnet.
- README: "Ready wallet works today (Xverse's Wallet API is landing); the app degrades gracefully for others."
- Send tab is a self-transfer of 1 STRK to the connected address, not a recipient-address form. The Wallet API action type does support an arbitrary `recipient`.
- Shield amount is hardcoded 10 STRK. Unshield is 1 STRK. Marked DEMO.
- Proof wait budget in the UI: `waitForTransaction` retries 400 times at 3000 ms (about 20 minutes). Comment: privacy-pool txs verify a STARK proof on-chain.

### Where proving happens

Two routes, do not collapse them.

Wallet API route (what a visitor dapp should use): the connected wallet "discovers notes, builds the transaction, generates the proof, and submits it." The dapp only sends `STRK20_ACTION[]`. starknet.js: "The wallet holds the private state and generates the proof." AVNU: proof is built "client-side" by the wallet or the Privacy SDK, then the paymaster relays.

SDK / wallet-builder route: `ProvingServiceProofProvider` posts a signed invocation to `PROVING_SERVICE_URL`. The service "executes it in a virtual Starknet environment and returns a STARK proof." Self-host is the sequencer `starknet_transaction_prover` crate. Push to Private cites about 29 seconds on a 12-core / 46 GiB machine. That is infrastructure data, not a phone number.

Starknet consumer blog: "generated client-side." SDK docs: hosted proving service. Both stand. For stk402 the Wallet API path means: proving is inside the wallet process, which may itself call a hosted prover. The dapp must not run a prover in the browser.

Deposit screening (FPI signature) is on-chain on every proving route, including self-host.

`provingBlockId` must be `currentBlock - 10` (note maturity plus reorg buffer). Notes mature 10 blocks after creation.

### Viewing keys

Wallet API / normal dapp: viewing key stays in the wallet. Do not ask the user to paste it. Starter kit has no viewing-key input.

SDK route: `viewingKeyProvider.getViewingKey` must return a bigint. The integrator holds `k`.

Privacy Bridge: all keys derive from one wallet signature. Only the read-only viewing key may be persisted.

Protocol: public viewing key `K` is registered on-chain once (`SetViewingKey`). Private `k` is also encrypted to an auditor public key and stored on-chain (compliance copy). That is not a dapp paste box.

### Paymaster / browser

Three fee paths:

1. `strk20InvokeTransaction(actions)`: wallet submits and "adds the fee action by itself". Spec PR 401: that fee action is a withdraw covering paymaster/relayer cost. Use this for a visitor who just wants to pay.

2. `strk20PrepareInvoke(actions)`: wallet does not add a fee withdraw. Whoever submits pays. Used to sponsor, or to hand a proof to AVNU. Double-fee bug was observed on mainnet when both sides added a fee (5 STRK swap charged 2x 4 STRK).

3. AVNU `sponsored_private`: relayer pays L2 gas; user pays a pool fee from the shielded balance. Endpoints: `https://starknet.paymaster.avnu.fi` and Sepolia twin. Needs a Portal API key. Docs: do not put that key in browser JS. Split: `buildPrivateSwapFee` / `submitPrivateSwap` on a server; `createStrk20WalletProver(walletAccount)` in the page.

AVNU documents private swaps in the SDK. Paymaster index also says "swaps and transfers" from a shielded balance. A generic private transfer via `paymaster_executeTransaction` + `apply_action` is specified. This session did not run it.

Starter kit uses path 1 only (`strk20InvokeTransaction`). It does not call AVNU paymaster APIs.

Public gas from the user's transparent account links the shield/unshield edge. Private in-pool movement plus a pool-fee withdraw to the paymaster is the documented way to avoid paying L2 gas from the main address.

### Public demos

- Starter live demo: shield / send / unshield in the browser, wallet picker.
- Philippe WalletAccount demo: Wallet API v0.10.4-beta.2 test harness.
- In-wallet: Ready X and Xverse one-click shield (Starknet launch post). Not a dapp.
- Privacy Bridge ships `apps/bridge` as a demo web app. No public demo URL was found in the README this session.
- AVNU app: "Private swaps are live on app.avnu.fi" (AVNU updates page). Swap, not x402 pay.
- STRK20 RFP "Privacy Wallet" still asks for an Umbra-style consumer UI. That is a request for startups, not a shipped product.

### Gap: connect-and-shield vs pay an x402 invoice privately

Shield (Wallet API `deposit`): public ERC-20 leg, FPI screening, then a private note to self. Timing and amount of the deposit stay visible. Then 10-block maturity before spend.

Private transfer (Wallet API `transfer`): in-pool note spend to a registered recipient. Sender, recipient, amount, token hidden inside the pool. Needs a mature note and a registered counterparty.

Pay an x402 invoice privately adds all of this, which none of the demos implement:

- Invoice recipient (merchant or facilitator) must be pool-registered, or you need an escrow/anonymizer helper for unregistered payees.
- x402 verification today is built around a public Starknet tx (Foundation exact scheme). A private pool tx is a different receipt shape. Facilitator cannot "see the payer address on Voyager" and still call it private.
- If the visitor only holds public STRK, they must shield first. That public deposit can still link "this address entered the pool" to a later private pay, depending on timing and anonymity set.
- Proof + confirmation is slow vs a normal API 402 round trip. Starter UI budgets minutes. Push to Private self-host benchmark is about 29 s on a server, not a laptop.
- Agent/x402 payers are often headless. Wallet API is a browser wallet prompt. A server agent needs the SDK route and then holds a viewing key.
- Sub-accounts: builder overview says SDK `subaccounts` exists in Privacy SDK `0.14.3-rc.4`, Wallet API route still pending in types-js 0.10.3. starknet.js *next* WalletAccount page already documents `shadow_account_invoke`. Do not assume 10.4.0 / types 0.10.3 expose it.
- No starter, AVNU page, or live demo wires HTTP 402 -> STRK20 transfer -> payment receipt.

## NOT DETERMINED

- Whether this session's Ready X / Argent X binary actually completes `wallet_strk20InvokeTransaction` on Sepolia or mainnet (no wallet was connected).
- Whether an un-updated Argent X install (pre-Ready STRK20) still appears in get-starknet discovery and then fails the STRK20 call.
- Braavos STRK20 roadmap. Absence from lists is not a Braavos changelog.
- Exact proving backend inside Ready or Xverse (extension WASM vs hosted URL).
- Whether AVNU `apply_action` paymaster will relay a plain private transfer (not a swap) for a third-party dapp without extra whitelist.
- Privacy Bridge demo deploy URL.
- End-to-end time for shield then pay on mainnet.
- Whether types-js / Wallet API 0.10.4-beta.2 (Philippe demo) is what Ready ships today vs 0.10.3.
- npm `latest` vs `next` for `starknet` and get-starknet 6.1.0 GA (PR 319 exists; publish status not checked).

## Rules to adopt for stk402

1. Use the Wallet API route for any browser visitor. Never put a viewing key in the dapp.
2. Pin `starknet@^10.4.0` (npm `next` until `latest` actually carries STRK20). Bare `npm install starknet` is still 10.0.x per STRK20-by-example.
3. Pin get-starknet v6 packages by version (`@starknet-io/get-starknet-discovery` and `wallet-standard`, 6.0.2 in the starter, 6.0.4 on develop).
4. Probe `walletV6.supportedWalletApi` for `>= 0.10.3` before showing Shield or Pay privately. Catch wallets that throw on the probe.
5. Name Ready X as the supported visitor wallet. Treat Argent X as the same extension line only after the probe passes.
6. Do not promise Braavos private pay until that wallet is on the STRK20 list and the probe passes.
7. Exclude Braavos from a "private pay" picker, or show it as connect-only (public). Copy the starter's explicit filter rather than hoping it degrades.
8. Call `strk20InvokeTransaction` for visitor-submitted private transfers so the wallet owns the fee action.
9. If stk402 sponsors gas, use `strk20PrepareInvoke` and add exactly one fee withdraw. Do not also let the wallet add one.
10. Keep AVNU Portal paymaster API keys on the server. Browser may prove; server may `paymaster_executeTransaction`.
11. Require a shielded, mature note before invoice pay. If the user must shield in-session, wait 10 blocks (and re-fetch `provingBlockId`) before the private transfer.
12. Recipients of private x402 pays must be pool-registered, or pay through an escrow / `privacy_invoke` helper. Do not assume a public Starknet address can receive an in-pool transfer.
13. Do not treat a public Voyager hash of a pool interaction as the x402 receipt. Define a private receipt (nullifier / note id / wallet-returned tx hash plus server-side verify that does not deanonymize).
14. Tell the UI that proof generation is slow. Do not look frozen.
15. Detect capabilities per action (shield vs transfer vs swap). Wallet support varies.
16. Leave placeholders `"OPEN"`, `"${poolAddress}"`, `"${openNoteIds[0]}"` as literal strings. Never `num.toHex` them.
17. Do not build the Privacy SDK into the visitor page. SDK is for stk402's own wallet, facilitator, or agent runtime.
18. If an agent pays without a browser wallet, that is a different product surface (SDK + hosted prover + viewing key in that runtime). Do not mix it into the visitor flow.
19. Treat deposit screening failures as protocol, not a bug in your calldata.
20. Verify Ready, starknet.js, types-js, and pool addresses on the target network before launch.

## Least confident decisions

1. Mapping "visitor with Argent" to Ready X STRK20. Extension id is still argent-x; STRK20 support is claimed for Ready, not verified in this session.
2. Whether Wallet API 0.10.4-beta.2 shadow accounts can be used in stk402, or whether types-js 0.10.3 is still the ceiling.
3. Whether AVNU will relay a non-swap private transfer for an x402 facilitator without a custom anonymizer.
4. How much of the payer's identity leaks if they shield immediately before paying an invoice (timing).
5. Whether Xverse dapp Wallet API has landed since awesome-strk20 said "in progress".
