import type {
  Network,
  PaymentPayload,
  PaymentRequired,
  PaymentRequirements,
  ResourceInfo,
  SchemeNetworkClient,
  SchemeNetworkFacilitator,
  SettleResponse,
  VerifyResponse,
} from "@x402/core/types";
import type { ArraySignatureType, Signature, TypedData } from "starknet";
import { num, validateAndParseAddress } from "starknet";
import type { KeyObject } from "node:crypto";

import {
  PRIVATE_ENVELOPE_SCHEME,
  sealReceipt,
} from "./private-envelope.js";
import {
  buildReceiptTypedData,
  invoiceExpiresAt,
} from "../shared/receipt-typed-data.js";

export { buildReceiptTypedData, invoiceExpiresAt } from "../shared/receipt-typed-data.js";

export const PRIVATE_EXACT_SCHEME = "exact-private";

export interface SignedReceipt extends Record<string, unknown> {
  invoiceId: string;
  transactionHash: string;
  payer: string;
  signature: ArraySignatureType;
}

export interface PrivateReceiptCreator {
  createReceipt(requirements: PaymentRequirements): Promise<SignedReceipt>;
}

export class PrivateExactClient implements SchemeNetworkClient {
  readonly scheme = PRIVATE_EXACT_SCHEME;

  constructor(private readonly receiptCreator: PrivateReceiptCreator) {}

  async createPaymentPayload(
    x402Version: number,
    requirements: PaymentRequirements,
  ): Promise<{ x402Version: number; payload: Record<string, unknown> }> {
    return {
      x402Version,
      payload: await this.receiptCreator.createReceipt(requirements),
    };
  }
}

export class PrivateEnvelopeClient implements SchemeNetworkClient {
  readonly scheme = PRIVATE_ENVELOPE_SCHEME;

  constructor(
    private readonly receiptCreator: PrivateReceiptCreator,
    private readonly privateRequirements: PaymentRequirements,
    private readonly resourceUrl: string,
    private readonly serverPublicKey: KeyObject,
  ) {}

  async createPaymentPayload(
    x402Version: number,
    publicRequirements: PaymentRequirements,
  ): Promise<{ x402Version: number; payload: Record<string, unknown> }> {
    const invoiceId = publicRequirements.extra.invoiceId;
    const expiresAt = publicRequirements.extra.expiresAt;
    if (
      publicRequirements.scheme !== PRIVATE_ENVELOPE_SCHEME ||
      typeof invoiceId !== "string" ||
      typeof expiresAt !== "string" ||
      invoiceId !== this.privateRequirements.extra.invoiceId ||
      expiresAt !== this.privateRequirements.extra.expiresAt ||
      publicRequirements.network !== this.privateRequirements.network ||
      publicRequirements.asset !== this.privateRequirements.asset ||
      publicRequirements.maxTimeoutSeconds !==
        this.privateRequirements.maxTimeoutSeconds ||
      publicRequirements.amount !== "0" ||
      publicRequirements.payTo !== "0x0"
    ) {
      throw new Error("payment envelope mismatch");
    }
    const receipt = await this.receiptCreator.createReceipt(
      this.privateRequirements,
    );
    return {
      x402Version,
      payload: sealReceipt(
        receipt,
        {
          invoiceId,
          resourceUrl: this.resourceUrl,
          network: publicRequirements.network,
          asset: publicRequirements.asset,
          maxTimeoutSeconds: publicRequirements.maxTimeoutSeconds,
          expiresAt,
        },
        this.serverPublicKey,
      ) as unknown as Record<string, unknown>,
    };
  }
}

export function createPrivatePaymentRequired(input: {
  network: Network;
  token: string;
  amount: bigint;
  recipient: string;
  invoiceId: string;
  maxTimeoutSeconds: number;
  expiresAt: number;
  resource: ResourceInfo;
}): PaymentRequired {
  if (input.amount <= 0n || input.amount >= 2n ** 128n) {
    throw new Error("amount must be a positive u128");
  }
  if (
    !Number.isSafeInteger(input.maxTimeoutSeconds) ||
    input.maxTimeoutSeconds < 1 ||
    input.maxTimeoutSeconds > Math.floor(Number.MAX_SAFE_INTEGER / 1_000)
  ) {
    throw new Error("maxTimeoutSeconds must be a positive safe integer");
  }
  if (!Number.isSafeInteger(input.expiresAt) || input.expiresAt < 1) {
    throw new Error("expiresAt must be a positive safe integer");
  }

  const requirements: PaymentRequirements = {
    scheme: PRIVATE_EXACT_SCHEME,
    network: input.network,
    asset: address(input.token),
    amount: input.amount.toString(),
    payTo: address(input.recipient),
    maxTimeoutSeconds: input.maxTimeoutSeconds,
    extra: {
      invoiceId: num.toHex(input.invoiceId),
      expiresAt: input.expiresAt.toString(),
    },
  };
  chainId(input.network);
  invoiceId(requirements);

  return {
    x402Version: 2,
    resource: input.resource,
    accepts: [requirements],
  };
}

export interface PaymentEvidence {
  transactionHash: string;
  payer: string;
  recipient: string;
  token: string;
  amount: bigint;
  final: boolean;
}

export interface PaymentEvidenceReader {
  findPayment(transactionHash: string): Promise<PaymentEvidence | null>;
}

export interface ReceiptSignatureVerifier {
  verify(
    message: TypedData,
    signature: Signature,
    payer: string,
  ): Promise<boolean>;
}

export type ClaimConsumption =
  | "accepted"
  | "already_accepted"
  | "invoice_used"
  | "transaction_used";

export interface ClaimLedger {
  consume(invoiceId: string, transactionHash: string): ClaimConsumption;
  transactionForInvoice(invoiceId: string): string | null;
}

export class InMemoryClaimLedger implements ClaimLedger {
  private readonly invoices = new Map<string, string>();
  private readonly transactions = new Map<string, string>();

  consume(invoiceId: string, transactionHash: string): ClaimConsumption {
    const invoiceTransaction = this.invoices.get(invoiceId);
    if (invoiceTransaction === transactionHash) return "already_accepted";
    if (invoiceTransaction) return "invoice_used";
    if (this.transactions.has(transactionHash)) return "transaction_used";

    this.transactions.set(transactionHash, invoiceId);
    this.invoices.set(invoiceId, transactionHash);
    return "accepted";
  }

  transactionForInvoice(invoiceId: string): string | null {
    return this.invoices.get(invoiceId) ?? null;
  }
}

function isFelt(value: unknown): value is string {
  if (typeof value !== "string" || !/^0x[0-9a-f]+$/i.test(value)) return false;
  try {
    return BigInt(value) >= 0n && BigInt(value) < 2n ** 251n;
  } catch {
    return false;
  }
}

function address(value: string): string {
  return validateAndParseAddress(value);
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

function parseReceipt(payload: PaymentPayload): SignedReceipt | null {
  const value = payload.payload;
  if (
    !value ||
    typeof value !== "object" ||
    !isFelt(value.invoiceId) ||
    !isFelt(value.transactionHash) ||
    typeof value.payer !== "string" ||
    !Array.isArray(value.signature) ||
    value.signature.length < 2 ||
    !value.signature.every(isFelt)
  ) {
    return null;
  }

  try {
    return {
      invoiceId: num.toHex(value.invoiceId),
      transactionHash: num.toHex(value.transactionHash),
      payer: address(value.payer),
      signature: value.signature,
    };
  } catch {
    return null;
  }
}

function sameFelt(left: string, right: string): boolean {
  try {
    return BigInt(left) === BigInt(right);
  } catch {
    return false;
  }
}

interface PrivateExactFacilitatorOptions {
  evidenceReader: PaymentEvidenceReader;
  signatureVerifier: ReceiptSignatureVerifier;
  ledger: ClaimLedger;
}

export class PrivateExactFacilitator implements SchemeNetworkFacilitator {
  readonly scheme = PRIVATE_EXACT_SCHEME;
  readonly caipFamily = "starknet:*";

  constructor(private readonly options: PrivateExactFacilitatorOptions) {}

  getExtra(): undefined {
    return undefined;
  }

  getSigners(): string[] {
    return [];
  }

  async verify(
    payload: PaymentPayload,
    requirements: PaymentRequirements,
  ): Promise<VerifyResponse> {
    let expectedInvoice: string;
    try {
      expectedInvoice = invoiceId(requirements);
      address(requirements.payTo);
      address(requirements.asset);
      if (requirements.scheme !== PRIVATE_EXACT_SCHEME) throw new Error();
      if (!/^\d+$/.test(requirements.amount)) throw new Error();
    } catch {
      return { isValid: false, invalidReason: "invalid_requirements" };
    }

    const receipt = parseReceipt(payload);
    if (!receipt || !sameFelt(receipt.invoiceId, expectedInvoice)) {
      return { isValid: false, invalidReason: "invalid_receipt" };
    }

    const message = buildReceiptTypedData(requirements, receipt.transactionHash);
    if (!(await this.options.signatureVerifier.verify(message, receipt.signature, receipt.payer))) {
      return { isValid: false, invalidReason: "invalid_signature" };
    }

    const evidence = await this.options.evidenceReader.findPayment(receipt.transactionHash);
    if (
      !evidence ||
      !evidence.final ||
      !sameFelt(evidence.transactionHash, receipt.transactionHash) ||
      !sameFelt(evidence.payer, receipt.payer) ||
      !sameFelt(evidence.recipient, requirements.payTo) ||
      !sameFelt(evidence.token, requirements.asset) ||
      evidence.amount !== BigInt(requirements.amount)
    ) {
      return { isValid: false, invalidReason: "payment_mismatch" };
    }

    return { isValid: true, payer: receipt.payer };
  }

  async settle(
    payload: PaymentPayload,
    requirements: PaymentRequirements,
  ): Promise<SettleResponse> {
    const verified = await this.verify(payload, requirements);
    const receipt = parseReceipt(payload);

    if (!verified.isValid || !receipt) {
      return {
        success: false,
        errorReason: verified.invalidReason ?? "invalid_receipt",
        transaction: receipt?.transactionHash ?? "",
        network: requirements.network,
      };
    }

    const consumed = this.options.ledger.consume(receipt.invoiceId, receipt.transactionHash);
    if (consumed !== "accepted" && consumed !== "already_accepted") {
      return {
        success: false,
        errorReason: consumed,
        payer: receipt.payer,
        transaction: receipt.transactionHash,
        network: requirements.network,
      };
    }

    return {
      success: true,
      payer: receipt.payer,
      transaction: receipt.transactionHash,
      network: requirements.network,
      amount: requirements.amount,
    };
  }
}
