import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { SqlitePayerJournal } from "./payer-journal.js";
import { clearUnstartedPayment } from "./payment-recovery.js";
import { SqlitePaymentSessionStore } from "./payment-session.js";
import { createPrivatePaymentRequired } from "./signed-receipt.js";

function challenge(resourceUrl: string) {
  return createPrivatePaymentRequired({
    network: "starknet:SN_SEPOLIA",
    token: "0x333",
    amount: 50n,
    recipient: "0x222",
    invoiceId: "0x555",
    maxTimeoutSeconds: 900,
    expiresAt: 1_000_000,
    resource: { url: resourceUrl },
  });
}

test("clears only a pending session with no payer attempt", () => {
  const directory = mkdtempSync(join(tmpdir(), "stk402-payment-recovery-"));
  const path = join(directory, "payer.sqlite");
  const resourceUrl = "https://seller.example/tool";
  const journal = new SqlitePayerJournal(path);
  const sessions = new SqlitePaymentSessionStore(path);
  try {
    sessions.claim(resourceUrl, challenge(resourceUrl));
    assert.throws(
      () => clearUnstartedPayment(resourceUrl, sessions, journal, 1_030_000, 30_000),
      /not expired beyond clock skew/,
    );
    clearUnstartedPayment(resourceUrl, sessions, journal, 1_030_001, 30_000);
    assert.equal(sessions.load(resourceUrl), null);

    sessions.claim(resourceUrl, challenge(resourceUrl));
    journal.begin("0x555", "fingerprint");
    assert.throws(
      () =>
        clearUnstartedPayment(
          resourceUrl,
          sessions,
          journal,
          1_030_001,
          30_000,
        ),
      /requires chain reconciliation/,
    );
    assert.equal(sessions.load(resourceUrl)?.state, "pending");
  } finally {
    journal.close();
    sessions.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
