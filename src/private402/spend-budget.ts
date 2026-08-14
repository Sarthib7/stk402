import { DatabaseSync } from "node:sqlite";

export type SpendReservation =
  | "reserved"
  | "already_reserved"
  | "limit_exceeded";

export interface SpendBudget {
  reserve(invoiceId: string, amount: bigint): SpendReservation;
}

export class SqliteDailySpendBudget implements SpendBudget {
  private readonly database: DatabaseSync;

  constructor(
    path: string,
    private readonly dailyLimit: bigint,
    private readonly now: () => number = Date.now,
  ) {
    if (dailyLimit <= 0n || dailyLimit >= 2n ** 128n) {
      throw new Error("daily spend limit must be a positive u128");
    }
    this.database = new DatabaseSync(path);
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS payer_spend_reservations (
        invoice_id TEXT PRIMARY KEY,
        day TEXT NOT NULL,
        amount TEXT NOT NULL
      ) STRICT
    `);
  }

  reserve(invoiceId: string, amount: bigint): SpendReservation {
    if (amount <= 0n || amount >= 2n ** 128n) {
      throw new Error("spend amount must be a positive u128");
    }

    this.database.exec("BEGIN IMMEDIATE");
    try {
      const existing = this.database
        .prepare(
          "SELECT amount FROM payer_spend_reservations WHERE invoice_id = ?",
        )
        .get(invoiceId) as { amount: string } | undefined;
      if (existing) {
        this.database.exec("COMMIT");
        return "already_reserved";
      }

      const day = new Date(this.now()).toISOString().slice(0, 10);
      const rows = this.database
        .prepare(
          "SELECT amount FROM payer_spend_reservations WHERE day = ?",
        )
        .all(day) as Array<{ amount: string }>;
      const spent = rows.reduce((sum, row) => sum + BigInt(row.amount), 0n);
      if (spent + amount > this.dailyLimit) {
        this.database.exec("ROLLBACK");
        return "limit_exceeded";
      }

      this.database
        .prepare(
          "INSERT INTO payer_spend_reservations (invoice_id, day, amount) VALUES (?, ?, ?)",
        )
        .run(invoiceId, day, amount.toString());
      this.database.exec("COMMIT");
      return "reserved";
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  close(): void {
    this.database.close();
  }
}
