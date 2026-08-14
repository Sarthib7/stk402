# Must the merchant be pool-registered

Labels: wayfinder:research
Status: closed

## Question

For note-to-note x402 settlement, must `payTo` already have SetViewingKey? What if not?

## Resolution (2026-08-14)

Asset: [research/merchant-recipient-requirements.md](../research/merchant-recipient-requirements.md)

Yes. Unregistered recipient → `OpenChannel` panics `RECIPIENT_NOT_REGISTERED`. MVP merchant self-registers before serving invoices. Unshield/escrow helpers are out of MVP private path. First channel still exposes recipient in `Append` calldata.
