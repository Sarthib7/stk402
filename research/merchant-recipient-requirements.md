# Merchant / recipient preconditions for private STRK20 x402 settlement

Date: 2026-08-14  
Scope: note-to-note `transfer` that settles an stk402 private invoice (`payTo`).

Provenance tags: **VERIFIED** = quoted from local vendor or payer source / live docs / EVIDENCE this session. **REPORTED** = prior stk402 research notes. **INFERRED** = conclusion from those sources.

## Verdict

**Yes.** For a private note-to-note transfer, `payTo` must already be pool-registered (`SetViewingKey` / non-zero public viewing key). If not, `OpenChannel` fails with `RECIPIENT_NOT_REGISTERED`. Payer `autoRegister` / `autoSetup` cannot register the merchant. Unregistered public addresses can only be paid via public `withdraw` (unshield) or via a helper/escrow pattern that is not note-to-note private receive.

---

## 1. Required recipient preconditions

| Precondition | Why | Provenance |
| --- | --- | --- |
| Merchant has called `SetViewingKey` (registered `K`) | Channel ECDH encrypts to recipient public key `K` | VERIFIED: https://strk20-by-example.org/viewing-keys.md ; `privacy.cairo` `open_channel` asserts `recipient_public_key.is_non_zero()` |
| Merchant address is a normal Starknet account that completed registration | Wallet API: "Private transfer - move value privately between registered users" | VERIFIED: https://strk20-by-example.org/starknet-wallet-api/overview.md |
| First payer→merchant lane may still need channel / STRK subchannel | SDK `SetupRequirement`: `Register` \| `SetupChannel` \| `SetupToken` \| `Ready` | VERIFIED: `vendor/.../sdk/src/interfaces.ts:56-64`, `sdk/README.md:535-536` |
| Paymaster path needs `Ready` before quote | stk402 rejects if not ready | VERIFIED: `src/private402/agent-payer.ts:190-193`, `agent-paymaster.test.ts` "rejects every incomplete channel" |

Sender also must be registered to open a channel (same contract path). That is payer-side, not merchant-side.

`SetupRequirement.Register` comment says "Recipient is not registered" (`interfaces.ts:57-58`). Indexer path also returns `Register` when `!sender_registered` (`indexer-discovery.ts:382`). Treat `Register` as "someone still needs registration / pubkey missing," not only merchant.

---

## 2. First payment on-chain and privacy impact

Phase order (enforced): `SetViewingKey` → `OpenChannel` → `OpenSubchannel` → note spend/create …  
VERIFIED: `packages/privacy/README.md` phases table; `interface.cairo` client_actions phase order.

On first transfer to a new counterparty with `autoSetup`:

1. Client emits `OpenChannel` for merchant.
2. Contract reads merchant `public_key`. If zero → panic `RECIPIENT_NOT_REGISTERED`.  
   VERIFIED: `privacy.cairo` `open_channel` (~379).
3. On success, server actions include `Append { recipient_addr, enc_channel_info }`.  
   VERIFIED: `privacy.cairo` returns `ServerAction::Append`; `actions.cairo` `AppendInput`.
4. First token through that channel also opens a subchannel.

Privacy impact (first channel open):

- **VERIFIED (EVIDENCE.md):** Sepolia payment calldata exposed configured recipient once as `Append.recipient_addr`. Receipt still hid amounts and did not emit recipient in events.
- **INFERRED (EVIDENCE.md):** Later transfers on an existing channel can skip another `Append`; not re-tested live.
- Public x402 challenge already exposes `payTo` / amount off-chain.

Registration itself (`SetViewingKey`) is public: observers learn that an address registered. VERIFIED: prior note `strk20-official-docs.md` (what-is / viewing-keys / compliance pages).

---

## 3. Options for unregistered `payTo`

| Option | Private note receive? | Status | Provenance |
| --- | --- | --- | --- |
| Direct `transfer` to unregistered address | No. Reverts at `OpenChannel` | Protocol hard fail | VERIFIED: `privacy.cairo` + mock-pool `"Recipient … not registered"` |
| Merchant self-registers first (`register()` / wallet first privacy use / funding deposit with `autoRegister`) | Yes, after `K` is on-chain | Required for MVP note-to-note | VERIFIED: escrow docs + SDK register; EVIDENCE recipient funding before pay |
| `withdraw` / unshield to public Starknet address | No. Public ERC-20 edge to any `to_addr` | Works without recipient registration | VERIFIED: `privacy.cairo` `withdraw` → `TransferTo` (no recipient pubkey check) |
| Escrow anonymizer (`privacy_invoke` Deposit/Claim + off-chain secret) | Claimer gets open note after *they* register | Unofficial example; not in monorepo; no SDK helpers | VERIFIED: https://strk20-by-example.org/helpers/escrow.md |
| Generic DeFi anonymizer / `privacy_invoke` | Credits open notes via helper; not "pay bare address" | Pattern for swaps/lending/custom | VERIFIED: https://strk20-by-example.org/helpers/privacy-invoke.md |
| Shadow-account invoke | Separate Wallet API / anonymizer path | Not a substitute for invoice `payTo` note transfer | REPORTED: `strk20-official-docs.md`, `starknet-privacy-sdk.md` |

Payer `autoRegister: true` only registers the **payer** when their own pubkey is missing (`compiler.ts` checks `pool.getChannel(this.userAddress)`). It does not call `SetViewingKey` for `payTo`. VERIFIED: `compiler.ts` autoRegister/autoSetup block.

stk402 agent payer always does `.transfer({ recipient, amount })` to invoice `payTo`. No escrow or unshield-to-merchant path in that module. VERIFIED: `agent-payer.ts:231-232`.

---

## 4. Recommended MVP rule for stk402 merchant

1. Merchant must pool-register before any invoice that uses private `transfer` settlement.
2. Prefer register + self-channel in a **prior** funding tx (same pattern as Sepolia EVIDENCE recipient fund), not inside the payment tx.
3. Reject / do not challenge invoices whose `payTo` has `get_public_key == 0`.
4. Paymaster settlements: require `discoverRequirement(payTo, STRK) === Ready` (already enforced).
5. Do not ship unofficial escrow or unshield-to-merchant as the default private x402 path in MVP.
6. Document that first payer→merchant payment may still publish `Append.recipient_addr` in calldata.

Aligns with REPORTED product rule in `approach-2-synthesis.md` §"Merchant recipient must be pool-registered before private receive."

---

## 5. Cheapest verification step

Call the deployed pool's view:

```text
get_public_key(merchant_address) -> felt252
```

VERIFIED entrypoint: `privacy.cairo` `get_public_key`; ABI in `interface.cairo`.

- Non-zero → registered (can receive private notes once channel/subchannel exist).
- Zero → not registered; private `transfer` will fail at channel open.

Optional second call (after known payer): `transfers.discoverRequirement(payTo, STRK)` and expect `Ready` for paymaster, or `SetupChannel`/`SetupToken` for first-lane autoSetup (still requires registered merchant).

Runtime: one RPC `call` (~seconds). No proof.

---

## Least confident decisions

1. Whether mainnet wallets auto-register merchants on first shield without an explicit ops step (docs say wallets register on first use; not re-run here).
2. Whether unofficial escrow will be production-acceptable for hackathon scoring if a merchant refuses registration.
3. Exact mainnet pool address for the `get_public_key` check in your deploy config (use stk402 env pool, not a guessed address).
