import assert from "node:assert/strict";
import test from "node:test";

import { x402Client } from "@x402/core/client";
import { x402Facilitator } from "@x402/core/facilitator";
import {
  decodePaymentRequiredHeader,
  decodePaymentResponseHeader,
  encodePaymentSignatureHeader,
} from "@x402/core/http";
import { Signer, stark, typedData } from "starknet";

import {
  InMemoryClaimLedger,
  PrivateExactClient,
  PrivateExactFacilitator,
  buildReceiptTypedData,
  type PaymentEvidence,
} from "./signed-receipt.js";
import { createPaidSha256Handler } from "./paid-sha256.js";
import { createHandlerServer } from "./http-server.js";

const network = "starknet:SN_SEPOLIA" as const;
const payer = "0x111";
const recipient = "0x222";
const token = "0x333";
const transactionHash = "0x444";
const privateKey = "0x1234567890abcdef";

function testFacilitator() {
  const evidence: PaymentEvidence = {
    transactionHash,
    payer,
    recipient,
    token,
    amount: 50n,
    final: true,
  };
  const mechanism = new PrivateExactFacilitator({
    ledger: new InMemoryClaimLedger(),
    evidenceReader: {
      findPayment: async (hash) =>
        BigInt(hash) === BigInt(transactionHash) ? evidence : null,
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
  return new x402Facilitator().register(network, mechanism);
}

test("returns 402, settles a private receipt, then returns the tool result", async () => {
  const handler = createPaidSha256Handler({
    network,
    token,
    amount: 50n,
    recipient,
    facilitator: testFacilitator(),
    createInvoiceId: () => "0x555",
  });
  const requestUrl = "https://seller.example/tools/sha256?text=stk402";

  const unpaid = await handler(new Request(requestUrl));
  assert.equal(unpaid.status, 402);
  const paymentRequired = decodePaymentRequiredHeader(
    unpaid.headers.get("payment-required")!,
  );

  const signer = new Signer(privateKey);
  const client = new x402Client().register(
    network,
    new PrivateExactClient({
      createReceipt: async (requirements) => ({
        invoiceId: requirements.extra.invoiceId as string,
        transactionHash,
        payer,
        signature: stark.signatureToHexArray(
          await signer.signMessage(
            buildReceiptTypedData(requirements, transactionHash),
            payer,
          ),
        ),
      }),
    }),
  );
  const payment = await client.createPaymentPayload(paymentRequired);

  const mismatchedPayment = structuredClone(payment);
  mismatchedPayment.accepted.amount = "49";
  const mismatched = await handler(
    new Request(requestUrl, {
      headers: {
        "payment-signature": encodePaymentSignatureHeader(mismatchedPayment),
      },
    }),
  );
  assert.equal(mismatched.status, 400);
  assert.deepEqual(await mismatched.json(), {
    error: "payment_requirements_mismatch",
  });

  const paid = await handler(
    new Request(requestUrl, {
      headers: { "payment-signature": encodePaymentSignatureHeader(payment) },
    }),
  );
  assert.equal(paid.status, 200);
  assert.deepEqual(await paid.json(), {
    algorithm: "sha256",
    digest: "a65070b43131abbdd218f04cd403f72a1e8ae00d6f3022b91a794f75aa97e7ed",
  });
  const settlement = decodePaymentResponseHeader(
    paid.headers.get("payment-response")!,
  );
  assert.equal(settlement.success, true);
  assert.equal(settlement.transaction, transactionHash);

  const replay = await handler(
    new Request(requestUrl, {
      headers: { "payment-signature": encodePaymentSignatureHeader(payment) },
    }),
  );
  assert.equal(replay.status, 402);
  assert.deepEqual(await replay.json(), { error: "transaction_used" });
});

test("rejects an invalid tool request before asking for payment", async () => {
  const handler = createPaidSha256Handler({
    network,
    token,
    amount: 50n,
    recipient,
    facilitator: testFacilitator(),
    createInvoiceId: () => "0x555",
  });

  const response = await handler(
    new Request("https://seller.example/tools/sha256"),
  );

  assert.equal(response.status, 400);
  assert.equal(response.headers.has("payment-required"), false);

  const wrongPath = await handler(
    new Request("https://seller.example/other?text=stk402"),
  );
  assert.equal(wrongPath.status, 404);
});

test("rejects a receipt for an invoice the server did not issue", async () => {
  const handler = createPaidSha256Handler({
    network,
    token,
    amount: 50n,
    recipient,
    facilitator: testFacilitator(),
    createInvoiceId: () => "0x555",
  });
  const forgedRequirements = {
    scheme: "exact-private",
    network,
    asset: token,
    amount: "50",
    payTo: recipient,
    maxTimeoutSeconds: 60,
    extra: { invoiceId: "0x999" },
  };
  const signer = new Signer(privateKey);
  const forgedPayment = {
    x402Version: 2,
    accepted: forgedRequirements,
    payload: {
      invoiceId: "0x999",
      transactionHash,
      payer,
      signature: stark.signatureToHexArray(
        await signer.signMessage(
          buildReceiptTypedData(forgedRequirements, transactionHash),
          payer,
        ),
      ),
    },
  };

  const response = await handler(
    new Request("https://seller.example/tools/sha256?text=stk402", {
      headers: {
        "payment-signature": encodePaymentSignatureHeader(forgedPayment),
      },
    }),
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "unknown_invoice" });
});

test("binds an invoice to its request and expiry", async () => {
  let now = 1_000;
  const handler = createPaidSha256Handler({
    network,
    token,
    amount: 50n,
    recipient,
    facilitator: testFacilitator(),
    createInvoiceId: () => "0x555",
    now: () => now,
  });
  const originalUrl = "https://seller.example/tools/sha256?text=stk402";
  const unpaid = await handler(new Request(originalUrl));
  const paymentRequired = decodePaymentRequiredHeader(
    unpaid.headers.get("payment-required")!,
  );
  const signer = new Signer(privateKey);
  const payment = await new x402Client()
    .register(
      network,
      new PrivateExactClient({
        createReceipt: async (requirements) => ({
          invoiceId: requirements.extra.invoiceId as string,
          transactionHash,
          payer,
          signature: stark.signatureToHexArray(
            await signer.signMessage(
              buildReceiptTypedData(requirements, transactionHash),
              payer,
            ),
          ),
        }),
      }),
    )
    .createPaymentPayload(paymentRequired);
  const signature = encodePaymentSignatureHeader(payment);

  const wrongRequest = await handler(
    new Request("https://seller.example/tools/sha256?text=other", {
      headers: { "payment-signature": signature },
    }),
  );
  assert.equal(wrongRequest.status, 400);
  assert.deepEqual(await wrongRequest.json(), { error: "invoice_mismatch" });

  now += 60_001;
  const expired = await handler(
    new Request(originalUrl, {
      headers: { "payment-signature": signature },
    }),
  );
  assert.equal(expired.status, 400);
  assert.deepEqual(await expired.json(), { error: "invoice_expired" });
});

test("serves the payment challenge over a real HTTP socket", async (context) => {
  const server = createHandlerServer(
    createPaidSha256Handler({
      network,
      token,
      amount: 50n,
      recipient,
      facilitator: testFacilitator(),
      createInvoiceId: () => "0x555",
    }),
  );
  context.after(() => server.close());
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert(address && typeof address === "object");

  const response = await fetch(
    `http://127.0.0.1:${address.port}/tools/sha256?text=stk402`,
  );

  assert.equal(response.status, 402);
  const paymentRequired = decodePaymentRequiredHeader(
    response.headers.get("payment-required")!,
  );
  assert.equal(paymentRequired.accepts[0]?.scheme, "exact-private");

  const signer = new Signer(privateKey);
  const payment = await new x402Client()
    .register(
      network,
      new PrivateExactClient({
        createReceipt: async (requirements) => ({
          invoiceId: requirements.extra.invoiceId as string,
          transactionHash,
          payer,
          signature: stark.signatureToHexArray(
            await signer.signMessage(
              buildReceiptTypedData(requirements, transactionHash),
              payer,
            ),
          ),
        }),
      }),
    )
    .createPaymentPayload(paymentRequired);
  const paid = await fetch(
    `http://127.0.0.1:${address.port}/tools/sha256?text=stk402`,
    {
      headers: {
        "payment-signature": encodePaymentSignatureHeader(payment),
      },
    },
  );

  assert.equal(paid.status, 200);
  assert.deepEqual(await paid.json(), {
    algorithm: "sha256",
    digest: "a65070b43131abbdd218f04cd403f72a1e8ae00d6f3022b91a794f75aa97e7ed",
  });
  assert.equal(
    decodePaymentResponseHeader(paid.headers.get("payment-response")!).success,
    true,
  );
});
