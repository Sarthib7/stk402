import assert from "node:assert/strict";
import test from "node:test";

import {
  encodePaymentRequiredHeader,
  encodePaymentResponseHeader,
} from "@x402/core/http";
import type { PaymentRequirements } from "@x402/core/types";

import { payResource } from "./pay-resource.js";
import type { PaymentSessionStore } from "./payment-session.js";
import { createPrivatePaymentRequired } from "./signed-receipt.js";

const network = "starknet:SN_SEPOLIA" as const;
const resourceUrl = "https://seller.example/tools/sha256?text=stk402";

function memorySession(): PaymentSessionStore {
  let value: ReturnType<PaymentSessionStore["load"]> = null;
  return {
    load: () => value,
    claim: (_resourceUrl, paymentRequired) => {
      value ??= { state: "pending", paymentRequired };
      return value;
    },
    complete: (_resourceUrl, result) => {
      value = { state: "completed", result };
    },
    clearPending: () => {
      if (value?.state !== "pending") throw new Error("pending session missing");
      value = null;
    },
    acknowledge: () => {
      if (value?.state !== "completed") throw new Error("completed session missing");
      value = null;
    },
  };
}

test("gets a challenge, creates payment, and returns the paid resource", async () => {
  const paymentRequired = createPrivatePaymentRequired({
    network,
    token: "0x333",
    amount: 50n,
    recipient: "0x222",
    invoiceId: "0x555",
    maxTimeoutSeconds: 900,
    expiresAt: 1_000_000,
    resource: { url: resourceUrl },
  });
  const requests: Array<RequestInit | undefined> = [];
  const fetcher = (async (_url: string | URL | Request, init?: RequestInit) => {
    requests.push(init);
    if (requests.length === 1) {
      return Response.json(
        { error: "payment_required" },
        {
          status: 402,
          headers: {
            "payment-required": encodePaymentRequiredHeader(paymentRequired),
          },
        },
      );
    }
    assert.equal(new Headers(init?.headers).has("payment-signature"), true);
    return Response.json(
      { digest: "abc" },
      {
        headers: {
          "payment-response": encodePaymentResponseHeader({
            success: true,
            transaction: "0x444",
            network,
            payer: "0x111",
          }),
        },
      },
    );
  }) as typeof fetch;

  const result = await payResource(
    resourceUrl,
    network,
    {
      createReceipt: async (requirements) => ({
        invoiceId: requirements.extra.invoiceId as string,
        transactionHash: "0x444",
        payer: "0x111",
        signature: ["0x1", "0x2"],
      }),
    },
    memorySession(),
    fetcher,
  );

  assert.equal(requests.length, 2);
  assert.equal(requests[0]?.redirect, "error");
  assert.equal(requests[1]?.redirect, "error");
  assert.deepEqual(result.body, { digest: "abc" });
  assert.equal(result.settlement.transaction, "0x444");
});

test("returns a durable completed result without another request", async () => {
  const sessions = memorySession();
  const result = {
    status: 200,
    body: { digest: "abc" },
    settlement: {
      success: true,
      transaction: "0x444",
      network,
      payer: "0x111",
    },
  };
  sessions.claim(
    resourceUrl,
    createPrivatePaymentRequired({
      network,
      token: "0x333",
      amount: 50n,
      recipient: "0x222",
      invoiceId: "0x555",
      maxTimeoutSeconds: 900,
      expiresAt: 1_000_000,
      resource: { url: resourceUrl },
    }),
  );
  sessions.complete(resourceUrl, result);

  const resumed = await payResource(
    resourceUrl,
    network,
    { createReceipt: async () => Promise.reject(new Error("must not pay")) },
    sessions,
    (async () => Promise.reject(new Error("must not fetch"))) as typeof fetch,
  );

  assert.deepEqual(resumed, result);
});

test("rejects a challenge for another resource before payment", async () => {
  const paymentRequired = createPrivatePaymentRequired({
    network,
    token: "0x333",
    amount: 50n,
    recipient: "0x222",
    invoiceId: "0x555",
    maxTimeoutSeconds: 900,
    expiresAt: 1_000_000,
    resource: { url: "https://attacker.example/tool" },
  });
  let created = false;
  await assert.rejects(
    payResource(
      resourceUrl,
      network,
      {
        createReceipt: async () => {
          created = true;
          throw new Error("must not create payment");
        },
      },
      memorySession(),
      (async () =>
        Response.json(
          { error: "payment_required" },
          {
            status: 402,
            headers: {
              "payment-required": encodePaymentRequiredHeader(paymentRequired),
            },
          },
        )) as typeof fetch,
    ),
    /resource mismatch/,
  );
  assert.equal(created, false);
});

test("resumes the same invoice after a lost paid response", async () => {
  const paymentRequired = createPrivatePaymentRequired({
    network,
    token: "0x333",
    amount: 50n,
    recipient: "0x222",
    invoiceId: "0x555",
    maxTimeoutSeconds: 900,
    expiresAt: 1_000_000,
    resource: { url: resourceUrl },
  });
  const sessions = memorySession();
  let calls = 0;
  const fetcher = (async (_url: string | URL | Request) => {
    calls += 1;
    if (calls === 1) {
      return Response.json(
        { error: "payment_required" },
        {
          status: 402,
          headers: {
            "payment-required": encodePaymentRequiredHeader(paymentRequired),
          },
        },
      );
    }
    if (calls === 2) throw new Error("connection lost");
    return Response.json(
      { digest: "abc" },
      {
        headers: {
          "payment-response": encodePaymentResponseHeader({
            success: true,
            transaction: "0x444",
            network,
            payer: "0x111",
          }),
        },
      },
    );
  }) as typeof fetch;
  const receipts: string[] = [];
  const creator = {
    createReceipt: async (requirements: PaymentRequirements) => {
      receipts.push(requirements.extra.invoiceId as string);
      return {
        invoiceId: requirements.extra.invoiceId as string,
        transactionHash: "0x444",
        payer: "0x111",
        signature: ["0x1", "0x2"] as [string, string],
      };
    },
  };

  await assert.rejects(
    payResource(resourceUrl, network, creator, sessions, fetcher),
    /connection lost/,
  );
  const result = await payResource(
    resourceUrl,
    network,
    creator,
    sessions,
    fetcher,
  );

  assert.equal(calls, 3);
  assert.deepEqual(receipts, ["0x555", "0x555"]);
  assert.equal(result.settlement.transaction, "0x444");
});

test("concurrent calls use one persisted invoice", async () => {
  const sessions = memorySession();
  let unpaidCalls = 0;
  let releaseChallenges: (() => void) | undefined;
  const challengesReady = new Promise<void>((resolve) => {
    releaseChallenges = resolve;
  });
  const fetcher = (async (_url: string | URL | Request, init?: RequestInit) => {
    if (!new Headers(init?.headers).has("payment-signature")) {
      unpaidCalls += 1;
      const invoiceId = unpaidCalls === 1 ? "0x555" : "0x556";
      if (unpaidCalls === 2) releaseChallenges?.();
      await challengesReady;
      const paymentRequired = createPrivatePaymentRequired({
        network,
        token: "0x333",
        amount: 50n,
        recipient: "0x222",
        invoiceId,
        maxTimeoutSeconds: 900,
        expiresAt: 1_000_000,
        resource: { url: resourceUrl },
      });
      return Response.json(
        { error: "payment_required" },
        {
          status: 402,
          headers: {
            "payment-required": encodePaymentRequiredHeader(paymentRequired),
          },
        },
      );
    }
    return Response.json(
      { digest: "abc" },
      {
        headers: {
          "payment-response": encodePaymentResponseHeader({
            success: true,
            transaction: "0x444",
            network,
            payer: "0x111",
          }),
        },
      },
    );
  }) as typeof fetch;
  const paidInvoices: string[] = [];
  const creator = {
    createReceipt: async (requirements: PaymentRequirements) => {
      paidInvoices.push(requirements.extra.invoiceId as string);
      return {
        invoiceId: requirements.extra.invoiceId as string,
        transactionHash: "0x444",
        payer: "0x111",
        signature: ["0x1", "0x2"] as [string, string],
      };
    },
  };

  await Promise.all([
    payResource(resourceUrl, network, creator, sessions, fetcher),
    payResource(resourceUrl, network, creator, sessions, fetcher),
  ]);

  assert.equal(unpaidCalls, 2);
  assert.equal(new Set(paidInvoices).size, 1);
  assert.equal(paidInvoices.length, 2);
});
