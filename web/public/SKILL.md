---
name: stk402
description: Pay a stk402 private x402 Paid Resource on Starknet with STRK20 notes via CLI or MCP. Use when the user wants to settle an HTTP 402 invoice privately through stk402, fund an Agent Payer, or check network config.
---

# stk402 Agent Payer

Private x402 on STRK20. You pay a Paid Resource from shielded notes. Viewing key stays in the operator `.env.payer` file. Never put the viewing key in chat or in a browser.

## Paid Resource

Prefer the URL the user gives. Else use `STK402_RESOURCE_URL` from `.env.payer`.

On the public Consumer demo page, the same Paid Resource is the value in the Resource URL field. The skill file itself is served at `{demo_origin}/SKILL.md`.

## Setup (once)

1. Clone `stk402` and install: `npm install`
2. Copy `.env.payer.example` → `.env.payer` and fill every `replace_me`
3. Pin server envelope public key + authorized client envelope keys (same pair the Paid Resource accepts)
4. Merchant `payTo` must already be pool-registered (`SetViewingKey`)
5. Fund notes if empty: `npm run fund:payer`

## Pay (CLI)

```sh
# optional one-shot override
STK402_RESOURCE_URL="https://paid.example/tools/sha256?text=stk402" npm run pay:resource
```

Expect HTTP 200 and a settlement JSON body. Proof generation can take minutes.

## Pay (MCP)

```sh
npm run mcp:serve
```

Tools:

- `stk402_check_network` — read network/pool config from env
- `stk402_fund_payer` — deposit into Agent Payer notes
- `stk402_pay_resource` — settle one invoice (`resourceUrl` optional override)

## Consumer path (no viewing key)

Humans use Ready or Xverse on the Consumer pay page (`demo_url`). That path uses the STRK20 Wallet API. Do not ask them for a viewing key.

## Privacy copy (keep honest)

Amount is hidden on the pool receipt from observers without a viewing key. Do not claim unlinkable or fully private. Direct L2 sender stays visible unless a paymaster/relayer actually submits.
