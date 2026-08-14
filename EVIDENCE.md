# STK402 evidence

Evidence date: 2026-08-14

This record uses these labels:

- **VERIFIED** means the command ran and its output was inspected during this build session.
- **REPORTED** means another reviewer supplied the result and the primary session did not repeat it.
- **INFERRED** means the conclusion follows from cited source code or measured results.

## Current result

**VERIFIED:** Two disposable accounts were deployed on Starknet Sepolia. Each account completed a standalone STK402 typed-message signature preflight. The Sepolia RPC verified both signatures through the deployed account contracts. These preflights were not invoice settlement receipts.

**VERIFIED:** Each account completed one STRK20 private funding transaction. Both receipts reported `SUCCEEDED` and `ACCEPTED_ON_L2`.

| Role | Transaction | Configured private deposit | Pool fee | Actual network fee | Result |
| --- | --- | ---: | ---: | ---: | --- |
| Recipient | [`0x53b90c...99f6`](https://sepolia.starkscan.co/tx/0x53b90ca2657a54ed087d515b351eead05972dc402ea744ca33314b6043699f6) | 10 FRI | 2 STRK | 3.419623102884746880 STRK | `SUCCEEDED`, `ACCEPTED_ON_L2` |
| Payer | [`0x68e9fb...112a`](https://sepolia.starkscan.co/tx/0x68e9fb7ca6cd6ace1c50f78e5a29d8be77de151e22d362718de27a6f279112a) | 10 FRI | 2 STRK | 3.419623850781461280 STRK | `SUCCEEDED`, `ACCEPTED_ON_L2` |

**VERIFIED:** Repeating each funding command returned its stored transaction hash. It did not create another funding transaction.

```text
recipient retry: 0x53b90ca2657a54ed087d515b351eead05972dc402ea744ca33314b6043699f6
payer retry:     0x68e9fb7ca6cd6ace1c50f78e5a29d8be77de151e22d362718de27a6f279112a
```

**VERIFIED:** The paid HTTPS endpoint returned an x402 `402 Payment Required` response. Its challenge selected `exact-private`, Starknet Sepolia, the configured STRK token, the configured recipient, and the configured price.

**VERIFIED:** The payer completed the challenged private payment. The endpoint returned HTTP `200`, settlement success, and the expected SHA-256 digest for `stk402`.

| Transaction | Private amount | Pool fee | Actual network fee | Result |
| --- | ---: | ---: | ---: | --- |
| [`0x22864d...2edc`](https://sepolia.starkscan.co/tx/0x22864d55577d54fb540b3663ba689061a5ba95424cd49ae67a372f7c9422edc) | 1 FRI | 2 STRK | 3.314914121664020544 STRK | `SUCCEEDED`, `ACCEPTED_ON_L2` |

```json
{
  "status": 200,
  "body": {
    "algorithm": "sha256",
    "digest": "a65070b43131abbdd218f04cd403f72a1e8ae00d6f3022b91a794f75aa97e7ed"
  },
  "settlement": {
    "success": true,
    "transaction": "0x22864d55577d54fb540b3663ba689061a5ba95424cd49ae67a372f7c9422edc",
    "network": "starknet:SN_SEPOLIA",
    "amount": "1"
  }
}
```

**VERIFIED:** A local SHA-256 calculation for `stk402` returned the same digest.

**VERIFIED:** Repeating the payer command returned the stored HTTP `200` result and the same settlement transaction. The payer journal still contains one payment transaction.

## Public setup transactions

**VERIFIED:** The following transactions created and funded the disposable Sepolia test setup.

| Purpose | Transaction |
| --- | --- |
| Deploy recipient account | [`0x6251d7...ac2f`](https://sepolia.starkscan.co/tx/0x6251d7c299723c3922ee64ca15c169217fa4608e9be4492686910a8d050ac2f) |
| Deploy payer account | [`0x77d768...2293`](https://sepolia.starkscan.co/tx/0x77d7684749cbc6930c964dea51b5816620e18aac03ddeb88d0e0d1781352293) |
| Transfer 20 test STRK to payer | [`0x6c830e...5227`](https://sepolia.starkscan.co/tx/0x6c830e1fdd4175989e15e4b3b97452631f7bb14533bfd1faadf6cdf40f95227) |

## How the private flow works

**VERIFIED (source):** `payResource` requests the resource without payment. It requires a `402` response, validates the challenged resource URL, stores the challenge, creates the private payment payload, retries the resource with the payment header, and persists the completed result. See `src/private402/pay-resource.ts:30`.

**VERIFIED (source):** The payer refreshes its private notes through the configured discovery provider. It uses `latest - 10` as the proving block, requests a proof, checks that the returned call targets the configured pool and `apply_actions`, checks pool and network fee caps, reserves the daily budget, and submits the transaction. See `src/private402/agent-payer.ts:155`.

**VERIFIED (source):** After successful L2 or L1 acceptance, the payer signs typed receipt data that binds the invoice and transaction. See `src/private402/agent-payer.ts:251` and `src/private402/signed-receipt.ts:176`.

**VERIFIED (source):** The server uses OHTTP discovery, RPC finality, Starknet account signature verification, a SQLite claim ledger, and a SQLite invoice store. See `src/private402/server-runtime.ts:28`.

**VERIFIED (source):** The paid route validates the stored invoice before settlement. It fences concurrent settlement with a lease, accepts an exact settled retry, and returns the SHA-256 result only after settlement succeeds. See `src/private402/paid-sha256.ts:145`.

## Reproduction

**VERIFIED:** Runtime values are loaded from ignored environment files. The commands below contain no address, endpoint, or key literal.

```sh
npm run check:sepolia
npm run fund:payer
npm run serve:paid
npm run pay:resource
```

**VERIFIED:** The recipient funding command uses the same entry point with its separate ignored environment file.

```sh
node --env-file=.env.recipient --import tsx src/private402/fund.ts
```

**VERIFIED:** The complete local unit suite passed.

```text
tests 80
pass 80
fail 0
```

**REPORTED:** A fresh consumer reran the funding and payer-journal slice. It reported `7 passed` and `0 failed`.

## Secret and replay controls

**VERIFIED:** `.gitignore` excludes `.env.*`, `data/`, `.cache/`, and `.tools/`. It includes only the environment examples.

**VERIFIED:** The recipient and payer use different environment files, account keys, viewing keys, funding identifiers, and SQLite files.

**VERIFIED:** Both funding journals contain one `submitted` row with the matching transaction hash. Preserve these files and funding identifiers. Losing a journal removes the local duplicate-deposit guard.

**VERIFIED:** The payer journal contains one submitted payment row for the live transaction. The server claim ledger binds the accepted invoice to the same transaction. The payment session is `completed`.

**VERIFIED:** The daily budget reserved `9.443587309216748097 STRK`. This is the private amount plus the pool fee and estimated maximum network fee. The actual network fee was lower.

**VERIFIED:** No private key or viewing key appears in this document.

## Blind spots

**VERIFIED:** The live flow proves OHTTP note discovery, hosted proof generation, one private transfer, RPC finality, account receipt signing, server evidence lookup, SQLite settlement, and paid resource delivery on Sepolia.

**VERIFIED:** The repeated payer command exercised the durable completed-session path. It did not resend the signed receipt to the server. Server-side recovery after a lost paid response remains covered by local tests, not this live run.

**VERIFIED:** The accepted invoice keeps its old settlement lease fields. Its `accepted` state blocks another settlement, but the stale fields can confuse later audits.

**VERIFIED:** The Sepolia funding transactions test real hosted proving and real on-chain execution. They do not establish Mainnet behavior.

**INFERRED:** Direct OHTTP encrypts discovery requests in transit to the configured discovery operator. The operator must decrypt the request to return account-specific notes, so the operator remains trusted with that viewing data.

**VERIFIED:** `cloudflared` identified the endpoint as an account-less quick tunnel and printed that it has no uptime guarantee.

## Least confident decisions

1. **INFERRED:** The current 8 STRK network-fee cap gives enough room for the measured Sepolia estimate. Fee conditions can change before a later payment.
2. **INFERRED:** The discovery operator remains inside the privacy trust boundary because it decrypts viewing-key-derived query data. OHTTP protects the request before it reaches that operator.
