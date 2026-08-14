import {
  decodePaymentRequiredHeader,
  encodePaymentSignatureHeader,
} from "@x402/core/http";
import type { PaymentRequirements } from "@x402/core/types";
import type { WalletAccountV6 } from "starknet";
import { num, validateAndParseAddress } from "starknet";

import {
  CLIENT_KEY_HEADER,
  PRIVATE_ENVELOPE_SCHEME,
  assertEnvelopePublicKeyHeader,
  openPaymentTerms,
  sealReceipt,
  type SealedValue,
} from "@stk402/shared/envelope-portable";
import { buildReceiptTypedData } from "@stk402/shared/receipt-typed-data";

const STRK =
  "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";

export interface BrowserPayProgress {
  step: string;
  detail?: string;
}

export interface BrowserEnvelopeKeys {
  /** Server X25519 SPKI, base64url. */
  serverPublicKey: string;
  /** Authorized client X25519 PKCS8, base64url. */
  clientPrivateKey: string;
  /** Matching client X25519 SPKI, base64url (sent as stk402-client-key). */
  clientPublicKey: string;
}

/**
 * Consumer pay path (Wallet API). Opens envelope terms in-browser, then runs
 * STRK20 transfer + Receipt sign. Server must authorize this client public key.
 */
export async function payWithWallet(input: {
  resourceUrl: string;
  account: WalletAccountV6;
  payerAddress: string;
  envelope?: BrowserEnvelopeKeys;
  onProgress?: (progress: BrowserPayProgress) => void;
}): Promise<{ status: number; body: unknown; transactionHash: string }> {
  const note = (step: string, detail?: string) =>
    input.onProgress?.({ step, detail });

  const envelope = input.envelope;
  const requestHeaders: Record<string, string> = {};
  if (envelope) {
    assertEnvelopePublicKeyHeader(envelope.serverPublicKey);
    assertEnvelopePublicKeyHeader(envelope.clientPublicKey);
    requestHeaders[CLIENT_KEY_HEADER] = envelope.clientPublicKey;
  }

  note("request", "GET unpaid resource");
  const unpaid = await fetch(input.resourceUrl, {
    redirect: "error",
    headers: requestHeaders,
  });
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

  let requirements: PaymentRequirements;
  let publicAccepted: PaymentRequirements = accepted;

  if (accepted.scheme === PRIVATE_ENVELOPE_SCHEME) {
    if (!envelope) {
      throw new Error(
        "server sent encrypted terms. Set VITE_STK402_ENVELOPE_PUBLIC_KEY and client envelope keys.",
      );
    }
    const invoiceId = accepted.extra.invoiceId;
    const expiresAt = accepted.extra.expiresAt;
    const terms = accepted.extra.terms as SealedValue | undefined;
    if (typeof invoiceId !== "string" || typeof expiresAt !== "string" || !terms) {
      throw new Error("invalid encrypted payment challenge");
    }
    note("envelope", "open payment terms");
    requirements = openPaymentTerms(
      terms,
      {
        invoiceId,
        resourceUrl: input.resourceUrl,
        network: accepted.network,
        asset: accepted.asset,
        maxTimeoutSeconds: accepted.maxTimeoutSeconds,
        expiresAt,
        clientPublicKey: envelope.clientPublicKey,
      },
      envelope.clientPrivateKey,
      envelope.serverPublicKey,
    );
  } else if (accepted.scheme === "exact-private") {
    requirements = accepted;
  } else {
    throw new Error(`unsupported scheme ${accepted.scheme}`);
  }

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
  const expiresAt = requirements.extra.expiresAt;
  if (typeof invoiceId !== "string") {
    throw new Error("invoice id missing from challenge");
  }

  const plainReceipt = {
    invoiceId,
    transactionHash: num.toHex(transaction_hash),
    payer: validateAndParseAddress(input.payerAddress),
    signature: signatureFelts,
  };

  let payload: Record<string, unknown> = plainReceipt;
  if (accepted.scheme === PRIVATE_ENVELOPE_SCHEME) {
    if (!envelope || typeof expiresAt !== "string") {
      throw new Error("envelope keys required to seal receipt");
    }
    note("envelope", "seal receipt for server");
    payload = sealReceipt(
      plainReceipt,
      {
        invoiceId,
        resourceUrl: input.resourceUrl,
        network: publicAccepted.network,
        asset: publicAccepted.asset,
        maxTimeoutSeconds: publicAccepted.maxTimeoutSeconds,
        expiresAt,
      },
      envelope.serverPublicKey,
    ) as unknown as Record<string, unknown>;
  }

  const payment = {
    x402Version: paymentRequired.x402Version,
    accepted: publicAccepted,
    payload,
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
