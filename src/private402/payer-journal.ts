import { DatabaseSync } from "node:sqlite";

export type PayerAttempt =
  | { state: "new" }
  | { state: "in_progress" | "unknown" }
  | { state: "submitted"; transactionHash: string };

export interface PayerJournal {
  begin(invoiceId: string, fingerprint: string): PayerAttempt;
  inspect(invoiceId: string): Exclude<PayerAttempt, { state: "new" }> | null;
  release(invoiceId: string): void;
  markUnknown(invoiceId: string): void;
  markSubmitted(invoiceId: string, transactionHash: string): void;
  reconcileSubmitted(
    invoiceId: string,
    fingerprint: string,
    transactionHash: string,
  ): void;
  reconcileNotBroadcast(invoiceId: string, fingerprint: string): void;
  reconcileReverted(
    invoiceId: string,
    fingerprint: string,
    transactionHash: string,
  ): void;
}

export class SqlitePayerJournal implements PayerJournal {
  private readonly database: DatabaseSync;

  constructor(path: string) {
    this.database = new DatabaseSync(path);
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS payer_attempts (
        invoice_id TEXT PRIMARY KEY,
        fingerprint TEXT NOT NULL,
        state TEXT NOT NULL CHECK (state IN ('in_progress', 'unknown', 'submitted')),
        transaction_hash TEXT UNIQUE
      ) STRICT
    `);
  }

  begin(invoiceId: string, fingerprint: string): PayerAttempt {
    try {
      this.database
        .prepare(
          "INSERT INTO payer_attempts (invoice_id, fingerprint, state) VALUES (?, ?, 'in_progress')",
        )
        .run(invoiceId, fingerprint);
      return { state: "new" };
    } catch {
      const row = this.database
        .prepare(
          "SELECT fingerprint, state, transaction_hash FROM payer_attempts WHERE invoice_id = ?",
        )
        .get(invoiceId) as
        | {
            fingerprint: string;
            state: "in_progress" | "unknown" | "submitted";
            transaction_hash: string | null;
          }
        | undefined;
      if (!row) throw new Error("failed to persist payer attempt");
      if (row.fingerprint !== fingerprint) {
        throw new Error("invoice requirements changed");
      }
      if (row.state === "submitted" && row.transaction_hash) {
        return { state: "submitted", transactionHash: row.transaction_hash };
      }
      if (row.state === "submitted") {
        throw new Error("submitted payer attempt has no transaction hash");
      }
      return { state: row.state };
    }
  }

  inspect(invoiceId: string): Exclude<PayerAttempt, { state: "new" }> | null {
    const row = this.database
      .prepare(
        "SELECT state, transaction_hash FROM payer_attempts WHERE invoice_id = ?",
      )
      .get(invoiceId) as
      | {
          state: "in_progress" | "unknown" | "submitted";
          transaction_hash: string | null;
        }
      | undefined;
    if (!row) return null;
    if (row.state === "submitted" && row.transaction_hash) {
      return { state: "submitted", transactionHash: row.transaction_hash };
    }
    if (row.state === "submitted") {
      throw new Error("submitted payer attempt has no transaction hash");
    }
    return { state: row.state };
  }

  release(invoiceId: string): void {
    this.database
      .prepare(
        "DELETE FROM payer_attempts WHERE invoice_id = ? AND state = 'in_progress'",
      )
      .run(invoiceId);
  }

  markUnknown(invoiceId: string): void {
    this.updateState(invoiceId, "unknown", null);
  }

  markSubmitted(invoiceId: string, transactionHash: string): void {
    this.updateState(invoiceId, "submitted", transactionHash);
  }

  reconcileSubmitted(
    invoiceId: string,
    fingerprint: string,
    transactionHash: string,
  ): void {
    const result = this.database
      .prepare(
        "UPDATE payer_attempts SET state = 'submitted', transaction_hash = ? WHERE invoice_id = ? AND fingerprint = ? AND state IN ('in_progress', 'unknown')",
      )
      .run(transactionHash, invoiceId, fingerprint);
    if (result.changes !== 1) throw new Error("payer reconciliation conflict");
  }

  reconcileNotBroadcast(invoiceId: string, fingerprint: string): void {
    const result = this.database
      .prepare(
        "DELETE FROM payer_attempts WHERE invoice_id = ? AND fingerprint = ? AND state IN ('in_progress', 'unknown')",
      )
      .run(invoiceId, fingerprint);
    if (result.changes !== 1) throw new Error("payer reconciliation conflict");
  }

  reconcileReverted(
    invoiceId: string,
    fingerprint: string,
    transactionHash: string,
  ): void {
    const result = this.database
      .prepare(
        "DELETE FROM payer_attempts WHERE invoice_id = ? AND fingerprint = ? AND state = 'submitted' AND transaction_hash = ?",
      )
      .run(invoiceId, fingerprint, transactionHash);
    if (result.changes !== 1) throw new Error("payer reconciliation conflict");
  }

  close(): void {
    this.database.close();
  }

  private updateState(
    invoiceId: string,
    state: "unknown" | "submitted",
    transactionHash: string | null,
  ): void {
    const result = this.database
      .prepare(
        "UPDATE payer_attempts SET state = ?, transaction_hash = ? WHERE invoice_id = ? AND state = 'in_progress'",
      )
      .run(state, transactionHash, invoiceId);
    if (result.changes !== 1) throw new Error("payer attempt state conflict");
  }
}
