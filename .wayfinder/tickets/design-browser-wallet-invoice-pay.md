# Design browser Wallet API invoice pay

Labels: wayfinder:grilling
Status: open

## Question

How does a Consumer with Ready or Xverse settle a stk402 invoice in-browser without the dapp holding a viewing key, and how is the Receipt produced for server verify?

## Constraints

- Wallet API `>= 0.10.3`, `starknet@^10.4.0` for the web app.
- Merchant `payTo` pool-registered.
- Real settlement only.
- Probe capabilities before offering private pay.
- Receipt today uses Node account `signMessage`; browser must get an equivalent wallet signature.

## Recommendation

Wallet API `strk20InvokeTransaction` / prepare path for the transfer; wallet signs receipt typed data; server verify unchanged.
