# Browser envelope open for encrypted 402 terms

Labels: wayfinder:task
Status: open

## Question

How does the Consumer web app open `exact-private-envelope-v1` payment terms (and seal the Receipt) without Node `crypto.KeyObject`, matching the server envelope format?

## Why

Current paid server requires envelope. Browser pay throws until this lands. Agent CLI/MCP already speaks envelope.

## Approach

Port X25519 ECDH + HKDF-SHA256 + AES-256-GCM to Web Crypto / `@noble` while keeping SPKI/PKCS8 base64url headers compatible with `private-envelope.ts`.
