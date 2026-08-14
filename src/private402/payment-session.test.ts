import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createPrivatePaymentRequired } from "./signed-receipt.js";
import { SqlitePaymentSessionStore } from "./payment-session.js";

test("persists one payment challenge until settlement succeeds", () => {
  const directory = mkdtempSync(join(tmpdir(), "stk402-payment-session-"));
  const path = join(directory, "payer.sqlite");
  const resourceUrl = "https://seller.example/tool";
  const paymentRequired = createPrivatePaymentRequired({
    network: "starknet:SN_SEPOLIA",
    token: "0x333",
    amount: 50n,
    recipient: "0x222",
    invoiceId: "0x555",
    maxTimeoutSeconds: 900,
    expiresAt: 1_000_000,
    resource: { url: resourceUrl },
  });
  const first = new SqlitePaymentSessionStore(path);
  try {
    assert.equal(first.claim(resourceUrl, paymentRequired).state, "pending");
    const competing = structuredClone(paymentRequired);
    competing.accepts[0]!.extra.invoiceId = "0x556";
    first.claim(resourceUrl, competing);
    const winner = first.load(resourceUrl);
    assert.equal(winner?.state, "pending");
    assert.equal(
      winner?.state === "pending"
        ? winner.paymentRequired.accepts[0]?.extra.invoiceId
        : undefined,
      "0x555",
    );
    first.close();

    const reopened = new SqlitePaymentSessionStore(path);
    try {
      const pending = reopened.load(resourceUrl);
      assert.equal(pending?.state, "pending");
      assert.equal(
        pending?.state === "pending"
          ? pending.paymentRequired.accepts[0]?.extra.invoiceId
          : undefined,
        "0x555",
      );
      reopened.complete(resourceUrl, {
        status: 200,
        body: { digest: "abc" },
        settlement: {
          success: true,
          transaction: "0x444",
          network: "starknet:SN_SEPOLIA",
          payer: "0x111",
        },
      });
      assert.equal(reopened.load(resourceUrl)?.state, "completed");
      reopened.acknowledge(resourceUrl);
      assert.equal(reopened.load(resourceUrl), null);
    } finally {
      reopened.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
