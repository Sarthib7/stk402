# CONTEXT.md

stk402 is the context for private x402 settlement on STRK20: agents and consumers pay for HTTP resources from shielded notes.

## Language

**Agent Payer**:
A headless client that settles an Invoice from STRK20 notes via CLI, SDK, or MCP.
_Avoid_: bot, user, script alone

**Consumer**:
A human who pays through a privacy-enabled browser wallet (Ready or Xverse).
_Avoid_: user alone, visitor as synonym for Agent Payer

**Invoice**:
An x402 payment challenge bound to a Paid Resource, amount, recipient, network, and expiry.
_Avoid_: bill, payment request

**Receipt**:
A signed settlement proof that binds Invoice identity to a pool transaction and payment facts.
_Avoid_: payment, tx hash alone

**Paid Resource**:
An HTTP endpoint that returns its body only after Invoice settlement verifies.
_Avoid_: API, tool (unless naming the demo SHA-256 tool)

**Score Hash**:
A mainnet STRK20 pool-touching transaction that settled a stk402 Invoice and is listed in `strk20.json`.
_Avoid_: any pool tx, demo tx, shield-only hash

**Merchant**:
The party whose pool-registered address is `payTo` on the Invoice.
_Avoid_: seller as the only term (seller may also mean the HTTP operator)

## Relationships

- An **Agent Payer** or **Consumer** settles one **Invoice** per paid request.
- An **Invoice** belongs to one **Paid Resource** and one **Merchant**.
- A successful settle produces one **Receipt** and usually one pool transaction.
- A **Score Hash** is a mainnet pool transaction that settled a stk402 **Invoice**.

## Example dialogue

> **Dev:** "Can we put a Ready shield tx in `strk20.json` as a **Score Hash**?"
> **Domain expert:** "No. A **Score Hash** must settle a stk402 **Invoice**. Shield-only does not count."

> **Dev:** "Can the **Consumer** page hold the viewing key?"
> **Domain expert:** "No. The wallet holds it. The **Agent Payer** runtime may hold a viewing key in env for the headless path."

## Flagged ambiguities

- "private payment" — resolved for public copy: mean note-to-note amount confidentiality for observers without a viewing key, not unlinkability or hidden L2 sender unless measured.
- "user" — resolved: say **Agent Payer** or **Consumer**.
- "seller" vs **Merchant** — HTTP operator may equal Merchant; prefer **Merchant** for `payTo`.

## Standing decisions (2026-08-15)

- **Score Hash** production path while Agent mainnet prover/indexer URLs are missing: **Consumer** Ready/Xverse Wallet API invoice settle (not self-host prover as the plan).
- Always-on **demo_url** + Paid Resource host: **Render**. Consumer is a Static Site (`web/dist`). Paid Resource is a Node Web Service with secrets. See [`deploy/render.md`](deploy/render.md).
- Glossary and map: [`.wayfinder/map.md`](.wayfinder/map.md).
