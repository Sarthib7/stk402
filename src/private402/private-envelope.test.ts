import assert from "node:assert/strict";
import test from "node:test";

import type { PaymentRequirements } from "@x402/core/types";

import {
  generateClientEnvelopeKey,
  generateServerEnvelopeKey,
  openPaymentTerms,
  openReceipt,
  parseEnvelopePublicKey,
  sealPaymentTerms,
  sealReceipt,
  type EnvelopeContext,
  type SealedValue,
} from "./private-envelope.js";

const requirements: PaymentRequirements = {
  scheme: "exact-private",
  network: "starknet:SN_SEPOLIA",
  asset: "0x333",
  amount: "50",
  payTo: "0x222",
  maxTimeoutSeconds: 900,
  extra: { invoiceId: "0x555", expiresAt: "1000000" },
};

function fixture() {
  const server = generateServerEnvelopeKey();
  const client = generateClientEnvelopeKey();
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
  return { server, client, context, sealed };
}

test("encrypts payment terms for one client key", () => {
  const { server, client, context, sealed } = fixture();

  assert.deepEqual(
    openPaymentTerms(sealed, context, client.privateKey, server.publicKey),
    requirements,
  );
  assert.equal(JSON.stringify(sealed).includes(requirements.payTo), false);
  assert.equal(JSON.stringify(sealed).includes(`\"amount\":\"50\"`), false);
});

test("rejects modified payment terms and context", () => {
  const { server, client, context, sealed } = fixture();
  const flip = (value: string) => `${value[0] === "A" ? "B" : "A"}${value.slice(1)}`;
  for (const changed of [
    { ...sealed, ciphertext: flip(sealed.ciphertext) },
    { ...sealed, tag: flip(sealed.tag) },
  ] satisfies SealedValue[]) {
    assert.throws(
      () => openPaymentTerms(changed, context, client.privateKey, server.publicKey),
      /authentication failed|invalid payment envelope/,
    );
  }
  assert.throws(
    () =>
      openPaymentTerms(
        sealed,
        { ...context, resourceUrl: "https://seller.example/other" },
        client.privateKey,
        server.publicKey,
      ),
    /authentication failed/,
  );
  const wrongServer = generateServerEnvelopeKey();
  assert.throws(
    () =>
      openPaymentTerms(
        sealed,
        context,
        client.privateKey,
        wrongServer.publicKey,
      ),
    /unsupported envelope key/,
  );
});

test("encrypts the signed receipt for the server", () => {
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
    transactionHash: "0x444",
    payer: "0x111",
    signature: ["0x1", "0x2"],
  };
  const sealed = sealReceipt(receipt, context, server.publicKey);

  assert.deepEqual(
    openReceipt(sealed, context, server.privateKey, server.publicKey),
    receipt,
  );
  const wire = JSON.stringify(sealed);
  assert.equal(wire.includes("0x111"), false);
  assert.equal(wire.includes("0x444"), false);
});

test("rejects malformed and non-X25519 public keys", () => {
  assert.throws(() => parseEnvelopePublicKey("x".repeat(257)), /invalid/);
  assert.throws(() => parseEnvelopePublicKey("not-base64!"), /invalid/);
  assert.throws(
    () => parseEnvelopePublicKey(Buffer.from("not a key").toString("base64url")),
    /invalid/,
  );
  const lowOrderKey = Buffer.concat([
    Buffer.from("302a300506032b656e032100", "hex"),
    Buffer.alloc(32),
  ]).toString("base64url");
  assert.throws(() => parseEnvelopePublicKey(lowOrderKey), /invalid/);
});
