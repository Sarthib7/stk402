# Privacy claims stk402 can honestly make

Date: 2026-08-14
Scope: (a) agent CLI/SDK/MCP paying an x402 invoice from STRK20 notes; (b) a browser Wallet API visitor paying the same invoice.
Allowed write: this file only.

Provenance: VERIFIED = this session read the cited file or fetched the URL. REPORTED = prior `stk402/research/*.md` (not re-executed). INFERRED = follows from cited sources. NOT DETERMINED = no measurement.

## Recommended 2-sentence public claim (hackathon README)

stk402 settles an x402 invoice with a STRK20 note-to-note transfer so a public observer without a viewing key cannot read the paid amount from the pool receipt. Deposits, the seller, and a direct L2 sender stay visible unless a later paymaster or Wallet API relayer actually submits the transfer.

Use that pair as-is. Do not prepend "private payments" or "unlinkable x402".

## SAFE claims

### Shared protocol (both paths, if they really do a note-to-note `transfer`)

1. VERIFIED ([what-is-strk20.md](https://strk20-by-example.org/what-is-strk20.md), [notes-and-nullifiers.md](https://strk20-by-example.org/notes-and-nullifiers.md)): STRK20 is a note pool, not a mixer. In-pool notes store encrypted amounts. Public ERC-20 deposit and withdraw legs stay visible (depositor/recipient, token, amount, timing).
2. VERIFIED (`EVIDENCE.md` Privacy audit; `vendor/.../objects.cairo` `Note`): Sepolia payment `0x22864d...2edc` receipt emitted one public nullifier and two encrypted-note records. It did not emit the recipient address or either output amount. The paid amount is not a plaintext server-action field.
3. VERIFIED ([Day 0](https://raw.githubusercontent.com/starkience/strk20-hackathon/main/docs/MAINNET-DAY-0.md)): "Claim identity privacy; never claim amount privacy for swaps." Same rule for any unshield or anonymizer helper with public amounts.
4. VERIFIED ([compliance.md](https://strk20-by-example.org/compliance.md)): FPI screens every deposit. Self-hosted proving does not skip it. Registration encrypts `k` to an auditor key. An auditor with that user's viewing key can open channels, decrypt amounts, and match nullifiers.
5. VERIFIED (`EVIDENCE.md`; `vendor/.../actions.cairo` `AppendInput`): first sender-recipient channel writes `ServerAction::Append.recipient_addr` in public calldata. Sepolia payment included the configured recipient once. Official [viewing-keys.md](https://strk20-by-example.org/viewing-keys.md) says an observer "learn[s] that a channel was opened, not by whom or to whom." Measured calldata contradicts "not to whom" for the first `Append`. Prefer the measurement.
6. VERIFIED (`README.md` privacy scope; `src/private402/private-envelope.ts`; `paid-sha256.ts`): when envelope keys are configured, new sessions seal amount, recipient, payer, and receipt fields with X25519, HKDF-SHA256, AES-256-GCM. Public 402 then shows `amount: "0"`, `payTo: "0x0"`, plus invoice id and expiry. Only the pinned client key decrypts terms. The seller always can (it sealed them). The GET URL (`/tools/sha256?text=...`) is still visible on the HTTP path.
7. VERIFIED (`EVIDENCE.md`): the live Sepolia 402 challenge was plaintext (resource, recipient, token, amount, invoice, expiry). Envelope code exists; that run did not prove header confidentiality on Sepolia.

### (a) Agent CLI / SDK / MCP

8. VERIFIED (`EVIDENCE.md`; `src/private402/agent-payer.ts`; `research/paymaster-necessity.md`): one Sepolia invoice settled HTTP 200 via STRK20 notes. Direct `account.execute`. No paymaster. Public calldata showed payer account, pool, STRK approve, `apply_actions`, and `Append` recipient. Network fee and 2 STRK pool fee were public. Timing was public.
9. VERIFIED (`src/private402/payer-runtime.ts`): agent holds `viewingKey` in the runtime and sends it to discovery/prover through OHTTP (`ohttp: true`, no `relayUrl` in that constructor). VERIFIED (`vendor/.../ohttp-client.ts`): without a relay, the request goes to the configured gateway. INFERRED (`EVIDENCE.md`): operator decrypts viewing-key material and sees the client connection. Direct OHTTP is content encryption, not IP unlinkability.
10. VERIFIED (`EVIDENCE.md` source cites): prover receives payer address, viewing key, recipient, token, amount, and client actions. Seller links resource, invoice, payer, tx, recipient, token, amount. Cloudflare quick tunnel sits on the x402 HTTP path (INFERRED: network metadata plus URL, challenge, payment header, response). OHTTP does not cover that HTTP exchange.
11. VERIFIED (`test/devnet/paymaster-private-payment.test.ts`; `README.md`): after a pre-opened channel, a later Devnet paymaster submit used the substitute sender and omitted Alice and Bob felts. First setup calldata still contained the recipient. Blind spot in `README.md`: local substitute, test proof facts. Not live AVNU, not Sepolia, not Mainnet.
12. VERIFIED (`agent-payer.ts`): paymaster path requires `SetupRequirement.Ready`, disables `autoRegister` / `autoSetup`, and will not open a public recipient channel during the paid request. First-lane `Append` is supposed to happen earlier.
13. REPORTED (`research/merchant-recipient-requirements.md`): `payTo` must already have `SetViewingKey`. Unregistered addresses cannot receive a private `transfer`. VERIFIED (`agent-payer.ts`): paymaster path already refuses a non-`Ready` channel.

### (b) Browser Wallet API visitor

14. VERIFIED ([Wallet API overview](https://strk20-by-example.org/starknet-wallet-api/overview.md)): dapp must not take the viewing key. Wallet discovers notes, proves, and submits. Pin `starknet@^10.4.0`. Detect capabilities. Edges (deposit/withdraw) stay public.
15. REPORTED (`research/strk20-official-docs.md`, `research/browser-strk20-wallet.md`): as of those 2026-08-14 fetches, Ready and Xverse are the named STRK20 Wallet API wallets. Day 0 VERIFIED this session: Ready (formerly Argent) or Braavos for gas and shielding. Braavos is not documented as Wallet API STRK20. Do not promise Braavos private pay.
16. VERIFIED (Day 0 fetch this session): official mainnet private txs "are submitted by rotating shared relayers"; "your address appears nowhere in the calldata or signature." That is Day 0's submitter model. NOT DETERMINED for an stk402 invoice from this repo (no wallet connected here).
17. REPORTED (`research/browser-strk20-wallet.md`): visitor should call `strk20InvokeTransaction` so the wallet adds the fee withdraw. Do not put an AVNU Portal key in page JS. Starter kit has no x402 path.

## UNSAFE / overclaims to ban

Ban these strings and their cousins:

- "Fully private x402" / "anonymous payments" / "unlinkable invoices"
- "Nobody can tell who paid whom" as a product fact (Day 0 marketing vs first `Append` + seller + operators)
- "Hidden from the merchant" (seller verifies the receipt and can link invoice to tx)
- "OHTTP hides the agent" without a relay (direct mode still shows IP to the gateway)
- "Encrypted 402 means the network cannot see the resource" (URL and TLS terminator remain)
- "Paymaster proven on Sepolia" (Devnet substitute only)
- "Mainnet private settle" (not run; Day 0 still missing hosted mainnet discovery/prover URLs as of this fetch)
- "Mixer" / "tornado-style anonymity set" (official: not a mixer)
- Amount privacy for shield, unshield, pool fee withdraw, or DeFi helper legs
- "Argent or Braavos can pay privately in the dapp" without a `supportedWalletApi >= 0.10.3` probe
- "Browser path hides the viewing key from all operators" (wallet may still call a hosted prover; NOT DETERMINED which backend Ready uses)
- Treating `EVIDENCE.md` role-labeled Voyager links as anonymity evidence (the doc says they are execution evidence)
- Copying viewing-keys.md "not to whom" for first channel open
- Claiming envelope confidentiality for the Sepolia live 402 (plaintext challenge)

## Required README caveats

Keep these next to any privacy sentence:

1. Name the observer. Public chain vs seller vs discovery vs prover vs paymaster/relayer vs auditor vs TLS/CDN.
2. Split first channel open from later note spend. First `Append` can publish `recipient_addr`. Later transfer on an existing channel is the better party-privacy case (Devnet only for paymaster).
3. Split note amount confidentiality from submitter identity. Direct agent submit shows the payer as L2 sender. Relayer/paymaster is required to hide that sender. AVNU is one adapter, not the only one, and not live-proven here.
4. Shield and fund txs are public (address, token, amount) plus FPI screening. Do not time a distinctive shield against a distinctive invoice.
5. Envelope is pairwise to one authorized client key. It is not privacy from the seller. Legacy plaintext retry stays plaintext.
6. Agent path holds `k` in the process. Browser path must not. Do not mix SDK into the visitor page.
7. Mermaid "paymaster submits" is the intended later path, not the measured Sepolia payment.
8. Day 0: overclaiming costs integration-depth points. Prefer "amount-confidential notes" over "private payments".

## Agent path vs browser Wallet API path

| Surface | Agent CLI/SDK/MCP | Browser Wallet API |
| --- | --- | --- |
| Who holds `k` | Agent runtime (`payer-runtime.ts`) | Wallet. Dapp never sees it (official overview) |
| Who proves | Hosted prover (Sepolia VERIFIED) | Wallet; may call hosted prover internally (NOT DETERMINED) |
| Who submits | Direct account (Sepolia VERIFIED) or optional paymaster (Devnet only) | Wallet `strk20InvokeTransaction`; Day 0 says relayer (REPORTED for product, NOT DETERMINED live) |
| x402 invoice pay | One Sepolia 200 VERIFIED | No stk402 demo in this research. No public demo wires 402 to STRK20 (REPORTED) |
| Viewing key to discovery | Sent under OHTTP; no relay in current constructor | Stays in wallet |
| First `Append` | Exposed recipient on Sepolia pay | Same protocol if channel is new |
| Envelope 402 | Code present; Sepolia run was plaintext | Same scheme if the page sends the pinned key; CORS/header exposure NOT DETERMINED |
| Mainnet agent settle | Blocked on published prover/indexer URLs (Day 0 VERIFIED still missing those URLs). Self-host is contingency only, not the score-hash plan. | Primary score-hash path (grill 2026-08-15 A): Consumer Wallet API invoice settle. Wallet can hit mainnet pool without agent prover URLs (REPORTED). |
| Trust extras | Seller, discovery, prover, (paymaster), Cloudflare tunnel | Seller, wallet vendor, possible wallet prover, possible relayer |

## Least confident decisions

1. Whether Ready `strk20InvokeTransaction` already uses Day 0 relayers for a third-party x402 pay (docs vs no live sender check).
2. Whether live AVNU `apply_action` will relay a non-swap transfer for stk402.
3. Whether a later Sepolia paymaster transfer omits `Append` the same way Devnet did.
4. Whether envelope-on Sepolia still leaks enough via URL, timing, and operator logs to make header encryption a weak README claim.

## Gaps (do not invent)

- Live Ready/Xverse paying an stk402 invoice (Consumer React path shipped in `web/`; settle not measured)
- Live AVNU or Ready relayer sender on Voyager for this product
- Mainnet discovery URL and proving URL (absent from Day 0 on 2026-08-14 fetch)
- Envelope-on live 402 (code yes, Sepolia audit no)
- OHTTP relay deployment
- Anonymity-set size; correlating shield-then-pay
- Xverse dapp Wallet API "in progress" vs live (sources disagree by page age)
- Wallet API sub-accounts / `shadow_account_invoke` readiness
- Render always-on Consumer Static Site (build path shipped; dashboard Install/Build/Publish must use `web/`)
- Render Paid Resource Web Service (secrets + disk; not the static site)
