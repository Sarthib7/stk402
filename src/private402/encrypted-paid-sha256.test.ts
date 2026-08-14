import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { x402Facilitator } from "@x402/core/facilitator";
import { decodePaymentRequiredHeader } from "@x402/core/http";
import { Signer, stark, typedData } from "starknet";

import { createPaidSha256Handler } from "./paid-sha256.js";
import { payResource } from "./pay-resource.js";
import type {
  PaymentSession,
  PaymentSessionStore,
} from "./payment-session.js";
import { generateServerEnvelopeKey } from "./private-envelope.js";
import { SqliteClaimLedger } from "./claim-ledger.js";
import { SqliteInvoiceStore } from "./invoice-store.js";
import {
  InMemoryClaimLedger,
  PrivateExactFacilitator,
  buildReceiptTypedData,
  type ClaimLedger,
  type PaymentEvidence,
} from "./signed-receipt.js";

const network = "starknet:SN_SEPOLIA" as const;
const payer = "0x111111111111111111111111111111111";
const recipient = "0x222222222222222222222222222222222";
const token = "0x333333333333333333333333333333333";
const transactionHash = "0x444444444444444444444444444444444";
const amount = 123456789012345678n;
const privateKey = "0x1234567890abcdef";
const resourceUrl = "https://seller.example/tools/sha256?text=stk402";

function memorySession(): PaymentSessionStore {
  let session: PaymentSession | null = null;
  return {
    load: () => session,
    claim: (_url, paymentRequired, privateRequirements) => {
      session ??= {
        state: "pending",
        paymentRequired,
        ...(privateRequirements ? { privateRequirements } : {}),
      };
      return session;
    },
    complete: (_url, result) => {
      session = { state: "completed", result };
    },
    clearPending: () => {
      session = null;
    },
    acknowledge: () => {
      session = null;
    },
  };
}

function facilitator(ledger: ClaimLedger = new InMemoryClaimLedger()) {
  const evidence: PaymentEvidence = {
    transactionHash,
    payer,
    recipient,
    token,
    amount,
    final: true,
  };
  return new x402Facilitator().register(
    network,
    new PrivateExactFacilitator({
      ledger,
      evidenceReader: { findPayment: async () => evidence },
      signatureVerifier: {
        verify: async (message, signature) =>
          typedData.verifyMessage(
            message,
            signature,
            stark.getFullPublicKey(privateKey),
            payer,
          ),
      },
    }),
  );
}

test("hides payment terms and receipt metadata from x402 headers", async () => {
  const server = generateServerEnvelopeKey();
  const client = generateServerEnvelopeKey();
  const handler = createPaidSha256Handler({
    network,
    token,
    amount,
    recipient,
    facilitator: facilitator(),
    createInvoiceId: () => "0x555",
    serverEnvelopePrivateKey: server.privateKey,
    serverEnvelopePublicKey: server.publicKey,
    authorizedClientEnvelopePublicKey: client.publicKeyValue,
  });
  const wireHeaders: string[] = [];
  const fetcher = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    const response = await handler(new Request(input, init));
    for (const name of [
      "payment-required",
      "payment-signature",
      "payment-response",
    ]) {
      const requestValue = new Headers(init?.headers).get(name);
      const responseValue = response.headers.get(name);
      if (requestValue) wireHeaders.push(requestValue);
      if (responseValue) wireHeaders.push(responseValue);
    }
    if (response.status === 402 && response.headers.has("payment-required")) {
      assert.equal(response.headers.get("cache-control"), "private, no-store");
      assert.equal(response.headers.get("vary"), "stk402-client-key");
      const challenge = decodePaymentRequiredHeader(
        response.headers.get("payment-required")!,
      );
      assert.equal(challenge.accepts[0]?.amount, "0");
      assert.equal(challenge.accepts[0]?.payTo, "0x0");
    }
    return response;
  }) as typeof fetch;
  const signer = new Signer(privateKey);

  const result = await payResource(
    resourceUrl,
    network,
    {
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
    },
    memorySession(),
    fetcher,
    server.publicKey,
    {
      publicKeyHeader: client.publicKeyValue,
      publicKey: client.publicKey,
      privateKey: client.privateKey,
    },
  );

  assert.equal(result.status, 200);
  assert.equal(result.settlement.success, true);
  const wire = [
    ...wireHeaders,
    ...wireHeaders.map((header) => Buffer.from(header, "base64").toString("utf8")),
  ].join("\n");
  assert.equal(wire.includes(recipient), false);
  assert.equal(wire.includes(amount.toString()), false);
  assert.equal(wire.includes(payer), false);
  assert.equal(wire.includes(transactionHash), false);
});

test("replays one accepted encrypted receipt after server restart", async () => {
  const directory = mkdtempSync(join(tmpdir(), "stk402-envelope-restart-"));
  const path = join(directory, "claims.sqlite");
  const server = generateServerEnvelopeKey();
  const client = generateServerEnvelopeKey();
  let paidHeader = "";
  try {
    const ledger = new SqliteClaimLedger(path);
    const invoices = new SqliteInvoiceStore(path);
    const handler = createPaidSha256Handler({
      network,
      token,
      amount,
      recipient,
      facilitator: facilitator(ledger),
      acceptedTransaction: (invoiceId) =>
        ledger.transactionForInvoice(invoiceId),
      invoiceStore: invoices,
      createInvoiceId: () => "0x555",
      serverEnvelopePrivateKey: server.privateKey,
      serverEnvelopePublicKey: server.publicKey,
      authorizedClientEnvelopePublicKey: client.publicKeyValue,
    });
    const signer = new Signer(privateKey);
    const fetcher = (async (
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      paidHeader = new Headers(init?.headers).get("payment-signature") ?? paidHeader;
      return handler(new Request(input, init));
    }) as typeof fetch;
    await payResource(
      resourceUrl,
      network,
      {
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
      },
      memorySession(),
      fetcher,
      server.publicKey,
      {
        publicKeyHeader: client.publicKeyValue,
        publicKey: client.publicKey,
        privateKey: client.privateKey,
      },
    );
    assert.notEqual(paidHeader, "");
    invoices.close();
    ledger.close();

    const reopenedLedger = new SqliteClaimLedger(path);
    const reopenedInvoices = new SqliteInvoiceStore(path);
    try {
      const restarted = createPaidSha256Handler({
        network,
        token,
        amount,
        recipient,
        facilitator: facilitator(reopenedLedger),
        acceptedTransaction: (invoiceId) =>
          reopenedLedger.transactionForInvoice(invoiceId),
        invoiceStore: reopenedInvoices,
        serverEnvelopePrivateKey: server.privateKey,
        serverEnvelopePublicKey: server.publicKey,
        authorizedClientEnvelopePublicKey: client.publicKeyValue,
      });
      const replay = await restarted(
        new Request(resourceUrl, {
          headers: { "payment-signature": paidHeader },
        }),
      );
      assert.equal(replay.status, 200);
    } finally {
      reopenedInvoices.close();
      reopenedLedger.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("requires a valid client encryption key before issuing an invoice", async () => {
  const server = generateServerEnvelopeKey();
  const client = generateServerEnvelopeKey();
  const handler = createPaidSha256Handler({
    network,
    token,
    amount,
    recipient,
    facilitator: facilitator(),
    serverEnvelopePrivateKey: server.privateKey,
    serverEnvelopePublicKey: server.publicKey,
    authorizedClientEnvelopePublicKey: client.publicKeyValue,
  });

  const missing = await handler(new Request(resourceUrl));
  assert.equal(missing.status, 400);
  assert.deepEqual(await missing.json(), {
    error: "missing_client_encryption_key",
  });
  const invalid = await handler(
    new Request(resourceUrl, {
      headers: { "stk402-client-key": "not-a-key" },
    }),
  );
  assert.equal(invalid.status, 400);
  assert.deepEqual(await invalid.json(), {
    error: "invalid_client_encryption_key",
  });

  const attacker = generateServerEnvelopeKey();
  const unauthorized = await handler(
    new Request(resourceUrl, {
      headers: { "stk402-client-key": attacker.publicKeyValue },
    }),
  );
  assert.equal(unauthorized.status, 403);
});
