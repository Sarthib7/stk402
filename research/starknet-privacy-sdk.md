# Starknet Privacy SDK: facts for browser + Node agents (STRK20)

**Source:** https://github.com/starkware-libs/starknet-privacy  
**Local vendor:** `stk402/vendor/starknet-privacy` @ `66e3caae` (`PRIVACY-0.14.3-RC.5`, sdk `0.14.3-rc.5`)  
**Date:** 2026-08-14  
**Provenance:** REPORTED (local file reads + remote root README fetch; not runtime-verified)

## TLDR

Two TS packages: **sdk** (`@starkware-libs/starknet-privacy-sdk`) proves private pool ops; **client** (`@starkware-libs/starknet-privacy-client`) is the STRK20 / dapp / paymaster layer. SDK targets browser + Node (explicit `./browser` bundle; needs WebCrypto via Node >= 24 for OHTTP). Wallet submits `apply_actions` + proof (ideally via AVNU `sponsored_private` paymaster). Deposit txs use `invoke_and_apply_action` (user-signed `approve`); later private transfers use `apply_action` only. Viewing key stays inside prover (`ViewingKeyProvider` / passphrase KDF); dapp never receives it.

## Remote README (fetched)

Root README (main): privacy pool protocol. Wallet → SDK → discovery + proving → on-chain pool. Paymaster recommended so fee payer is not the private user. Compatibility row: SDK tag `PRIVACY-0.14.3-RC.2` (local checkout is newer RC.5). Repo map lists `sdk/`, contracts, discovery, demo; **does not list `client/`** (present locally).

## Package layout

| Package | npm name | Role |
| --- | --- | --- |
| `sdk/` | `@starkware-libs/starknet-privacy-sdk` | Core: `createPrivateTransfers`, discovery, proving, builder, crypto |
| `client/` | `@starkware-libs/starknet-privacy-client` | Thin dapp layer: STRK20 actions, `SdkWallet`, `AvnuPaymaster`, viewing-key KDF, shadow accounts |

Client depends on sdk via `file:../sdk` (`client/package.json:50`). Client states public API is incremental (`client/README.md:7-8`).

SDK exports (`sdk/package.json:13-33`): `.`, `./testing`, `./browser`, `./browser/testing`, `./abi`.

## Runtime: browser vs Node

1. **SDK is dual-runtime.** `build:browser` uses esbuild `platform: "browser"` (`sdk/scripts/build-browser.ts:23-37`). Package export `./browser` points at `dist/browser/starknet-sdk.js` (`sdk/package.json:22-25`).
2. **Node prerequisite for OHTTP:** sdk README requires **Node.js >= 24** for `ohttp-ts` WebCrypto (`sdk/README.md:25`). Root README still says Node 20+ (`README.md:96`). Prefer >= 24 if using OHTTP.
3. **No DOM assumption in core path.** Randomness uses `starkCurve.utils.randomPrivateKey` and `crypto.getRandomValues` (`sdk/src/utils/crypto.ts:80-93`). Logging tolerates missing Node `process` / AsyncLocalStorage (`sdk/src/utils/logging.ts`).
4. **Node-only in testing:** `Devnet` uses `fs.readFileSync`; excluded from `./browser/testing` (`sdk/src/testing/browser.ts:1-3,45`).
5. **Client:** uses `fetch`, starknet.js, Poseidon via `@noble` / starknet; no fs in production client sources. Suitable for browser or Node agent if WebCrypto + fetch exist.
6. **OHTTP key pin example** in sdk README uses `readFileSync` (`sdk/README.md:885-887`). That is a Node convenience for loading pinned bytes, not a hard SDK fs dependency.

## How the pieces work

### Deposit / transfer / withdraw (pool)

Contract phases (order enforced): SetViewingKey → OpenChannel → OpenSubchannel → Deposit → UseNote → CreateEncNote/CreateOpenNote → Withdraw → InvokeExternal (`packages/privacy/README.md` client action phases table).

SDK fluent builder: `register`, `with(token).deposit|transfer|withdraw`, `setup`, `invoke`, `surplusTo`, `execute` (`sdk/README.md:231-317`).

On-chain submit call from SDK is **`apply_actions`**, not `execute_actions` (sdk README wording is stale). Calldata = server-action span (proof.output without class_hash) + screening Option suffix (`sdk/src/internal/private-transfers.ts:102-136`).

### Proving

SDK signs a proof invocation (`compile_actions` path in factory), sends to proving service, gets `Proof` (`data`, `output`, `proofFacts`, optional screening `additionalData`) (`sdk/src/interfaces.ts:90-101`). Prover reads **finalized** state; sequencer wants base block ~10 blocks behind tip (`sdk/README.md:124-151`).

### Discovery

- `ContractDiscoveryProvider`: direct RPC (dev).
- `IndexerDiscoveryProvider`: HTTP discovery service (prod); optional OHTTP (`sdk/README.md:213-225`, `849-930`).

`discoverNotes` / `discoverChannels` / `discoverRequirement` / history via indexer (`sdk/README.md:530-624`).

### Paymaster (client STRK20 path)

Fee mode: `sponsored_private` with `poolFeeToken` (`client/src/paymaster.ts:20-25`). Fee quote is always a **`withdraw`** of fee token to paymaster recipient (`client/src/paymaster.ts:27-33`, `sdk-wallet.ts:70-78`).

RPC: `paymaster_buildTransaction` then `paymaster_executeTransaction` (`client/src/paymaster.ts:130-168`). Wire types: `apply_action` vs `invoke_and_apply_action` (`client/src/paymaster.ts:131-138`).

## Viewing key: handling and security model

1. SDK takes `ViewingKeyProvider.getViewingKey()` (`sdk/src/interfaces.ts:116-118`). Keys must be in `[1, MAX_VIEWING_KEY]` where `MAX_VIEWING_KEY = curve.n / 2` (`sdk/src/interfaces.ts:20-24`).
2. Client default: `passphraseViewingKeyProvider(passphrase, address)`. Derives via Poseidon: salt = account address, **1000 rounds**, then canonicalize below half-order (`client/src/viewing-key.ts:20,51-84`). Lazy + memoized in memory; comment: not written to disposable storage (`client/src/viewing-key.ts:72-76`).
3. `CorePrivateTransfersProver` owns passphrase; viewing key never returned to dapp (`client/src/strk20-prover.ts:26-28,54-64`; `client/src/interfaces.ts:81-85`).
4. Discovery/proving OHTTP: viewing key not in plaintext outside OHTTP layer when enabled (`sdk/README.md:852`). OHTTP alone does not authenticate gateway; pin `publicKeyConfig` + HTTPS (`sdk/README.md:932-941`).
5. On-chain register publishes viewing key slot; wait ~10 blocks after account deploy before register (`sdk/README.md:176`).

## Paymaster calldata: deposit-containing vs deposit-free

This is the practical "first funding vs later private ops" split (not "first transfer forever"):

| Case | Paymaster build/execute kind | Extra public calls | Fee |
| --- | --- | --- | --- |
| Actions include **deposit** | `invokeAndApplyAction` | ERC-20 `approve(pool, amount)` as user (typedData + `signMessage`) | Fee `withdraw` folded into proven actions |
| **No deposit** (transfer / withdraw / register-only private path) | `applyAction` | None; paymaster is executing account | Same fee `withdraw` |

Logic: `SdkWallet.strk20InvokeTransaction` (`client/src/sdk-wallet.ts:49-99`). Approve construction (`client/src/sdk-wallet.ts:118-127`). Why: under `apply_action` the executor is the paymaster, so user `approve` must ride the signed invoke (`client/src/sdk-wallet.ts:28-33`).

Proven payload to paymaster: `apply_actions` call (selector + hex calldata) + `proof` + `proof_facts` (`client/src/paymaster.ts:58-68`, `sdk-wallet.ts:80-84`).

SDK-level gasless recipe (manual, without client): simulate with dummy withdraw → paymaster quote → rebuild with real fee withdraw → `execute` (`sdk/README.md:492-526`).

## Agent / browser end-to-end APIs

### A. Client path (STRK20 agent / dapp)

1. Build `CorePrivateTransfersProver` with signer, address, passphrase, node, discovery, prover, pool, shadow anonymizer, `PrivacyStorage` (`client/src/strk20-prover.ts:31-41`).
2. Build `AvnuPaymaster` + `SdkWallet` (`client/src/sdk-wallet.ts:15-21`, `client/src/paymaster.ts:114-128`).
3. `createPrivacyClient({ wallet, userAddress, node, shadowAccountAnonymizerAddress })` (`client/src/client.ts:82-84`).
4. Fluent: `client.build().with(STRK).deposit|transfer|withdraw(...).submit()` (`client/src/builder.ts:53-88`, `131-159`).
5. Or low-level: `client.submit(strk20Actions[])` (`client/src/client.ts:35-58`).

`CorePrivateTransfersProver.prove` auto: register, setup, naive note select, refresh discovery; persists registry after real prove (`client/src/strk20-prover.ts:71-89`).

### B. SDK path (direct)

1. `createPrivateTransfers({ account, viewingKeyProvider, provingProvider, discoveryProvider, poolContractAddress, shadowAccountAnonymizerAddress? })` (`sdk/src/factory.ts:91-119`).
2. `transfers.build(options).with(token)...execute()` → `{ callAndProof, registry, warnings }` (`sdk/README.md:626-636`).
3. Wallet / paymaster submits `callAndProof` (entrypoint `apply_actions`).

### Sequencing rule (both paths)

After any private (or state-affecting transparent) tx: wait until `latest - lastTxBlock >= 10` before next prove (`sdk/README.md:132-166,198`). Notes carry `created` for maturity (`sdk/src/interfaces.ts:77-80`).

## Known limitations / TODOs / test-only

1. Client API under active development (`client/README.md:7-8`).
2. `SdkWallet.estimateInvokeFee` rejects: not implemented (`client/src/sdk-wallet.ts:111-115`).
3. `SdkWallet.executeWithProof` rejects (surrounding pre/post calls unsupported on this path) (`client/src/sdk-wallet.ts:102-108`).
4. Fee quote TODO: simulate for exact amount once AVNU exposes it (`client/src/sdk-wallet.ts:67-68`).
5. Live AVNU paymaster e2e against real wire format: not in suite; parked notes (`client/docs/avnu-paymaster-local-devnet.md:1-8`).
6. Proving: `latest-verifiable` block id TODO (`sdk/src/interfaces.ts:318`; `sdk/src/internal/proving-service.ts:103`).
7. Note select: no `exact` strategy yet (`sdk/src/internal/compiler.ts:714`).
8. Indexer sync: FIXME on spent-note filtering (`sdk/src/internal/indexer-discovery.ts:201`).
9. History attribution caveats for multi-user batches / withdrawals (`sdk/README.md:616-624`).
10. Screening: optional sidecar; attestation trailing calldata (`sdk/src/internal/screening-calldata.ts:1-12`). Test helpers under `sdk/.../testing/screening-*`.
11. Devnet / MockProofProvider / Mocknet: test-only (`sdk/README.md:660-680`; Node Devnet excluded from browser testing export).
12. STRK20 type shims in client until starknet-types ships them (`client/src/interfaces.ts:15-19,36-38,45-58`).
13. Remote root README omits `client/`; compatibility matrix tag lags local RC.5.
14. sdk README still says wallet sends to `execute_actions` (`sdk/README.md:632`); code uses `apply_actions`.

## Rules to adopt (for a private-paying agent)

1. Pin sdk + discovery + prover + pool class hashes to one compatibility row; do not mix RC tags.
2. Prefer **client + SdkWallet + AvnuPaymaster** for STRK20 browser/Node agents; use raw sdk only if you own submission.
3. Treat viewing key as secret: passphrase in agent vault; never log `getViewingKey()` output.
4. Use `passphraseViewingKeyProvider` or equivalent KDF (address-salted); do not reuse raw weak passphrases across accounts.
5. Implement `PrivacyStorage` (durable registry) for agents; refresh discovery if storage empty or after reorg.
6. Prefer `IndexerDiscoveryProvider` + OHTTP (`ohttp: true` or pinned `publicKeyConfig`) in production.
7. Pin OHTTP key config when possible; always HTTPS for discovery/prover URLs.
8. Prove only against finalized / `provingBlockId` (e.g. `latest - 10`), never `pre_confirmed`.
9. Use `pre_confirmed` only for balance UI, not for building txs.
10. After every accepted private tx, record `block_number` and gate next prove on depth ≥ 10.
11. Same 10-block gate after transparent top-up before deposit, and after deploy before register.
12. Deposit path: expect `invoke_and_apply_action` + user `approve` signature; later transfers: `apply_action` only.
13. Always fold paymaster fee as a **withdraw** into the same proven action set; never pay fee with a separate public sender if privacy is the goal.
14. Hex-encode paymaster calldata and signatures (`toPaymasterCall` / `normalizeSignature`); decimal felts fail AVNU.
15. Prefer `autoDiscover: refresh`, `autoSetup: true`, `autoRegister: true`, `autoSelectNotes: "naive"` for agents (matches `CorePrivateTransfersProver`).
16. Call `discoverRequirement(recipient, token)` before first transfer to a new counterparty.
17. Do not persist optimistic registry across restarts without discovery; treat registry as session cache unless storage is intentional.
18. Surface `warnings` (`USER_LINKAGE`) to the operator; do not ignore linkage warnings.
19. Cap concurrent private txs per account: sequential prove → wait → prove.
20. For fee UX: run `simulate` / client `simulate()` where supported; do not rely on `SdkWallet.estimateInvokeFee` yet.
21. If using screening pools, expect attestation suffix on `apply_actions` calldata; keep interceptor aligned with prover tag.
22. Shadow account / anonymizer address required for shadow-account invoke flows; omit only if unused.
23. Browser: ship `sdk` browser bundle or ESM that polyfills WebCrypto; do not import `sdk/testing` Devnet path.
24. Node agents: Node >= 24 if OHTTP enabled.
25. Re-check entrypoint name against code (`apply_actions`); ignore stale `execute_actions` docs.

## Least confident decisions

1. Whether production agents should prefer native get-starknet v6 STRK20 wallets over `SdkWallet` once wallets ship full STRK20 (client designed for both).
2. Whether `poolFeeToken = STRK` avoids AVNU price-oracle egress (noted as unverified in paymaster doc).
3. Exact mainnet/sepolia deployed pool + anonymizer addresses for your target network (class hashes in root README; addresses not locked here).
