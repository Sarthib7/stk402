# Design browser Wallet API invoice pay

Labels: wayfinder:grilling
Status: closed
Assignee: agent (2026-08-14)

## Question

How does a Consumer with Ready or Xverse settle a stk402 invoice in-browser without the dapp holding a viewing key, and how is the Receipt produced for server verify?

## Resolution (2026-08-14)

1. Separate `web/` app pinned to `starknet@^10.4.0` (npm `next` if needed). Root agent stack stays on `10.0.2` for vendor Privacy SDK.
2. Connect via get-starknet v6 → `WalletAccountV6`. Probe `supportedWalletApi >= 0.10.3`. Offer private pay only for Ready/Xverse that pass. Exclude Braavos from private-pay CTA.
3. Settlement: `strk20InvokeTransaction([{ type: "transfer", token, amount, recipient }])`. Wallet holds viewing key and proves. No Privacy SDK in the page.
4. Merchant `payTo` must already be pool-registered (research ticket).
5. Receipt: reuse SNIP-12 `buildReceiptTypedData` / `PrivatePaymentReceipt`. Wallet `signMessage(typedData)`. Server `verifyMessageInStarknet` unchanged.
6. Envelope: browser must speak `exact-private-envelope-v1` (server requires it). First vertical slice ships connect+probe+pay UI and shared typed-data helper; envelope WebCrypto/noble port and live Ready pay follow in the next feat.
7. Real settlement only. No mock digests.

Assets: `web/` scaffold, `src/shared/receipt-typed-data.ts`.
