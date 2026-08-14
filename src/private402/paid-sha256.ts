import { createHash, randomBytes } from "node:crypto";

import {
  decodePaymentSignatureHeader,
  encodePaymentRequiredHeader,
  encodePaymentResponseHeader,
} from "@x402/core/http";
import type {
  Network,
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
} from "@x402/core/types";
import type { KeyObject } from "node:crypto";

import {
  PRIVATE_EXACT_SCHEME,
  createPrivatePaymentRequired,
} from "./signed-receipt.js";
import {
  InMemoryInvoiceStore,
  type InvoiceStore,
} from "./invoice-store.js";
import {
  CLIENT_KEY_HEADER,
  PRIVATE_ENVELOPE_SCHEME,
  openReceipt,
  parseEnvelopePublicKey,
  sealPaymentTerms,
  type SealedReceipt,
} from "./private-envelope.js";

interface PaymentSettler {
  settle(
    payload: PaymentPayload,
    requirements: PaymentRequirements,
  ): Promise<SettleResponse>;
}

interface PaidSha256Options {
  network: Network;
  token: string;
  amount: bigint;
  recipient: string;
  facilitator: PaymentSettler;
  createInvoiceId?: () => string;
  now?: () => number;
  resourceUrl?: (request: Request) => string;
  maxOutstandingInvoices?: number;
  invoiceTimeoutSeconds?: number;
  settlementLeaseMs?: number;
  invoiceStore?: InvoiceStore;
  acceptedTransaction?: (invoiceId: string) => string | null;
  serverEnvelopePrivateKey?: KeyObject;
  serverEnvelopePublicKey?: KeyObject;
  authorizedClientEnvelopePublicKey?: string;
}

function sameFelt(left: string, right: string): boolean {
  try {
    return BigInt(left) === BigInt(right);
  } catch {
    return false;
  }
}

function json(
  body: unknown,
  status: number,
  headers?: Headers | Record<string, string>,
): Response {
  return Response.json(body, headers ? { status, headers } : { status });
}

function redactEncryptedSettlement(
  settlement: SettleResponse,
  encrypted: boolean,
): SettleResponse {
  if (!encrypted) return settlement;
  const { payer: _payer, amount: _amount, ...publicSettlement } = settlement;
  return { ...publicSettlement, transaction: "" };
}

export function createPaidSha256Handler(options: PaidSha256Options) {
  const createInvoiceId =
    options.createInvoiceId ?? (() => `0x${randomBytes(31).toString("hex")}`);
  const now = options.now ?? Date.now;
  const resourceUrl = options.resourceUrl ?? ((request: Request) => request.url);
  const maxOutstandingInvoices = options.maxOutstandingInvoices ?? 1_000;
  const invoiceTimeoutSeconds = options.invoiceTimeoutSeconds ?? 60;
  const settlementLeaseMs = options.settlementLeaseMs ?? 60_000;
  if (!Number.isSafeInteger(maxOutstandingInvoices) || maxOutstandingInvoices < 1) {
    throw new Error("maxOutstandingInvoices must be a positive safe integer");
  }
  if (!Number.isSafeInteger(invoiceTimeoutSeconds) || invoiceTimeoutSeconds < 1) {
    throw new Error("invoiceTimeoutSeconds must be a positive safe integer");
  }
  if (!Number.isSafeInteger(settlementLeaseMs) || settlementLeaseMs < 1) {
    throw new Error("settlementLeaseMs must be a positive safe integer");
  }
  const invoices = options.invoiceStore ?? new InMemoryInvoiceStore();
  const acceptedTransaction = options.acceptedTransaction ?? (() => null);
  if (
    Boolean(options.serverEnvelopePrivateKey) !==
    Boolean(options.serverEnvelopePublicKey)
  ) {
    throw new Error("both server envelope keys are required");
  }
  if (
    options.serverEnvelopePrivateKey &&
    !options.authorizedClientEnvelopePublicKey
  ) {
    throw new Error("authorized client envelope key is required");
  }

  return async function handle(request: Request): Promise<Response> {
    if (request.method !== "GET") {
      return json({ error: "method_not_allowed" }, 405, { allow: "GET" });
    }

    const requestedResource = resourceUrl(request);
    const parsedResource = new URL(requestedResource);
    if (parsedResource.pathname !== "/tools/sha256") {
      return json({ error: "not_found" }, 404);
    }
    const text = parsedResource.searchParams.get("text");
    if (!text || Buffer.byteLength(text, "utf8") > 4096) {
      return json({ error: "text_must_be_1_to_4096_bytes" }, 400);
    }

    const paymentHeader = request.headers.get("payment-signature");
    if (!paymentHeader) {
      const issuedAt = now();
      invoices.pruneExpired(issuedAt);
      if (invoices.countOutstanding(issuedAt) >= maxOutstandingInvoices) {
        return json({ error: "invoice_capacity_reached" }, 503, {
          "retry-after": "60",
        });
      }
      const expiresAt = issuedAt + invoiceTimeoutSeconds * 1_000;
      const privatePaymentRequired = createPrivatePaymentRequired({
        network: options.network,
        token: options.token,
        amount: options.amount,
        recipient: options.recipient,
        invoiceId: createInvoiceId(),
        maxTimeoutSeconds: invoiceTimeoutSeconds,
        expiresAt,
        resource: {
          url: requestedResource,
          description: "SHA-256 digest",
          mimeType: "application/json",
        },
      });
      const requirements = privatePaymentRequired.accepts[0]!;
      let paymentRequired = privatePaymentRequired;
      let publicRequirements: PaymentRequirements | undefined;
      if (options.serverEnvelopePrivateKey && options.serverEnvelopePublicKey) {
        const clientKeyValue = request.headers.get(CLIENT_KEY_HEADER);
        if (!clientKeyValue) {
          return json({ error: "missing_client_encryption_key" }, 400);
        }
        let clientPublicKey: KeyObject;
        try {
          clientPublicKey = parseEnvelopePublicKey(clientKeyValue);
        } catch {
          return json({ error: "invalid_client_encryption_key" }, 400);
        }
        if (clientKeyValue !== options.authorizedClientEnvelopePublicKey) {
          return json({ error: "invalid_client_encryption_key" }, 403);
        }
        const invoiceId = requirements.extra.invoiceId as string;
        const invoiceExpiry = requirements.extra.expiresAt as string;
        const terms = sealPaymentTerms(
          requirements,
          {
            invoiceId,
            resourceUrl: requestedResource,
            network: requirements.network,
            asset: requirements.asset,
            maxTimeoutSeconds: requirements.maxTimeoutSeconds,
            expiresAt: invoiceExpiry,
            clientPublicKey: clientKeyValue,
          },
          options.serverEnvelopePrivateKey,
          clientPublicKey,
          options.serverEnvelopePublicKey,
        );
        publicRequirements = {
          scheme: PRIVATE_ENVELOPE_SCHEME,
          network: requirements.network,
          asset: requirements.asset,
          amount: "0",
          payTo: "0x0",
          maxTimeoutSeconds: requirements.maxTimeoutSeconds,
          extra: { invoiceId, expiresAt: invoiceExpiry, terms },
        };
        paymentRequired = {
          ...privatePaymentRequired,
          accepts: [publicRequirements],
        };
      }
      const issuedInvoice = requirements.extra.invoiceId as string;
      invoices.issue(issuedInvoice, {
        requirements,
        ...(publicRequirements ? { publicRequirements } : {}),
        requestUrl: requestedResource,
        expiresAt,
      });
      return json({ error: "payment_required" }, 402, {
        "payment-required": encodePaymentRequiredHeader(paymentRequired),
        ...(publicRequirements
          ? {
              "cache-control": "private, no-store",
              vary: CLIENT_KEY_HEADER,
            }
          : {}),
      });
    }

    let payload: PaymentPayload;
    try {
      payload = decodePaymentSignatureHeader(paymentHeader);
    } catch {
      return json({ error: "invalid_payment_header" }, 400);
    }

    if (
      !payload ||
      typeof payload !== "object" ||
      !payload.accepted ||
      typeof payload.accepted !== "object" ||
      !payload.accepted.extra ||
      typeof payload.accepted.extra !== "object"
    ) {
      return json({ error: "invalid_payment_header" }, 400);
    }
    const accepted = payload.accepted;
    const claimedInvoice = accepted.extra.invoiceId;
    if (typeof claimedInvoice !== "string") {
      return json({ error: "payment_requirements_mismatch" }, 400);
    }
    const invoice = invoices.get(claimedInvoice);
    if (!invoice) {
      return json({ error: "unknown_invoice" }, 400);
    }
    if (requestedResource !== invoice.requestUrl) {
      return json({ error: "invoice_mismatch" }, 400);
    }
    const requirements = invoice.requirements;
    const expectedPublic = invoice.publicRequirements ?? requirements;
    let settlementPayload = payload;
    if (expectedPublic.scheme === PRIVATE_ENVELOPE_SCHEME) {
      if (!options.serverEnvelopePrivateKey || !options.serverEnvelopePublicKey) {
        return json({ error: "invalid_receipt" }, 402);
      }
      try {
        const invoiceExpiry = requirements.extra.expiresAt as string;
        const receipt = openReceipt(
          payload.payload as unknown as SealedReceipt,
          {
            invoiceId: claimedInvoice,
            resourceUrl: requestedResource,
            network: expectedPublic.network,
            asset: expectedPublic.asset,
            maxTimeoutSeconds: expectedPublic.maxTimeoutSeconds,
            expiresAt: invoiceExpiry,
          },
          options.serverEnvelopePrivateKey,
          options.serverEnvelopePublicKey,
        );
        settlementPayload = {
          x402Version: payload.x402Version,
          accepted: requirements,
          payload: receipt as Record<string, unknown>,
        };
      } catch {
        return json({ error: "invalid_receipt" }, 402);
      }
    }
    const receiptValue = settlementPayload.payload;
    const claimedTransaction =
      receiptValue &&
      typeof receiptValue === "object" &&
      typeof receiptValue.transactionHash === "string"
        ? receiptValue.transactionHash
        : null;
    const settledTransaction = acceptedTransaction(claimedInvoice);
    const exactSettledRetry =
      claimedTransaction !== null &&
      settledTransaction !== null &&
      sameFelt(claimedTransaction, settledTransaction);
    if (
      now() > invoice.expiresAt &&
      settledTransaction !== null &&
      !exactSettledRetry
    ) {
      return json({ error: "invoice_expired" }, 400);
    }
    if (
      payload.x402Version !== 2 ||
      accepted.scheme !== expectedPublic.scheme ||
      accepted.network !== expectedPublic.network ||
      accepted.amount !== expectedPublic.amount ||
      accepted.maxTimeoutSeconds !== expectedPublic.maxTimeoutSeconds ||
      accepted.extra.expiresAt !== expectedPublic.extra.expiresAt ||
      JSON.stringify(accepted.extra.terms ?? null) !==
        JSON.stringify(expectedPublic.extra.terms ?? null) ||
      !sameFelt(accepted.asset, expectedPublic.asset) ||
      !sameFelt(accepted.payTo, expectedPublic.payTo)
    ) {
      return json({ error: "payment_requirements_mismatch" }, 400);
    }

    let settlementStarted = false;
    let settlementLeaseId: string | null = null;
    if (exactSettledRetry) {
      invoices.acceptSettlement(claimedInvoice);
    } else {
      if (claimedTransaction === null) {
        return json({ error: "invalid_receipt" }, 402);
      }
      settlementLeaseId = randomBytes(16).toString("hex");
      const start = invoices.beginSettlement(
        claimedInvoice,
        claimedTransaction,
        settlementLeaseId,
        now(),
        settlementLeaseMs,
      );
      if (start === "expired") {
        invoices.pruneExpired(now());
        return json({ error: "invoice_expired" }, 400);
      }
      if (start !== "started") {
        return json({ error: "invoice_settlement_in_progress" }, 409, {
          "retry-after": "1",
        });
      }
      settlementStarted = true;
    }

    let settlement: SettleResponse;
    try {
      settlement = await options.facilitator.settle(
        settlementPayload,
        requirements,
      );
    } catch (error) {
      if (settlementStarted) {
        invoices.failSettlement(claimedInvoice, settlementLeaseId!, now());
      }
      throw error;
    }
    if (!settlement.success) {
      if (settlementStarted) {
        invoices.failSettlement(claimedInvoice, settlementLeaseId!, now());
      }
      return json({ error: settlement.errorReason ?? "settlement_failed" }, 402, {
        "payment-response": encodePaymentResponseHeader(
          redactEncryptedSettlement(
            settlement,
            expectedPublic.scheme === PRIVATE_ENVELOPE_SCHEME,
          ),
        ),
      });
    }
    invoices.acceptSettlement(claimedInvoice);
    return json(
      {
        algorithm: "sha256",
        digest: createHash("sha256").update(text).digest("hex"),
      },
      200,
      {
        "payment-response": encodePaymentResponseHeader(
          redactEncryptedSettlement(
            settlement,
            expectedPublic.scheme === PRIVATE_ENVELOPE_SCHEME,
          ),
        ),
      },
    );
  };
}
