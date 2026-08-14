# Browser envelope open for encrypted 402 terms

Labels: wayfinder:task
Status: closed

## Question

How does the Consumer web app open `exact-private-envelope-v1` payment terms (and seal the Receipt) without Node `crypto.KeyObject`, matching the server envelope format?

## Why

Current paid server requires envelope. Browser pay threw until this landed. Agent CLI/MCP already speaks envelope.

## Approach

Port X25519 ECDH + HKDF-SHA256 + AES-256-GCM to `@noble` while keeping SPKI/PKCS8 base64url headers compatible with `private-envelope.ts`.

## Outcome

`src/shared/envelope-portable.ts` + cross-compat tests. `web/src/pay.ts` opens terms and seals receipts. Vite env pins the same authorized client key the server accepts.
