import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { SqlitePayerJournal } from "./payer-journal.js";

test("persists submitted transactions and blocks duplicate work", () => {
  const directory = mkdtempSync(join(tmpdir(), "stk402-payer-journal-"));
  const path = join(directory, "journal.sqlite");
  const first = new SqlitePayerJournal(path);
  try {
    assert.deepEqual(first.begin("0x1", "fingerprint"), { state: "new" });
    assert.deepEqual(first.inspect("0x1"), { state: "in_progress" });
    assert.deepEqual(first.begin("0x1", "fingerprint"), {
      state: "in_progress",
    });
    first.markSubmitted("0x1", "0x2");
    first.close();

    const reopened = new SqlitePayerJournal(path);
    try {
      assert.deepEqual(reopened.begin("0x1", "fingerprint"), {
        state: "submitted",
        transactionHash: "0x2",
      });
      assert.deepEqual(reopened.inspect("0x1"), {
        state: "submitted",
        transactionHash: "0x2",
      });
      assert.throws(
        () => reopened.begin("0x1", "different"),
        /requirements changed/,
      );
    } finally {
      reopened.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("keeps uncertain submission outcomes blocked", () => {
  const directory = mkdtempSync(join(tmpdir(), "stk402-payer-unknown-"));
  const journal = new SqlitePayerJournal(join(directory, "journal.sqlite"));
  try {
    assert.deepEqual(journal.begin("0x1", "fingerprint"), { state: "new" });
    journal.markUnknown("0x1");
    assert.deepEqual(journal.begin("0x1", "fingerprint"), { state: "unknown" });
  } finally {
    journal.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("reconciles found, unbroadcast, and reverted attempts", () => {
  const directory = mkdtempSync(join(tmpdir(), "stk402-payer-reconcile-"));
  const journal = new SqlitePayerJournal(join(directory, "journal.sqlite"));
  try {
    journal.begin("0x1", "one");
    journal.markUnknown("0x1");
    journal.reconcileSubmitted("0x1", "one", "0xa");
    assert.deepEqual(journal.begin("0x1", "one"), {
      state: "submitted",
      transactionHash: "0xa",
    });
    journal.reconcileReverted("0x1", "one", "0xa");
    assert.deepEqual(journal.begin("0x1", "one"), { state: "new" });

    journal.markUnknown("0x1");
    journal.reconcileNotBroadcast("0x1", "one");
    assert.deepEqual(journal.begin("0x1", "one"), { state: "new" });

    assert.throws(
      () => journal.reconcileSubmitted("0x1", "wrong", "0xb"),
      /reconciliation conflict/,
    );
  } finally {
    journal.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
