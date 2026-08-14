# Is a paymaster required for stk402?

Date: 2026-08-14

Provenance: mix of VERIFIED (this session: local files, Day 0 in-repo copy) and REPORTED (prior research notes). Untagged claims are not allowed.

## Verdict

AVNU (or any paymaster) is **not required** to settle x402 from STRK20 notes, and **not required** for hackathon score hashes. It **is required** if the claim is "L2 tx sender is not the payer." Direct account submit is enough for (1) and (3). It is not enough for (2).

Grill Q11 rec: **A**. Direct submit OK if documented. See §5.

## Evidence read (this session)

- VERIFIED: `stk402/EVIDENCE.md` (Sepolia direct pay)
- VERIFIED: `stk402/README.md` (Devnet paymaster notes; privacy scope)
- VERIFIED: `src/private402/agent-payer.ts`, `payer-runtime.ts`, `payer-config.ts`
- VERIFIED: `vendor/starknet-privacy/client/src/sdk-wallet.ts`, `paymaster.ts`
- VERIFIED: `test/devnet/paymaster-private-payment.test.ts`
- VERIFIED: `docs/MAINNET-DAY-0.md` (this hackathon repo copy)
- VERIFIED: `README.md` scoring table
- REPORTED: `research/browser-strk20-wallet.md`, `strk20-official-docs.md`, `starknet-privacy-sdk.md`, vendor `client/docs/avnu-paymaster-local-devnet.md`

## 1. Three necessities (keep separate)

### Functional (settle x402 privately on Sepolia / mainnet)

**No. Paymaster is not required.**

VERIFIED (`EVIDENCE.md:35-55,75`): Sepolia payment `0x22864d...2edc` returned HTTP 200, settlement success, SHA-256 of `stk402`. "No paymaster submitted this transaction." Direct `account.execute`.

VERIFIED (`agent-payer.ts:70-71,263-332`): `paymaster` is optional on `Strk20ReceiptCreator`. Direct path: `approve` + `apply_actions`, `estimateInvokeFee`, `account.execute`. Paymaster path: `buildTransaction` (`applyAction`) then `executeTransaction`.

VERIFIED (`payer-config.ts:42-44,180-182` + `payer-runtime.ts:92-119`): **current CLI** always loads `STK402_PAYMASTER_URL`, API key, and max fee, and always constructs `AvnuPaymaster`. That is a product choice after the Sepolia run. Protocol settlement does not need it. Funding still has no paymaster (`payer-runtime.ts:164-193`).

Mainnet agent settle is blocked on hosted proving / discovery URLs (Day 0), not on a paymaster. AVNU is one `Paymaster` adapter. The Devnet test injects a fake.

### Privacy (hide submitter on the L2 tx)

**Yes, some relayer or paymaster is required. AVNU is not unique.**

Note privacy (amounts, parties, spent notes to a public observer without a viewing key) comes from the pool. Direct Sepolia still encrypted notes and omitted recipient/amounts from events (`EVIDENCE.md:67-69`). That is not the submitter question.

VERIFIED (`EVIDENCE.md:65,75`): the live direct tx public calldata contains the payer account, pool, STRK `approve`, `apply_actions`, and the recipient in `ServerAction::Append`. Payer is the L2 sender.

VERIFIED (`README.md:26-31` + `paymaster-private-payment.test.ts:210-245`): on Devnet, after a pre-opened channel, a later paymaster submit uses sender `env.admin` (the substitute), not Alice. Later calldata omits Alice and Bob felts. The **first** setup tx still contains Bob in calldata. README: "these passing tests do not prove live paymaster support" (`README.md:196`). Substitute account, test proof facts.

VERIFIED (Day 0, `docs/MAINNET-DAY-0.md:84`): "private transactions are submitted by rotating shared relayers, not by your wallet. The sender address on the transaction will be a relayer."

REPORTED (`strk20-official-docs.md:77`): "A Paymaster can decouple the submitter's address from the transaction."

Caveats that survive a paymaster:

- First channel `Append` can still put the recipient in calldata unless the channel is already open (`agent-payer.ts:189-193,225-226`: paymaster path requires `SetupRequirement.Ready`, `autoSetup: false`).
- Fee is a pool **withdraw** to the paymaster recipient (`paymaster.ts:20-33`, `sdk-wallet.ts:70-78`). Withdrawals are public ERC-20 legs (Day 0 / what-is-strk20).
- Paymaster operator sees the proven call and can link its customer (`README.md:31`).
- Seller still sees invoice, receipt, and tx (`EVIDENCE.md:77`).

NOT DETERMINED: live AVNU `apply_action` for a third-party **transfer** (not a swap), on Sepolia or mainnet. Vendor e2e mocks the paymaster (`avnu-paymaster-local-devnet.md:1-8`).

### Score / privacy-claim copy

**No for eligibility. Yes as a claim gate.**

VERIFIED (`README.md:96-125`): score needs three successful mainnet txs that touched the STRK20 pool, a demo, a 3-minute video. No paymaster field. Integration depth names shielded balances, private transfers, anonymizer, SDK, stealth accounts. Not AVNU.

VERIFIED (Day 0:86): eligibility uses `user_addr` in `Deposit`, not tx sender, because senders may be relayers.

Day 0: overclaiming is the fastest way to lose integration-depth points.

REPORTED (`strk20-official-docs.md:191`): the universal private payment rail RFP assumes Avnu paymaster. Do not make scoring depend on that unless organizers confirm.

Direct pool-touching txs count. Do not write "L2 sender hidden" until a live relayer/paymaster tx is measured.

## When direct account submit is enough

1. x402 functional settle (Sepolia VERIFIED).
2. Score hashes (any successful pool-touching tx).
3. Note-level confidentiality to public observers (pool, not paymaster).
4. First payment that must `Append` a channel (recipient felt is public anyway).
5. Deposit / funding: user must `approve` as token owner. Paymaster then uses `invoke_and_apply_action` with a user signature (`sdk-wallet.ts:28-33,53-65`). The user still appears on that public leg.

Direct submit is **not** enough if copy or judges are told the Voyager sender is a relayer.

## 2. Agent path recommendation

Keep **direct submit as the proven Sepolia settle path**. Treat paymaster as an optional later-transfer privacy upgrade, not as the settle gate.

Do now: document the Sepolia caveat (payer visible; first `Append` visible). Do not require a live AVNU key to demo HTTP 200.

Do next (if claiming hidden submitter): one live Sepolia later-transfer through a real paymaster, then inspect `sender_address` and calldata the same way the Devnet test does. Until that exists, current CLI `loadPayerConfig` requiring paymaster env is stricter than evidence.

Do not: block mainnet score on AVNU. Agent mainnet still needs prover/indexer URLs or a self-host.

## 3. Browser Wallet API path recommendation

Do **not** call AVNU from the page. Keep any Portal API key on a server (`browser-strk20-wallet.md:101,157`; official-docs rule 20).

Use `strk20InvokeTransaction(actions)` so the wallet adds the fee withdraw (spec PR 401). Starter kit uses this path only and does not call AVNU (`browser-strk20-wallet.md:97,105`).

REPORTED: Day 0 relayers plus "wallet adds the fee action" imply Ready may already submit via a relayer. This session did not connect a wallet or read a Ready mainnet sender on Voyager. Treat that as NOT DETERMINED.

If stk402 ever sponsors gas: `strk20PrepareInvoke` plus **exactly one** fee withdraw. A double fee was observed on mainnet when both wallet and sponsor added one (`browser-strk20-wallet.md:99`).

SdkWallet in the vendor client **requires** a `Paymaster` (`sdk-wallet.ts:15-21`). That is the non-Wallet-API client. Browser visitors should not use it.

## 4. Missing measurements (only if claiming X)

If claiming "paymaster required for X", still missing:

| Claim X | Missing measurement |
| --- | --- |
| Live AVNU hides Sepolia/mainnet payer | Submit `apply_action` transfer via hosted `https://starknet.paymaster.avnu.fi` (or Sepolia twin). Read `sender_address` on Voyager. |
| Ready Wallet API hides visitor | Connect Ready, `strk20InvokeTransaction` transfer, compare sender to connected address. |
| Later x402 pay hides recipient | Repeat Devnet calldata checks on a **live** later-transfer (channel already open). |
| AVNU will relay a non-swap transfer for stk402 | Third-party `paymaster_executeTransaction` without swap/anonymizer whitelist. |
| Mainnet agent paymaster | Same as row 1, after proving/discovery URLs exist. |

Blind spot: inspecting one Voyager sender does not prove rotating-relayer anonymity-set size.

## 5. Grill Q11

Question: "Paymaster required for score demo?"

- A. No (direct submit OK if documented)
- B. Yes for any "private submitter" claim
- C. Devnet/Sepolia paymaster proof enough; mainnet optional

**Pick A.** Score demo does not need a paymaster. Direct Sepolia 200 is VERIFIED. Mainnet hashes can be Ready / strk20.app pool txs.

B is a **README claim gate**, not a score gate. If copy says "submitter hidden", you need a measured relayer/paymaster tx. That is independent of whether the three hashes exist.

Do not pick C as written. Sepolia paymaster is **not** proven. Devnet used a local substitute (`README.md:196`). Calling that "Sepolia paymaster proof" would be false.

## Least confident decisions

1. Whether Ready `strk20InvokeTransaction` already uses Day 0 relayers (REPORTED docs vs NOT DETERMINED live sender).
2. Whether hosted AVNU will execute stk402 `applyAction` transfers without extra allowlisting.
3. Whether judges treat a payer-visible pool invoke as weaker "integration depth" even when docs are honest (not in the score table).
