import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { SqliteDailySpendBudget } from "./spend-budget.js";

test("persists daily reservations and rejects spend above the limit", () => {
  const directory = mkdtempSync(join(tmpdir(), "stk402-spend-budget-"));
  const path = join(directory, "budget.sqlite");
  const now = () => Date.UTC(2026, 7, 14);
  const first = new SqliteDailySpendBudget(path, 100n, now);
  try {
    assert.equal(first.reserve("0x1", 60n), "reserved");
    assert.equal(first.reserve("0x1", 60n), "already_reserved");
    first.close();

    const reopened = new SqliteDailySpendBudget(path, 100n, now);
    try {
      assert.equal(reopened.reserve("0x2", 41n), "limit_exceeded");
      assert.equal(reopened.reserve("0x2", 40n), "reserved");
    } finally {
      reopened.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("starts a new allowance on the next UTC day", () => {
  const directory = mkdtempSync(join(tmpdir(), "stk402-spend-release-"));
  let now = Date.UTC(2026, 7, 14, 23, 59);
  const budget = new SqliteDailySpendBudget(
    join(directory, "budget.sqlite"),
    50n,
    () => now,
  );
  try {
    assert.equal(budget.reserve("0x1", 50n), "reserved");
    now = Date.UTC(2026, 7, 15);
    assert.equal(budget.reserve("0x2", 50n), "reserved");
  } finally {
    budget.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
