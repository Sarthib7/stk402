# x402 Starknet custom scheme research (stk402 exact-private)

**Sources**

1. https://github.com/x402-foundation/x402/blob/main/specs/schemes/exact/scheme_exact_starknet.md (raw main, fetched 2026-08-14)
2. https://github.com/x402-foundation/x402/blob/main/specs/x402-specification-v2.md (raw main, fetched 2026-08-14)
3. https://registry.npmjs.org/@x402/core/latest and package README from repo `typescript/packages/core/README.md` (npmjs.com HTML blocked by Cloudflare)
4. Supporting: `specs/transports-v2/http.md`, `docs/schemes/overview.mdx`, `.agents/skills/authoring-specs/references/new-network-scheme-spec.md`, `examples/typescript/{clients,servers}/custom/README.md`, `examples/typescript/fullstack/next/README.md`, GitHub tree of `x402-foundation/x402`, npm `@x402/fetch` / `@x402/paywall`, third-party `x402-starknet@1.0.0`

**Date:** 2026-08-14

**Provenance:** REPORTED. Distilled from the sources above. Claims are from those documents and registry metadata. Not independently verified on-chain or against a live facilitator.

## TLDR

x402 v2 treats a scheme as a string plus scheme-specific `payload` / `extra` logic. Official TypeScript registers custom mechanisms with `register(network, schemeImpl)` on client, resource server, and facilitator. Facilitator owns `/verify`, `/settle`, `/supported`. Resource server proxies those calls and never needs the client to talk to the facilitator. Official Starknet `exact` is SNIP-9 Outside Execution with sponsored gas via `extra.feePayer`. Foundation repo has the Starknet **spec** only: no `@x402/starknet` package and no Starknet examples under `examples/`. Browser path exists for EVM/SVM via `@x402/fetch` and `@x402/paywall`; no official Starknet paywall export. Protocol wires payment as **base64 JSON in cleartext headers**. No official encrypted-envelope or private-scheme spec.

## 1. How custom schemes register

### Protocol layer

v2 says schemes define payload construction, validation/settlement, and scheme-specific `extra` keys. Named schemes live under `specs/schemes/`. The `scheme` field is a free string in `PaymentRequirements` (example value `"exact"`).

Evidence (v2 §6):

> "Each scheme defines: How to construct the `payload` field within `PaymentPayload`; Settlement and validation procedures; Requirements in the `extra` field of `PaymentRequirements`"

Docs overview:

> "Servers register scheme implementations for the networks they advertise. Clients register scheme implementations for the networks they can pay on."

Authoring checklist for a new per-network scheme file:

- Put scheme-specific data in `extra`, not extensions or top level.
- Every `PaymentRequired.extra` field must be consumed by client or facilitator.
- Reuse `extra.feePayer` for fee sponsors.
- Do not add facilitator endpoints beyond `/verify`, `/settle`, `/supported`.
- Client must not talk to facilitator directly; always via resource server.

### TypeScript SDK (`@x402/core@2.22.0`)

Registration is runtime, not a global registry service.

| Role | API | Interface |
| ---- | --- | --------- |
| Client | `x402Client.register(network, client)` | `SchemeNetworkClient` (`scheme`, `createPaymentPayload`) |
| Resource server | `x402ResourceServer.register(network, server)` | `SchemeNetworkServer` (`scheme`, `parsePrice`, `enhancePaymentRequirements`, payment flows) |
| Facilitator | `x402Facilitator.register(networks, facilitator)` | `SchemeNetworkFacilitator` (`scheme`, `caipFamily`, `getExtra`, `getSigners`, `verify`, `settle`) |

Evidence (core README):

```typescript
const coreClient = new x402Client()
  .register('eip155:*', new ExactEvmScheme(evmSigner));

const resourceServer = new x402ResourceServer(facilitatorClient)
  .register('eip155:*', new ExactEvmScheme());

registerExactEvmScheme(facilitator, { signer: evmSigner, networks: 'eip155:84532' });
```

`SchemeNetworkClient.scheme` is a string. A custom name such as `exact-private` works if client, server, and facilitator all register the same string and the facilitator advertises that kind on `/supported`.

`examples/typescript/clients/custom` and `servers/custom` show **manual HTTP wiring** with stock `exact` EVM/SVM schemes. They are not a new scheme name. Pattern still applies: decode `PAYMENT-REQUIRED`, `createPaymentPayload`, encode `PAYMENT-SIGNATURE`.

Official mechanism packages under `typescript/packages/mechanisms`: aptos, avm, concordium, evm, hedera, keeta, near, stellar, svm, tvm, xrpl. **No starknet directory.** npm `@x402/starknet` returns Not found.

## 2. Facilitator vs resource server

### Roles (v2 §3)

- **Resource server:** requires payment for protected resources.
- **Client:** requests resources (agent or app).
- **Facilitator:** verifies payment and settles on chain (or commits payment state).

### Facilitator HTTP API (v2 §7)

| Endpoint | Duty |
| -------- | ---- |
| `POST /verify` | Read-only validation. MUST NOT commit payment or write on-chain state. |
| `POST /settle` | Durably commit payment (usually broadcast). Re-verify as scheme requires. |
| `GET /supported` | Advertise `kinds` (`x402Version`, `scheme`, `network`, optional `extra`), `extensions`, `signers`. |

Default payment flow `authorization`: verify → resource → settle → respond. Flows `upfront` / `escrow` settle before the handler and may omit `/verify`.

### Starknet `exact` split of duties

From `scheme_exact_starknet.md`:

- Client never talks to facilitator. Resource server proxies `/verify` and `/settle`.
- Before 402, resource server copies `extra.feePayer` from facilitator's `/supported` entry for that network.
- Client builds and signs SNIP-9 `OutsideExecution` from `PaymentRequirements` alone.
- Facilitator verifies (rules 1 to 9), then at settle re-verifies, calls `execute_from_outside_v2` on `payload.from` with on-chain caller = `feePayer`, waits for finality, checks Transfer event.
- Facilitator pays gas (own account, forwarder, or SNIP-29 paymaster). Client needs no gas.

Evidence:

> "The client never communicates with it directly; all facilitator interaction is proxied through the resource server."

> "Resource servers MUST take this value verbatim from the `extra.feePayer` of their facilitator's `/supported` entry"

Resource server still: emit 402/`PAYMENT-REQUIRED`, forward verify/settle, gate the resource on success, attach `PAYMENT-RESPONSE`. It should not need its own Starknet RPC if the facilitator does settlement (authoring checklist: "The server should not need an RPC").

## 3. Starknet exact: account, signature, SNIP-9, sponsored gas

### Version and networks

- v2 only (`x402Version` MUST be `2`). v1 unsupported.
- Only SNIP-9 v2 / SNIP-12 revision `1`. Reject v1 outside execution.
- CAIP-2: `starknet:SN_MAIN`, `starknet:SN_SEPOLIA`.

### Account and signature

- Payer is an account contract at `payload.from` (address not inside SNIP-12 message).
- Client signs SNIP-12 typed data for `OutsideExecution` via wallet typed-data signing.
- Signature is felt array, passed verbatim to `is_valid_signature` (SNIP-6). Not assumed `[r, s]`.
- Facilitator reconstructs canonical typed data; does not hash client JSON as received.
- Must get SNIP-6 magic `VALID` (`0x56414c4944`). Undeployed account → `account_not_deployed`.

### SNIP-9 Outside Execution shape

Exactly one call:

- `To` = `asset` (SNIP-2 token with `transfer`)
- `Selector` = `sn_keccak("transfer")`
- `Calldata` = `[payTo, amount_low, amount_high]`
- `Caller` = `extra.feePayer` (required)
- Fresh SNIP-9 nonce; `Execute Before = now + maxTimeoutSeconds`

No approve / transferFrom. No client-submitted tx.

### Sponsored gas / feePayer

- Every payment is sponsored. Client never needs gas funds.
- `feePayer` MUST be concrete: not zero, not `payload.from`, not any-caller sentinel `0x414e595f43414c4c4552` (`ANY_CALLER`).
- MAY equal `payTo` (merchant-sponsored).
- Sponsor-local detail: direct executor vs forwarder vs SNIP-29 paymaster. Must not require client↔facilitator interaction.
- Facilitator MUST only announce a `feePayer` it can settle through and that only it can invoke (no permissionless forwarder).

### Replay and settlement

- Replay: SNIP-9 single-use nonce on account (`is_valid_outside_execution_nonce`).
- Settle success only if `execution_status` SUCCEEDED **and** receipt has exactly the expected asset Transfer payer→payTo for exact amount.
- Non-terminal `settlement_pending` when broadcast outcome is unknown. Do not re-broadcast same `(from, Nonce)`.

### Compatibility note (third-party)

npm `x402-starknet@1.0.0` (NethermindEth / aspect-build) implements Starknet x402 helpers. Its README uses `starknet:mainnet` / `starknet:sepolia`, which **differs** from foundation CAIP-2 `starknet:SN_MAIN` / `starknet:SN_SEPOLIA`. Treat as external; align identifiers before mixing with foundation facilitators.

## 4. Browser clients in official packages

### Spec

v2 §12.5 lists HTTP clients including "axios/fetch (browser)". Human apps and pay-per-use content are in scope.

### Official packages (2026-08-14)

| Package | Role | Browser-relevant |
| ------- | ---- | ---------------- |
| `@x402/core@2.22.0` | Transport-agnostic client/server/facilitator | Used by browser wrappers |
| `@x402/fetch@2.22.0` | Wraps native `fetch` for 402 retry | Works wherever `fetch` exists (browser or Node) |
| `@x402/paywall@2.22.0` | Paywall UI | Exports `./evm`, `./svm`, `./avm` only. **No `./starknet`** |
| `@x402/next` fullstack example | HTML paywall + API | EVM + SVM paywalls via `createPaywall().withNetwork(evmPaywall\|svmPaywall)` |

Evidence (`@x402/fetch` README): wraps `globalThis.fetch`, auto-retries with `PAYMENT-SIGNATURE`.

Evidence (fullstack next README): browser paywall for EVM/SVM wallets. No Starknet network in that example.

### Gaps for Starknet browser

- No official `@x402/starknet` or paywall network module.
- Starknet wallet signing is SNIP-12 typed data in browser (Argent/Ready, Braavos per scheme appendix). App must supply that signer into a custom `SchemeNetworkClient`.
- CORS: browser JS can only read `PAYMENT-REQUIRED` / `PAYMENT-RESPONSE` if the server exposes them (`Access-Control-Expose-Headers`). Spec does not document CORS. Practical requirement for browser clients. INFERRED from browser CORS rules, not from x402 text.

Agents: same HTTP headers and `x402Client.register`; typically Node `@x402/fetch` or custom client with a local/account signer.

## 5. Constraints for encrypted payment headers / private schemes

### What the wire format is today

HTTP transport (`specs/transports-v2/http.md`):

| Header | Content |
| ------ | ------- |
| `PAYMENT-REQUIRED` | Base64 JSON `PaymentRequired` |
| `PAYMENT-SIGNATURE` | Base64 JSON `PaymentPayload` |
| `PAYMENT-RESPONSE` | Base64 JSON `SettlementResponse` |

Evidence:

> "All x402 protocol information is communicated through headers"

No encrypt, private, or confidential payment mode appears in v2 core, HTTP transport, or Starknet exact scheme (search: no matches).

### Implications for `exact-private` / encrypted envelope

1. **Cleartext by default.** Base64 is encoding, not confidentiality. Resource server, facilitator, TLS terminators, and logs can read amount, asset, payTo, `from`, and full OutsideExecution.
2. **Facilitator must see verifiable intent for stock `exact`.** Starknet rules require reconstructing typed data and checking Calls against server-supplied requirements. An envelope the facilitator cannot open breaks stock verify/settle unless the scheme redefines who decrypts and what is proven.
3. **Caller binding already limits third-party submission**, not confidentiality. Signed payload bound to `feePayer` stops strangers from submitting it, but the payload itself remains readable to parties in the path.
4. **Header size.** Spec sets no max header length. Starknet payload includes full SNIP-12 typedData plus felt signature array. Facilitators SHOULD bound signature array length (~32 felts). Large encrypted blobs plus typedData risk proxy/CDN header limits. Scheme authors must size-test. Practical constraint; not a protocol constant.
5. **Custom scheme path.** Use a distinct `scheme` string (e.g. `exact-private`). Implement `SchemeNetworkClient` / `Server` / `Facilitator`. Advertise on `/supported`. Put crypto params in `extra` only if client or facilitator consumes them. Still only `/verify` `/settle` `/supported`.
6. **Trust split options for private designs (design inference, not in spec):**
   - Encrypt for facilitator only (resource server forwards opaque blob). Facilitator decrypts, then runs Starknet exact checks.
   - Encrypt for resource server; server decrypts before facilitator. Facilitator still sees cleartext at verify.
   - Hide commercial metadata off-chain; keep on-chain transfer public (Starknet Transfer events remain visible).
7. **Do not put pure display fields in `extra`.** Authoring rule: every `extra` field must be consumed for construct/verify/settle.
8. **Client distrust of server fields still applies.** Client must not trust server-supplied decimals or similar for amount math.

## 6. Starknet examples in x402-foundation/x402

GitHub tree recursive listing (2026-08-14): **one** path with `stark` in the name:

- `specs/schemes/exact/scheme_exact_starknet.md`

No `examples/**/starknet*`, no `typescript/packages/mechanisms/starknet`. Custom/fetch/next examples are EVM/SVM (and other non-Starknet chains elsewhere).

## Rules to adopt

1. Register the same `scheme` string on client, resource server, and facilitator via `register(...)`.
2. Advertise the kind on facilitator `GET /supported`, including required `extra` (for Starknet exact: `feePayer`).
3. Copy `extra.feePayer` verbatim from `/supported` into 402 `accepts[]`. Never invent it on the server.
4. Keep client↔facilitator out of band. Resource server proxies verify and settle only.
5. For Starknet exact settlement, use SNIP-9 v2 Outside Execution with exactly one `transfer` call and Caller = `feePayer`.
6. Reject any-caller sentinel and `feePayer == from`. Bind submission to the sponsor.
7. Use foundation CAIP-2 ids `starknet:SN_MAIN` / `starknet:SN_SEPOLIA` unless every peer agrees on another map.
8. Re-verify at settle. Do not trust a prior `/verify` alone.
9. Require Transfer event proof, not only SUCCEEDED status, before releasing the resource.
10. Prefer sponsored gas. Do not require the client to hold STRK for settlement.
11. Implement privacy as a **new scheme name** with its own verify/settle semantics. Do not claim stock `exact` if the facilitator cannot see clear Calls.
12. Treat `PAYMENT-*` headers as cleartext metadata. Encrypt only with an explicit threat model and decrypt role.
13. Bound payload and signature size for HTTP header limits before shipping encrypted envelopes.
14. For browsers, expose payment headers in CORS and plan a custom Starknet paywall/signer. Official `@x402/paywall` has no Starknet export.
15. Do not add new facilitator routes. Express private flows through `/verify`, `/settle`, `/supported` only.
16. Prefer stateless facilitator design. Justify any cache (e.g. duplicate settlement keys).
17. Prefer non-sequential nonces (SNIP-9 nonces already fit).
18. Fail closed on RPC/parse/simulation uncertainty.
19. When mixing `x402-starknet` community code, reconcile network id strings with the foundation spec before integration tests.
20. Agents and browsers share the same header protocol. Differ only in signer and UX (headless account vs wallet paywall).

## Least confident decisions

1. Whether foundation will ship `@x402/starknet` under the same register helpers soon (spec exists; package absent).
2. Exact CORS header names used by production facilitators (not in fetched specs).
3. Whether an encrypted scheme can keep the facilitator honest without learning amount/payTo (no official pattern).
4. Compatibility of community `x402-starknet` CAIP-2 ids with future foundation facilitators.

## Not fetched / failed

- npmjs.com package page HTML for `@x402/core` (Cloudflare bot challenge). Registry JSON + GitHub README used instead.
- GitHub code search API (`Requires authentication`). Tree API and raw file fetches used instead.
- Full source tree of `NethermindEth/x402-starknet` beyond README (only network-id mismatch sampled).
- Live facilitator `/supported` for Starknet (not called).
- SNIP-9 / SNIP-12 primary docs (linked from scheme; not re-fetched).
