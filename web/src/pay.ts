import {
  decodePaymentRequiredHeader,
  encodePaymentSignatureHeader,
} from "@x402/core/http";
import type { PaymentRequirements } from "@x402/core/types";
import type { WalletAccountV6 } from "starknet";
import { num, validateAndParseAddress } from "starknet";

import { buildReceiptTypedData } from "@stk402/shared/receipt-typed-data";

const STRK =
  "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";

export interface BrowserPayProgress {
  step: string;
  detail?: string;
}

/**
 * Consumer pay path (Wallet API). Envelope open for exact-private-envelope-v1
 * is the next feat; this slice probes the 402, runs STRK20 transfer when terms
 * are readable as exact-private, then signs the Receipt.
 */
export async function payWithWallet(input: {
  resourceUrl: string;
  account: WalletAccountV6;
  payerAddress: string;
  onProgress?: (progress: BrowserPayProgress) => void;
}): Promise<{ status: number; body: unknown; transactionHash: string }> {
  const note = (step: string, detail?: string) =>
    input.onProgress?.({ step, detail });

  note("request", "GET unpaid resource");
  const unpaid = await fetch(input.resourceUrl, { redirect: "error" });
  if (unpaid.status !== 402) {
    throw new Error(`resource returned ${unpaid.status} before payment`);
  }
  await unpaid.text();
  const header = unpaid.headers.get("payment-required");
  if (!header) throw new Error("payment-required header missing");

  const paymentRequired = decodePaymentRequiredHeader(header);
  if (new URL(paymentRequired.resource.url).toString() !== input.resourceUrl) {
    throw new Error("payment challenge resource mismatch");
  }

  const accepted = paymentRequired.accepts[0];
  if (!accepted) throw new Error("payment challenge has no accepts entry");

  if (accepted.scheme === "exact-private-envelope-v1") {
    throw new Error(
      "server sent encrypted terms. Browser envelope open ships next; use Agent CLI/MCP pay for now, or wait for the envelope feat.",
    );
  }
  if (accepted.scheme !== "exact-private") {
    throw new Error(`unsupported scheme ${accepted.scheme}`);
  }

  const requirements = accepted as PaymentRequirements;
  const recipient = validateAndParseAddress(requirements.payTo);
  const token = validateAndParseAddress(requirements.asset);
  if (num.toBigInt(token) !== num.toBigInt(STRK)) {
    throw new Error("browser demo currently accepts STRK invoices only");
  }
  const amount = BigInt(requirements.amount);
  if (amount <= 0n) throw new Error("invoice amount must be positive");

  note("transfer", "wallet proving STRK20 transfer (can take minutes)");
  const { transaction_hash } = await input.account.strk20InvokeTransaction([
    {
      type: "transfer",
      token,
      amount: amount.toString(),
      recipient,
    },
  ]);

  note("receipt", "sign PrivatePaymentReceipt");
  const typedData = buildReceiptTypedData(requirements, transaction_hash);
  const signature = await input.account.signMessage(typedData);
  const signatureFelts = (
    Array.isArray(signature)
      ? signature
      : [(signature as { r: bigint }).r, (signature as { s: bigint }).s]
  ).map((part) => num.toHex(part));

  const invoiceId = requirements.extra.invoiceId;
  if (typeof invoiceId !== "string") {
    throw new Error("invoice id missing from challenge");
  }

  const payment = {
    x402Version: paymentRequired.x402Version,
    accepted: requirements,
    payload: {
      invoiceId,
      transactionHash: num.toHex(transaction_hash),
      payer: validateAndParseAddress(input.payerAddress),
      signature: signatureFelts,
    },
  };

  note("settle", "retry Paid Resource with Receipt");
  const paid = await fetch(input.resourceUrl, {
    redirect: "error",
    headers: {
      "payment-signature": encodePaymentSignatureHeader(payment),
    },
  });
  const contentType = paid.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json")
    ? await paid.json()
    : await paid.text();

  if (paid.status !== 200) {
    throw new Error(
      `settlement failed with HTTP ${paid.status}: ${typeof body === "string" ? body : JSON.stringify(body)}`,
    );
  }

  return { status: paid.status, body, transactionHash: transaction_hash };
}
