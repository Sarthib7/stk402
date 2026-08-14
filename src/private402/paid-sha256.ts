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

import {
  PRIVATE_EXACT_SCHEME,
  createPrivatePaymentRequired,
} from "./signed-receipt.js";

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
}

interface IssuedInvoice {
  requirements: PaymentRequirements;
  requestUrl: string;
  expiresAt: number;
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

export function createPaidSha256Handler(options: PaidSha256Options) {
  const createInvoiceId =
    options.createInvoiceId ?? (() => `0x${randomBytes(31).toString("hex")}`);
  const now = options.now ?? Date.now;
  const resourceUrl = options.resourceUrl ?? ((request: Request) => request.url);
  const maxOutstandingInvoices = options.maxOutstandingInvoices ?? 1_000;
  const invoiceTimeoutSeconds = options.invoiceTimeoutSeconds ?? 60;
  if (!Number.isSafeInteger(maxOutstandingInvoices) || maxOutstandingInvoices < 1) {
    throw new Error("maxOutstandingInvoices must be a positive safe integer");
  }
  if (!Number.isSafeInteger(invoiceTimeoutSeconds) || invoiceTimeoutSeconds < 1) {
    throw new Error("invoiceTimeoutSeconds must be a positive safe integer");
  }
  const invoices = new Map<string, IssuedInvoice>();

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
      for (const [id, invoice] of invoices) {
        if (invoice.expiresAt < issuedAt) invoices.delete(id);
      }
      if (invoices.size >= maxOutstandingInvoices) {
        return json({ error: "invoice_capacity_reached" }, 503, {
          "retry-after": "60",
        });
      }
      const expiresAt = issuedAt + invoiceTimeoutSeconds * 1_000;
      const paymentRequired = createPrivatePaymentRequired({
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
      const requirements = paymentRequired.accepts[0]!;
      const issuedInvoice = requirements.extra.invoiceId as string;
      invoices.set(issuedInvoice, {
        requirements,
        requestUrl: requestedResource,
        expiresAt,
      });
      return json({ error: "payment_required" }, 402, {
        "payment-required": encodePaymentRequiredHeader(paymentRequired),
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
    if (now() > invoice.expiresAt) {
      invoices.delete(claimedInvoice);
      return json({ error: "invoice_expired" }, 400);
    }
    const requirements = invoice.requirements;
    if (
      payload.x402Version !== 2 ||
      accepted.scheme !== requirements.scheme ||
      accepted.network !== requirements.network ||
      accepted.amount !== requirements.amount ||
      accepted.maxTimeoutSeconds !== requirements.maxTimeoutSeconds ||
      accepted.extra.expiresAt !== requirements.extra.expiresAt ||
      !sameFelt(accepted.asset, requirements.asset) ||
      !sameFelt(accepted.payTo, requirements.payTo)
    ) {
      return json({ error: "payment_requirements_mismatch" }, 400);
    }

    const settlement = await options.facilitator.settle(payload, requirements);
    if (!settlement.success) {
      return json({ error: settlement.errorReason ?? "settlement_failed" }, 402, {
        "payment-response": encodePaymentResponseHeader(settlement),
      });
    }
    return json(
      {
        algorithm: "sha256",
        digest: createHash("sha256").update(text).digest("hex"),
      },
      200,
      { "payment-response": encodePaymentResponseHeader(settlement) },
    );
  };
}
