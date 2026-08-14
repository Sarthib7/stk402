import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { x402Client } from "@x402/core/client";
import { x402Facilitator } from "@x402/core/facilitator";
import {
  decodePaymentRequiredHeader,
  decodePaymentResponseHeader,
  decodePaymentSignatureHeader,
  encodePaymentSignatureHeader,
} from "@x402/core/http";
import { Signer, stark, typedData } from "starknet";

import {
  InMemoryClaimLedger,
  PrivateExactClient,
  PrivateExactFacilitator,
  buildReceiptTypedData,
  type PaymentEvidence,
  type ClaimLedger,
} from "./signed-receipt.js";
import { createPaidSha256Handler } from "./paid-sha256.js";
import { createHandlerServer } from "./http-server.js";
import { SqliteClaimLedger } from "./claim-ledger.js";
import { SqliteInvoiceStore } from "./invoice-store.js";

const network = "starknet:SN_SEPOLIA" as const;
const payer = "0x111";
const recipient = "0x222";
const token = "0x333";
const transactionHash = "0x444";
const privateKey = "0x1234567890abcdef";

function testFacilitator(ledger: ClaimLedger = new InMemoryClaimLedger()) {
  const evidence: PaymentEvidence = {
    transactionHash,
    payer,
    recipient,
    token,
    amount: 50n,
    final: true,
  };
  const mechanism = new PrivateExactFacilitator({
    ledger,
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
  const ledger = new InMemoryClaimLedger();
  let invoiceId = 0x555n;
  const handler = createPaidSha256Handler({
    network,
    token,
    amount: 50n,
    recipient,
    facilitator: testFacilitator(ledger),
    acceptedTransaction: (invoice) => ledger.transactionForInvoice(invoice),
    createInvoiceId: () => `0x${(invoiceId++).toString(16)}`,
    maxOutstandingInvoices: 1,
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

  const mismatchedExpiry = structuredClone(payment);
  mismatchedExpiry.accepted.extra.expiresAt = "1";
  const wrongExpiry = await handler(
    new Request(requestUrl, {
      headers: {
        "payment-signature": encodePaymentSignatureHeader(mismatchedExpiry),
      },
    }),
  );
  assert.equal(wrongExpiry.status, 400);
  assert.deepEqual(await wrongExpiry.json(), {
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
  assert.equal(replay.status, 200);
  assert.deepEqual(await replay.json(), {
    algorithm: "sha256",
    digest: "a65070b43131abbdd218f04cd403f72a1e8ae00d6f3022b91a794f75aa97e7ed",
  });

  const nextInvoice = await handler(
    new Request("https://seller.example/tools/sha256?text=next"),
  );
  assert.equal(nextInvoice.status, 402);
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

  const malformed = await handler(
    new Request("https://seller.example/tools/sha256?text=stk402", {
      headers: {
        "payment-signature": Buffer.from(
          JSON.stringify({ x402Version: 2 }),
        ).toString("base64"),
      },
    }),
  );
  assert.equal(malformed.status, 400);
  assert.deepEqual(await malformed.json(), { error: "invalid_payment_header" });

  const challenge = await handler(
    new Request("https://seller.example/tools/sha256?text=stk402"),
  );
  const required = decodePaymentRequiredHeader(
    challenge.headers.get("payment-required")!,
  );
  const missingReceipt = await handler(
    new Request("https://seller.example/tools/sha256?text=stk402", {
      headers: {
        "payment-signature": Buffer.from(
          JSON.stringify({ x402Version: 2, accepted: required.accepts[0] }),
        ).toString("base64"),
      },
    }),
  );
  assert.equal(missingReceipt.status, 402);
  assert.deepEqual(await missingReceipt.json(), { error: "invalid_receipt" });
});

test("caps outstanding unpaid invoices", async () => {
  let invoice = 1;
  const handler = createPaidSha256Handler({
    network,
    token,
    amount: 50n,
    recipient,
    facilitator: testFacilitator(),
    createInvoiceId: () => `0x${invoice++}`,
    maxOutstandingInvoices: 2,
  });

  assert.equal(
    (await handler(new Request("https://seller.example/tools/sha256?text=one"))).status,
    402,
  );
  assert.equal(
    (await handler(new Request("https://seller.example/tools/sha256?text=two"))).status,
    402,
  );
  const capped = await handler(
    new Request("https://seller.example/tools/sha256?text=three"),
  );
  assert.equal(capped.status, 503);
  assert.deepEqual(await capped.json(), { error: "invoice_capacity_reached" });
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
    extra: { invoiceId: "0x999", expiresAt: "61000" },
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
    invoiceTimeoutSeconds: 2,
  });
  const originalUrl = "https://seller.example/tools/sha256?text=stk402";
  const unpaid = await handler(new Request(originalUrl));
  const paymentRequired = decodePaymentRequiredHeader(
    unpaid.headers.get("payment-required")!,
  );
  assert.equal(paymentRequired.accepts[0]?.maxTimeoutSeconds, 2);
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

  now += 2_001;
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

test("retries an accepted payment after expiry and server restart", async () => {
  const directory = mkdtempSync(join(tmpdir(), "stk402-restart-retry-"));
  const path = join(directory, "claims.sqlite");
  const requestUrl = "https://seller.example/tools/sha256?text=stk402";
  let now = 1_000;
  let paymentHeader: string;
  let invoiceId = 0x555n;
  const firstLedger = new SqliteClaimLedger(path);
  const firstInvoices = new SqliteInvoiceStore(path);
  try {
    const baseFacilitator = testFacilitator(firstLedger);
    let settlementEntered: (() => void) | undefined;
    let releaseSettlement: (() => void) | undefined;
    const entered = new Promise<void>((resolve) => {
      settlementEntered = resolve;
    });
    const blocked = new Promise<void>((resolve) => {
      releaseSettlement = resolve;
    });
    const first = createPaidSha256Handler({
      network,
      token,
      amount: 50n,
      recipient,
      facilitator: {
        settle: async (payload, requirements) => {
          settlementEntered?.();
          await blocked;
          return baseFacilitator.settle(payload, requirements);
        },
      },
      acceptedTransaction: (invoiceId) =>
        firstLedger.transactionForInvoice(invoiceId),
      invoiceStore: firstInvoices,
      invoiceTimeoutSeconds: 2,
      createInvoiceId: () => `0x${(invoiceId++).toString(16)}`,
      now: () => now,
    });
    const unpaid = await first(new Request(requestUrl));
    const challenge = decodePaymentRequiredHeader(
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
      .createPaymentPayload(challenge);
    paymentHeader = encodePaymentSignatureHeader(payment);
    const paidPromise = first(
      new Request(requestUrl, {
        headers: { "payment-signature": paymentHeader },
      }),
    );
    await entered;
    now = 5_000;
    const prune = await first(
      new Request("https://seller.example/tools/sha256?text=prune"),
    );
    assert.equal(prune.status, 402);
    releaseSettlement?.();
    const paid = await paidPromise;
    assert.equal(paid.status, 200);
  } finally {
    firstLedger.close();
    firstInvoices.close();
  }

  const reopenedLedger = new SqliteClaimLedger(path);
  const reopenedInvoices = new SqliteInvoiceStore(path);
  try {
    const reopened = createPaidSha256Handler({
      network,
      token,
      amount: 50n,
      recipient,
      facilitator: testFacilitator(reopenedLedger),
      acceptedTransaction: (invoiceId) =>
        reopenedLedger.transactionForInvoice(invoiceId),
      invoiceStore: reopenedInvoices,
      invoiceTimeoutSeconds: 2,
      now: () => now,
    });
    const altered = decodePaymentSignatureHeader(paymentHeader!);
    (altered.payload as { transactionHash: string }).transactionHash = "0x445";
    const mismatched = await reopened(
      new Request(requestUrl, {
        headers: {
          "payment-signature": encodePaymentSignatureHeader(altered),
        },
      }),
    );
    assert.equal(mismatched.status, 400);
    assert.deepEqual(await mismatched.json(), { error: "invoice_expired" });
    const retried = await reopened(
      new Request(requestUrl, {
        headers: { "payment-signature": paymentHeader! },
      }),
    );
    assert.equal(retried.status, 200);
    assert.deepEqual(await retried.json(), {
      algorithm: "sha256",
      digest: "a65070b43131abbdd218f04cd403f72a1e8ae00d6f3022b91a794f75aa97e7ed",
    });
  } finally {
    reopenedLedger.close();
    reopenedInvoices.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("recovers a crashed settlement after its lease expires", async () => {
  const directory = mkdtempSync(join(tmpdir(), "stk402-crashed-settlement-"));
  const path = join(directory, "claims.sqlite");
  const requestUrl = "https://seller.example/tools/sha256?text=stk402";
  let now = 1_000;
  let paymentHeader: string;
  const firstLedger = new SqliteClaimLedger(path);
  const firstInvoices = new SqliteInvoiceStore(path);
  try {
    const first = createPaidSha256Handler({
      network,
      token,
      amount: 50n,
      recipient,
      facilitator: testFacilitator(firstLedger),
      acceptedTransaction: (invoice) =>
        firstLedger.transactionForInvoice(invoice),
      invoiceStore: firstInvoices,
      invoiceTimeoutSeconds: 2,
      settlementLeaseMs: 1_000,
      createInvoiceId: () => "0x555",
      now: () => now,
    });
    const unpaid = await first(new Request(requestUrl));
    const challenge = decodePaymentRequiredHeader(
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
      .createPaymentPayload(challenge);
    paymentHeader = encodePaymentSignatureHeader(payment);
    assert.equal(
      firstInvoices.beginSettlement(
        "0x555",
        transactionHash,
        "crashed-worker",
        now,
        1_000,
      ),
      "started",
    );
  } finally {
    firstLedger.close();
    firstInvoices.close();
  }

  now = 5_000;
  const reopenedLedger = new SqliteClaimLedger(path);
  const reopenedInvoices = new SqliteInvoiceStore(path);
  try {
    const reopened = createPaidSha256Handler({
      network,
      token,
      amount: 50n,
      recipient,
      facilitator: testFacilitator(reopenedLedger),
      acceptedTransaction: (invoice) =>
        reopenedLedger.transactionForInvoice(invoice),
      invoiceStore: reopenedInvoices,
      invoiceTimeoutSeconds: 2,
      settlementLeaseMs: 1_000,
      now: () => now,
    });
    const paid = await reopened(
      new Request(requestUrl, {
        headers: { "payment-signature": paymentHeader! },
      }),
    );
    assert.equal(paid.status, 200);
    assert.equal(
      reopenedLedger.transactionForInvoice("0x555"),
      transactionHash,
    );
  } finally {
    reopenedLedger.close();
    reopenedInvoices.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
