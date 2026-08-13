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

export function createPrivatePaymentRequired(input: {
  network: Network;
  token: string;
  amount: bigint;
  recipient: string;
  invoiceId: string;
  resource: ResourceInfo;
}): PaymentRequired {
  if (input.amount <= 0n || input.amount >= 2n ** 128n) {
    throw new Error("amount must be a positive u128");
  }

  const requirements: PaymentRequirements = {
    scheme: PRIVATE_EXACT_SCHEME,
    network: input.network,
    asset: address(input.token),
    amount: input.amount.toString(),
    payTo: address(input.recipient),
    maxTimeoutSeconds: 60,
    extra: { invoiceId: num.toHex(input.invoiceId) },
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
  | "invoice_used"
  | "transaction_used";

export interface ClaimLedger {
  consume(invoiceId: string, transactionHash: string): ClaimConsumption;
}

export class InMemoryClaimLedger implements ClaimLedger {
  private readonly invoices = new Set<string>();
  private readonly transactions = new Set<string>();

  consume(invoiceId: string, transactionHash: string): ClaimConsumption {
    if (this.transactions.has(transactionHash)) return "transaction_used";
    if (this.invoices.has(invoiceId)) return "invoice_used";

    this.transactions.add(transactionHash);
    this.invoices.add(invoiceId);
    return "accepted";
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

export function buildReceiptTypedData(
  requirements: PaymentRequirements,
  transactionHash: string,
): TypedData {
  return {
    domain: {
      name: "STK402",
      version: "1",
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
      ],
    },
    message: {
      invoice_id: invoiceId(requirements),
      transaction_hash: num.toHex(transactionHash),
      recipient: address(requirements.payTo),
      token: address(requirements.asset),
      amount: requirements.amount,
    },
  };
}

function parseReceipt(payload: PaymentPayload): SignedReceipt | null {
  const value = payload.payload;
  if (
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
    if (consumed !== "accepted") {
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
