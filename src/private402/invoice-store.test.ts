import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { SqliteInvoiceStore } from "./invoice-store.js";
import { createPrivatePaymentRequired } from "./signed-receipt.js";

test("persists issued invoices and prunes only expired records", () => {
  const directory = mkdtempSync(join(tmpdir(), "stk402-invoices-"));
  const path = join(directory, "claims.sqlite");
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
  const first = new SqliteInvoiceStore(path);
  try {
    first.issue("0x555", {
      requirements: paymentRequired.accepts[0]!,
      requestUrl: resourceUrl,
      expiresAt: 1_000_000,
    });
    first.close();

    const reopened = new SqliteInvoiceStore(path);
    try {
      assert.equal(reopened.get("0x555")?.requestUrl, resourceUrl);
      assert.equal(reopened.countOutstanding(999_999), 1);
      reopened.pruneExpired(999_999);
      assert.equal(reopened.countOutstanding(999_999), 1);
      assert.equal(
        reopened.beginSettlement("0x555", "0x444", "lease-a", 999_999, 60_000),
        "started",
      );
      reopened.acceptSettlement("0x555");
      assert.equal(reopened.countOutstanding(999_999), 0);
      reopened.issue("0x556", {
        requirements: paymentRequired.accepts[0]!,
        requestUrl: resourceUrl,
        expiresAt: 1_000_000,
      });
      reopened.pruneExpired(1_000_001);
      assert.equal(reopened.get("0x555")?.requestUrl, resourceUrl);
      assert.equal(reopened.get("0x556"), null);
    } finally {
      reopened.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("recovers the same settlement after a crash and lease expiry", () => {
  const directory = mkdtempSync(join(tmpdir(), "stk402-invoice-lease-"));
  const path = join(directory, "claims.sqlite");
  const resourceUrl = "https://seller.example/tool";
  const requirements = createPrivatePaymentRequired({
    network: "starknet:SN_SEPOLIA",
    token: "0x333",
    amount: 50n,
    recipient: "0x222",
    invoiceId: "0x555",
    maxTimeoutSeconds: 1,
    expiresAt: 2_000,
    resource: { url: resourceUrl },
  }).accepts[0]!;
  try {
    const first = new SqliteInvoiceStore(path);
    first.issue("0x555", { requirements, requestUrl: resourceUrl, expiresAt: 2_000 });
    assert.equal(
      first.beginSettlement("0x555", "0x444", "lease-a", 1_000, 1_000),
      "started",
    );
    first.close();

    const reopened = new SqliteInvoiceStore(path);
    try {
      reopened.pruneExpired(3_000);
      assert.equal(reopened.get("0x555")?.requestUrl, resourceUrl);
      assert.equal(reopened.countOutstanding(3_000), 0);
      assert.equal(
        reopened.beginSettlement("0x555", "0x445", "lease-c", 3_000, 1_000),
        "expired",
      );
      assert.equal(
        reopened.beginSettlement("0x555", "0x444", "lease-b", 3_000, 1_000),
        "started",
      );
      reopened.failSettlement("0x555", "lease-a", 3_000);
      assert.equal(
        reopened.beginSettlement("0x555", "0x445", "lease-c", 3_001, 1_000),
        "expired",
      );
      reopened.acceptSettlement("0x555");

      reopened.issue("0x556", {
        requirements,
        requestUrl: resourceUrl,
        expiresAt: 10_000,
      });
      assert.equal(
        reopened.beginSettlement("0x556", "0x444", "lease-a", 3_000, 1_000),
        "started",
      );
      assert.equal(
        reopened.beginSettlement("0x556", "0x444", "lease-b", 4_001, 1_000),
        "started",
      );
      reopened.failSettlement("0x556", "lease-a", 4_002);
      assert.equal(
        reopened.beginSettlement("0x556", "0x445", "lease-c", 4_003, 1_000),
        "in_progress",
      );
    } finally {
      reopened.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
