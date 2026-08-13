import { DatabaseSync } from "node:sqlite";

import type { ClaimConsumption, ClaimLedger } from "./signed-receipt.js";

export class SqliteClaimLedger implements ClaimLedger {
  private readonly database: DatabaseSync;

  constructor(path: string) {
    this.database = new DatabaseSync(path);
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS payment_claims (
        invoice_id TEXT PRIMARY KEY,
        transaction_hash TEXT NOT NULL UNIQUE
      ) STRICT
    `);
  }

  consume(invoiceId: string, transactionHash: string): ClaimConsumption {
    try {
      this.database
        .prepare(
          "INSERT INTO payment_claims (invoice_id, transaction_hash) VALUES (?, ?)",
        )
        .run(invoiceId, transactionHash);
      return "accepted";
    } catch {
      const transactionExists = this.database
        .prepare(
          "SELECT 1 FROM payment_claims WHERE transaction_hash = ? LIMIT 1",
        )
        .get(transactionHash);
      if (transactionExists) return "transaction_used";

      const invoiceExists = this.database
        .prepare("SELECT 1 FROM payment_claims WHERE invoice_id = ? LIMIT 1")
        .get(invoiceId);
      if (invoiceExists) return "invoice_used";

      throw new Error("failed to persist payment claim");
    }
  }

  close(): void {
    this.database.close();
  }
}
