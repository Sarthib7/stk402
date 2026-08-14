import type { PaymentRequired } from "@x402/core/types";
import { DatabaseSync } from "node:sqlite";

import type { PaidResourceResult } from "./pay-resource.js";

export type PaymentSession =
  | { state: "pending"; paymentRequired: PaymentRequired }
  | { state: "completed"; result: PaidResourceResult };

export interface PaymentSessionStore {
  load(resourceUrl: string): PaymentSession | null;
  claim(resourceUrl: string, paymentRequired: PaymentRequired): PaymentSession;
  complete(resourceUrl: string, result: PaidResourceResult): void;
  clearPending(resourceUrl: string): void;
  acknowledge(resourceUrl: string): void;
}

export class SqlitePaymentSessionStore implements PaymentSessionStore {
  private readonly database: DatabaseSync;

  constructor(path: string) {
    this.database = new DatabaseSync(path);
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS payment_sessions (
        resource_url TEXT PRIMARY KEY,
        state TEXT NOT NULL CHECK (state IN ('pending', 'completed')),
        value TEXT NOT NULL
      ) STRICT
    `);
  }

  load(resourceUrl: string): PaymentSession | null {
    const row = this.database
      .prepare("SELECT state, value FROM payment_sessions WHERE resource_url = ?")
      .get(resourceUrl) as
      | { state: "pending" | "completed"; value: string }
      | undefined;
    if (!row) return null;
    try {
      const value: unknown = JSON.parse(row.value);
      if (!value || typeof value !== "object") {
        throw new Error("invalid payment session");
      }
      return row.state === "pending"
        ? { state: "pending", paymentRequired: value as PaymentRequired }
        : { state: "completed", result: value as PaidResourceResult };
    } catch (error) {
      throw new Error("stored payment session is invalid", { cause: error });
    }
  }

  claim(resourceUrl: string, paymentRequired: PaymentRequired): PaymentSession {
    this.database
      .prepare(
        "INSERT OR IGNORE INTO payment_sessions (resource_url, state, value) VALUES (?, 'pending', ?)",
      )
      .run(resourceUrl, JSON.stringify(paymentRequired));
    const session = this.load(resourceUrl);
    if (!session) throw new Error("failed to persist payment session");
    return session;
  }

  complete(resourceUrl: string, result: PaidResourceResult): void {
    const update = this.database
      .prepare(
        "UPDATE payment_sessions SET state = 'completed', value = ? WHERE resource_url = ? AND state = 'pending'",
      )
      .run(JSON.stringify(result), resourceUrl);
    if (update.changes !== 1) {
      const session = this.load(resourceUrl);
      if (session?.state !== "completed") {
        throw new Error("payment session completion conflict");
      }
    }
  }

  clearPending(resourceUrl: string): void {
    const result = this.database
      .prepare(
        "DELETE FROM payment_sessions WHERE resource_url = ? AND state = 'pending'",
      )
      .run(resourceUrl);
    if (result.changes !== 1) throw new Error("pending payment session is missing");
  }

  acknowledge(resourceUrl: string): void {
    const result = this.database
      .prepare(
        "DELETE FROM payment_sessions WHERE resource_url = ? AND state = 'completed'",
      )
      .run(resourceUrl);
    if (result.changes !== 1) throw new Error("completed payment session is missing");
  }

  close(): void {
    this.database.close();
  }
}
