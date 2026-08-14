import type { Network, PaymentRequirements } from "@x402/core/types";
import type { TypedData } from "starknet";
import { num, validateAndParseAddress } from "starknet";

function isFelt(value: unknown): value is string {
  if (typeof value !== "string" || !/^0x[0-9a-f]+$/i.test(value)) return false;
  try {
    return BigInt(value) >= 0n && BigInt(value) < 2n ** 251n;
  } catch {
    return false;
  }
}

function chainId(network: Network): string {
  if (network === "starknet:SN_MAIN") return "SN_MAIN";
  if (network === "starknet:SN_SEPOLIA") return "SN_SEPOLIA";
  throw new Error("unsupported_network");
}

function invoiceId(requirements: PaymentRequirements): string {
  const value = requirements.extra.invoiceId;
  if (typeof value !== "string" || !isFelt(value)) {
    throw new Error("invalid_invoice");
  }
  return num.toHex(value);
}

export function invoiceExpiresAt(requirements: PaymentRequirements): number {
  const value = requirements.extra.expiresAt;
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    throw new Error("invalid_invoice_expiry");
  }
  const expiresAt = Number(value);
  if (!Number.isSafeInteger(expiresAt) || expiresAt < 1) {
    throw new Error("invalid_invoice_expiry");
  }
  return expiresAt;
}

/** SNIP-12 typed data for a private payment Receipt. Safe for browser and Node. */
export function buildReceiptTypedData(
  requirements: PaymentRequirements,
  transactionHash: string,
): TypedData {
  return {
    domain: {
      name: "STK402",
      version: "2",
      chainId: chainId(requirements.network),
      revision: "1",
    },
    primaryType: "PrivatePaymentReceipt",
    types: {
      StarknetDomain: [
        { name: "name", type: "shortstring" },
        { name: "version", type: "shortstring" },
        { name: "chainId", type: "shortstring" },
        { name: "revision", type: "shortstring" },
      ],
      PrivatePaymentReceipt: [
        { name: "invoice_id", type: "felt" },
        { name: "transaction_hash", type: "felt" },
        { name: "recipient", type: "ContractAddress" },
        { name: "token", type: "ContractAddress" },
        { name: "amount", type: "u128" },
        { name: "expires_at", type: "felt" },
      ],
    },
    message: {
      invoice_id: invoiceId(requirements),
      transaction_hash: num.toHex(transactionHash),
      recipient: validateAndParseAddress(requirements.payTo),
      token: validateAndParseAddress(requirements.asset),
      amount: requirements.amount,
      expires_at: invoiceExpiresAt(requirements).toString(),
    },
  };
}
