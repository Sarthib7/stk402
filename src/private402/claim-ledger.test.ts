import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { SqliteClaimLedger } from "./claim-ledger.js";

test("persists consumed invoices and transactions", (context) => {
  const directory = mkdtempSync(join(tmpdir(), "stk402-ledger-"));
  context.after(() => rmSync(directory, { recursive: true }));
  const path = join(directory, "claims.sqlite");

  const first = new SqliteClaimLedger(path);
  assert.equal(first.consume("0x1", "0x2"), "accepted");
  first.close();

  const reopened = new SqliteClaimLedger(path);
  assert.equal(reopened.consume("0x1", "0x2"), "already_accepted");
  assert.equal(reopened.consume("0x1", "0x3"), "invoice_used");
  assert.equal(reopened.consume("0x4", "0x2"), "transaction_used");
  reopened.close();
});

test("keeps an accepted claim after a rejected collision", (context) => {
  const directory = mkdtempSync(join(tmpdir(), "stk402-ledger-"));
  context.after(() => rmSync(directory, { recursive: true }));
  const ledger = new SqliteClaimLedger(join(directory, "claims.sqlite"));

  assert.equal(ledger.consume("0x1", "0x2"), "accepted");
  assert.equal(ledger.consume("0x1", "0x2"), "already_accepted");
  assert.equal(ledger.consume("0x3", "0x2"), "transaction_used");
  assert.equal(ledger.consume("0x1", "0x4"), "invoice_used");

  ledger.close();
});
