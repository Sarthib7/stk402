import assert from "node:assert/strict";
import test from "node:test";

import type { PaymentRequirements } from "@x402/core/types";

import {
  generateClientEnvelopeKey as generateNodeClientKey,
  generateServerEnvelopeKey,
  openPaymentTerms as openNodeTerms,
  openReceipt,
  parseEnvelopePublicKey,
  sealPaymentTerms,
  sealReceipt as sealNodeReceipt,
  type EnvelopeContext,
} from "../private402/private-envelope.js";
import {
  generateClientEnvelopeKey as generatePortableClientKey,
  openPaymentTerms as openPortableTerms,
  sealReceipt as sealPortableReceipt,
} from "./envelope-portable.js";

const requirements: PaymentRequirements = {
  scheme: "exact-private",
  network: "starknet:SN_SEPOLIA",
  asset: "0x333",
  amount: "50",
  payTo: "0x222",
  maxTimeoutSeconds: 900,
  extra: { invoiceId: "0x555", expiresAt: "1000000" },
};

test("portable client opens terms sealed by Node server", () => {
  const server = generateServerEnvelopeKey();
  const client = generatePortableClientKey();
  const context: EnvelopeContext = {
    invoiceId: "0x555",
    resourceUrl: "https://seller.example/tools/sha256?text=stk402",
    network: requirements.network,
    asset: requirements.asset,
    maxTimeoutSeconds: requirements.maxTimeoutSeconds,
    expiresAt: requirements.extra.expiresAt as string,
    clientPublicKey: client.publicKeyHeader,
  };
  const sealed = sealPaymentTerms(
    requirements,
    context,
    server.privateKey,
    parseEnvelopePublicKey(client.publicKeyHeader),
    server.publicKey,
  );

  assert.deepEqual(
    openPortableTerms(
      sealed,
      context,
      client.privateKeyValue,
      server.publicKeyValue,
    ),
    requirements,
  );
});

test("Node server opens receipt sealed by portable client", () => {
  const server = generateServerEnvelopeKey();
  const context = {
    invoiceId: "0x555",
    resourceUrl: "https://seller.example/tools/sha256?text=stk402",
    network: requirements.network,
    asset: requirements.asset,
    maxTimeoutSeconds: requirements.maxTimeoutSeconds,
    expiresAt: requirements.extra.expiresAt as string,
  };
  const receipt = {
    invoiceId: "0x555",
    transactionHash: "0xabc",
    payer: "0x111",
    signature: ["0x1", "0x2"],
  };
  const sealed = sealPortableReceipt(receipt, context, server.publicKeyValue);

  assert.deepEqual(
    openReceipt(sealed, context, server.privateKey, server.publicKey),
    receipt,
  );
});

test("Node client opens terms when portable generated the keypair used by Node seal", () => {
  const server = generateServerEnvelopeKey();
  const client = generateNodeClientKey();
  const context: EnvelopeContext = {
    invoiceId: "0x555",
    resourceUrl: "https://seller.example/tools/sha256?text=stk402",
    network: requirements.network,
    asset: requirements.asset,
    maxTimeoutSeconds: requirements.maxTimeoutSeconds,
    expiresAt: requirements.extra.expiresAt as string,
    clientPublicKey: client.publicKeyHeader,
  };
  const sealed = sealPaymentTerms(
    requirements,
    context,
    server.privateKey,
    client.publicKey,
    server.publicKey,
  );
  assert.deepEqual(
    openNodeTerms(sealed, context, client.privateKey, server.publicKey),
    requirements,
  );
  const portableReceipt = sealPortableReceipt(
    { ok: true },
    {
      invoiceId: context.invoiceId,
      resourceUrl: context.resourceUrl,
      network: context.network,
      asset: context.asset,
      maxTimeoutSeconds: context.maxTimeoutSeconds,
      expiresAt: context.expiresAt,
    },
    server.publicKeyValue,
  );
  assert.equal(
    openReceipt(
      portableReceipt,
      {
        invoiceId: context.invoiceId,
        resourceUrl: context.resourceUrl,
        network: context.network,
        asset: context.asset,
        maxTimeoutSeconds: context.maxTimeoutSeconds,
        expiresAt: context.expiresAt,
      },
      server.privateKey,
      server.publicKey,
    ).ok,
    true,
  );
  assert.equal(typeof sealNodeReceipt, "function");
});
