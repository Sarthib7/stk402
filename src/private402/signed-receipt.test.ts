import assert from "node:assert/strict";
import test from "node:test";

import { x402Facilitator } from "@x402/core/facilitator";
import { x402Client } from "@x402/core/client";
import { Signer, stark, typedData } from "starknet";

import {
  InMemoryClaimLedger,
  PrivateExactClient,
  PrivateExactFacilitator,
  buildReceiptTypedData,
  createPrivatePaymentRequired,
  invoiceExpiresAt,
  type PaymentEvidence,
  type SignedReceipt,
} from "./signed-receipt.js";

const network = "starknet:SN_SEPOLIA" as const;
const payer = "0x111";
const recipient = "0x222";
const token = "0x333";
const transactionHash = "0x444";
const invoiceId = "0x555";

const requirements = {
  scheme: "exact-private",
  network,
  asset: token,
  amount: "50",
  payTo: recipient,
  maxTimeoutSeconds: 60,
  extra: { invoiceId, expiresAt: "1000000" },
};

const evidence: PaymentEvidence = {
  transactionHash,
  payer,
  recipient,
  token,
  amount: 50n,
  final: true,
};

async function signedReceipt(privateKey: string): Promise<SignedReceipt> {
  const signer = new Signer(privateKey);
  const signature = stark.signatureToHexArray(
    await signer.signMessage(
      buildReceiptTypedData(requirements, transactionHash),
      payer,
    ),
  );

  return { invoiceId, transactionHash, payer, signature };
}

function facilitator(privateKey: string) {
  const publicKey = stark.getFullPublicKey(privateKey);
  const mechanism = new PrivateExactFacilitator({
    ledger: new InMemoryClaimLedger(),
    evidenceReader: {
      findPayment: async (hash) =>
        BigInt(hash) === BigInt(transactionHash) ? evidence : null,
    },
    signatureVerifier: {
      verify: async (message, signature) =>
        typedData.verifyMessage(message, signature, publicKey, payer),
    },
  });

  return new x402Facilitator().register(network, mechanism);
}

test("settles one signed private receipt and accepts its exact retry", async () => {
  const privateKey = "0x1234567890abcdef";
  const receipt = await signedReceipt(privateKey);
  const paymentPayload = {
    x402Version: 2,
    accepted: requirements,
    payload: receipt,
  };
  const instance = facilitator(privateKey);

  const verified = await instance.verify(paymentPayload, requirements);
  assert.equal(verified.isValid, true);
  assert.equal(BigInt(verified.payer!), BigInt(payer));

  const settled = await instance.settle(paymentPayload, requirements);
  assert.equal(settled.success, true);
  assert.equal(settled.transaction, transactionHash);
  assert.equal(settled.amount, "50");

  const replay = await instance.settle(paymentPayload, requirements);
  assert.equal(replay.success, true);
  assert.equal(replay.transaction, transactionHash);
});

test("creates an x402 payment payload from a private payment requirement", async () => {
  const receipt = await signedReceipt("0x1234567890abcdef");
  const paymentRequired = createPrivatePaymentRequired({
    network,
    token,
    amount: 50n,
    recipient,
    invoiceId,
    maxTimeoutSeconds: 900,
    expiresAt: 1_000_000,
    resource: { url: "https://seller.example/private-data" },
  });
  const client = new x402Client().register(
    network,
    new PrivateExactClient({ createReceipt: async () => receipt }),
  );

  const payload = await client.createPaymentPayload(paymentRequired);

  assert.equal(payload.x402Version, 2);
  assert.equal(payload.accepted.scheme, "exact-private");
  assert.equal(payload.payload.transactionHash, transactionHash);
  assert.equal(payload.resource?.url, "https://seller.example/private-data");
});

test("rejects a signature from another payer key", async () => {
  const expectedPrivateKey = "0x1234567890abcdef";
  const attackerReceipt = await signedReceipt("0xabcdef1234567890");
  const result = await facilitator(expectedPrivateKey).verify(
    {
      x402Version: 2,
      accepted: requirements,
      payload: attackerReceipt,
    },
    requirements,
  );

  assert.equal(result.isValid, false);
  assert.equal(result.invalidReason, "invalid_signature");
});

test("rejects a signature created for another invoice expiry", async () => {
  const privateKey = "0x1234567890abcdef";
  const receipt = await signedReceipt(privateKey);
  const changedRequirements = {
    ...requirements,
    extra: { ...requirements.extra, expiresAt: "1000001" },
  };
  const instance = facilitator(privateKey);
  const verified = await instance.verify(
    {
      x402Version: 2,
      accepted: changedRequirements,
      payload: receipt,
    },
    changedRequirements,
  );

  assert.equal(verified.isValid, false);
  assert.equal(verified.invalidReason, "invalid_signature");
});

test("rejects malformed absolute invoice expiry", () => {
  for (const expiresAt of [undefined, "abc", "9007199254740992", "0"]) {
    assert.throws(
      () =>
        invoiceExpiresAt({
          ...requirements,
          extra: { ...requirements.extra, expiresAt },
        }),
      /invalid_invoice_expiry/,
    );
  }
});

test("rejects evidence with the wrong amount", async () => {
  const privateKey = "0x1234567890abcdef";
  const receipt = await signedReceipt(privateKey);
  const mechanism = new PrivateExactFacilitator({
    ledger: new InMemoryClaimLedger(),
    evidenceReader: {
      findPayment: async () => ({ ...evidence, amount: 49n }),
    },
    signatureVerifier: {
      verify: async (message, signature) =>
        typedData.verifyMessage(
          message,
          signature,
          stark.getFullPublicKey(privateKey),
          payer,
        ),
    },
  });

  const result = await mechanism.verify(
    { x402Version: 2, accepted: requirements, payload: receipt },
    requirements,
  );

  assert.equal(result.isValid, false);
  assert.equal(result.invalidReason, "payment_mismatch");
});

test("rejects malformed receipt payloads at the trust boundary", async () => {
  const result = await facilitator("0x1234567890abcdef").verify(
    {
      x402Version: 2,
      accepted: requirements,
      payload: { invoiceId, transactionHash, payer, signature: [] },
    },
    requirements,
  );

  assert.equal(result.isValid, false);
  assert.equal(result.invalidReason, "invalid_receipt");
});
