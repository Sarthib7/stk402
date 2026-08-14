import type { PaymentRequirements } from "@x402/core/types";
import { DatabaseSync } from "node:sqlite";

export interface IssuedInvoice {
  requirements: PaymentRequirements;
  publicRequirements?: PaymentRequirements;
  requestUrl: string;
  expiresAt: number;
}

export type SettlementStart = "started" | "in_progress" | "accepted";

export interface InvoiceStore {
  issue(invoiceId: string, invoice: IssuedInvoice): void;
  get(invoiceId: string): IssuedInvoice | null;
  pruneExpired(now: number): void;
  countOutstanding(now: number): number;
  beginSettlement(
    invoiceId: string,
    transactionHash: string,
    leaseId: string,
    now: number,
    leaseMs: number,
  ): SettlementStart | "expired";
  acceptSettlement(invoiceId: string): void;
  failSettlement(invoiceId: string, leaseId: string, now: number): void;
}

type StoredInvoice = IssuedInvoice & {
  state: "issued" | "settling" | "accepted";
  settlementTransaction?: string;
  settlementLeaseId?: string;
  settlementLeaseUntil?: number;
};

export class InMemoryInvoiceStore implements InvoiceStore {
  private readonly invoices = new Map<string, StoredInvoice>();

  issue(invoiceId: string, invoice: IssuedInvoice): void {
    if (this.invoices.has(invoiceId)) throw new Error("invoice already exists");
    this.invoices.set(invoiceId, { ...invoice, state: "issued" });
  }

  get(invoiceId: string): IssuedInvoice | null {
    return this.invoices.get(invoiceId) ?? null;
  }

  pruneExpired(now: number): void {
    for (const [id, invoice] of this.invoices) {
      if (invoice.state === "issued" && invoice.expiresAt < now) {
        this.invoices.delete(id);
      }
    }
  }

  countOutstanding(now: number): number {
    let count = 0;
    for (const invoice of this.invoices.values()) {
      if (
        invoice.state !== "accepted" &&
        (invoice.expiresAt >= now ||
          (invoice.state === "settling" &&
            (invoice.settlementLeaseUntil ?? 0) >= now))
      ) {
        count += 1;
      }
    }
    return count;
  }

  beginSettlement(
    invoiceId: string,
    transactionHash: string,
    leaseId: string,
    now: number,
    leaseMs: number,
  ): SettlementStart | "expired" {
    const invoice = this.invoices.get(invoiceId);
    if (!invoice) throw new Error("invoice is missing");
    if (invoice.state === "accepted") return "accepted";
    if (invoice.state === "settling") {
      if (invoice.settlementTransaction !== transactionHash) {
        return invoice.expiresAt < now ? "expired" : "in_progress";
      }
      if ((invoice.settlementLeaseUntil ?? 0) >= now) {
        return "in_progress";
      }
      invoice.settlementLeaseId = leaseId;
      invoice.settlementLeaseUntil = now + leaseMs;
      return "started";
    }
    if (invoice.expiresAt < now) return "expired";
    invoice.state = "settling";
    invoice.settlementTransaction = transactionHash;
    invoice.settlementLeaseId = leaseId;
    invoice.settlementLeaseUntil = now + leaseMs;
    return "started";
  }

  acceptSettlement(invoiceId: string): void {
    const invoice = this.invoices.get(invoiceId);
    if (!invoice) throw new Error("invoice is missing");
    invoice.state = "accepted";
  }

  failSettlement(invoiceId: string, leaseId: string, now: number): void {
    const invoice = this.invoices.get(invoiceId);
    if (
      !invoice ||
      invoice.state !== "settling" ||
      invoice.settlementLeaseId !== leaseId
    ) {
      return;
    }
    if (invoice.expiresAt < now) {
      invoice.settlementLeaseUntil = now - 1;
    } else {
      invoice.state = "issued";
      delete invoice.settlementTransaction;
      delete invoice.settlementLeaseId;
      delete invoice.settlementLeaseUntil;
    }
  }
}

export class SqliteInvoiceStore implements InvoiceStore {
  private readonly database: DatabaseSync;

  constructor(path: string) {
    this.database = new DatabaseSync(path);
    this.database.exec("PRAGMA busy_timeout = 5000");
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS issued_invoices (
        invoice_id TEXT PRIMARY KEY,
        request_url TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        requirements TEXT NOT NULL,
        state TEXT NOT NULL CHECK (state IN ('issued', 'settling', 'accepted')),
        settlement_transaction TEXT,
        settlement_lease_id TEXT,
        settlement_lease_until INTEGER
      ) STRICT
    `);
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const columns = this.database
        .prepare("PRAGMA table_info(issued_invoices)")
        .all() as Array<{ name: string }>;
      if (!columns.some((column) => column.name === "public_requirements")) {
        this.database.exec(
          "ALTER TABLE issued_invoices ADD COLUMN public_requirements TEXT",
        );
      }
      this.database.exec("COMMIT");
    } catch (error) {
      if (this.database.isTransaction) this.database.exec("ROLLBACK");
      throw error;
    }
  }

  issue(invoiceId: string, invoice: IssuedInvoice): void {
    this.database
      .prepare(
        "INSERT INTO issued_invoices (invoice_id, request_url, expires_at, requirements, public_requirements, state) VALUES (?, ?, ?, ?, ?, 'issued')",
      )
      .run(
        invoiceId,
        invoice.requestUrl,
        invoice.expiresAt,
        JSON.stringify(invoice.requirements),
        invoice.publicRequirements
          ? JSON.stringify(invoice.publicRequirements)
          : null,
      );
  }

  get(invoiceId: string): IssuedInvoice | null {
    const row = this.database
      .prepare(
        "SELECT request_url, expires_at, requirements, public_requirements FROM issued_invoices WHERE invoice_id = ?",
      )
      .get(invoiceId) as
      | {
          request_url: string;
          expires_at: number;
          requirements: string;
          public_requirements: string | null;
        }
      | undefined;
    if (!row) return null;
    try {
      const requirements = JSON.parse(row.requirements) as PaymentRequirements;
      return {
        requestUrl: row.request_url,
        expiresAt: row.expires_at,
        requirements,
        ...(row.public_requirements
          ? {
              publicRequirements: JSON.parse(
                row.public_requirements,
              ) as PaymentRequirements,
            }
          : {}),
      };
    } catch (error) {
      throw new Error("stored invoice is invalid", { cause: error });
    }
  }

  pruneExpired(now: number): void {
    this.database
      .prepare(
        "DELETE FROM issued_invoices WHERE expires_at < ? AND state = 'issued'",
      )
      .run(now);
  }

  countOutstanding(now: number): number {
    const row = this.database
      .prepare(
        "SELECT COUNT(*) AS count FROM issued_invoices WHERE state != 'accepted' AND (expires_at >= ? OR (state = 'settling' AND settlement_lease_until >= ?))",
      )
      .get(now, now) as { count: number };
    return row.count;
  }

  beginSettlement(
    invoiceId: string,
    transactionHash: string,
    leaseId: string,
    now: number,
    leaseMs: number,
  ): SettlementStart | "expired" {
    const result = this.database
      .prepare(
        `UPDATE issued_invoices
         SET state = 'settling', settlement_transaction = ?, settlement_lease_id = ?, settlement_lease_until = ?
         WHERE invoice_id = ? AND (
           (state = 'issued' AND expires_at >= ?)
           OR (state = 'settling' AND settlement_transaction = ? AND settlement_lease_until < ?)
         )`,
      )
      .run(
        transactionHash,
        leaseId,
        now + leaseMs,
        invoiceId,
        now,
        transactionHash,
        now,
      );
    if (result.changes === 1) return "started";
    const row = this.database
      .prepare(
        "SELECT state, expires_at, settlement_transaction FROM issued_invoices WHERE invoice_id = ?",
      )
      .get(invoiceId) as
      | {
          state: "issued" | "settling" | "accepted";
          expires_at: number;
          settlement_transaction: string | null;
        }
      | undefined;
    if (!row) throw new Error("invoice is missing");
    if (row.state === "accepted") return "accepted";
    if (row.state === "issued") return "expired";
    if (
      row.settlement_transaction !== transactionHash &&
      row.expires_at < now
    ) {
      return "expired";
    }
    return "in_progress";
  }

  acceptSettlement(invoiceId: string): void {
    const result = this.database
      .prepare(
        "UPDATE issued_invoices SET state = 'accepted' WHERE invoice_id = ?",
      )
      .run(invoiceId);
    if (result.changes !== 1) throw new Error("invoice settlement state conflict");
  }

  failSettlement(invoiceId: string, leaseId: string, now: number): void {
    this.database
      .prepare(
        `UPDATE issued_invoices
         SET state = CASE WHEN expires_at < ? THEN 'settling' ELSE 'issued' END,
             settlement_transaction = CASE WHEN expires_at < ? THEN settlement_transaction ELSE NULL END,
             settlement_lease_id = CASE WHEN expires_at < ? THEN settlement_lease_id ELSE NULL END,
             settlement_lease_until = CASE WHEN expires_at < ? THEN ? - 1 ELSE NULL END
         WHERE invoice_id = ? AND state = 'settling' AND settlement_lease_id = ?`,
      )
      .run(now, now, now, now, now, invoiceId, leaseId);
  }

  close(): void {
    this.database.close();
  }
}
