import type {
  PrivateTransfersInterface,
  ProofInvocationResult,
} from "@starkware-libs/starknet-privacy-sdk";
import { SetupRequirement } from "@starkware-libs/starknet-privacy-sdk";
import {
  toPaymasterCall,
  type Paymaster,
  type PaymasterExecute,
} from "@starkware-libs/starknet-privacy-client";
import type { Network, PaymentRequirements } from "@x402/core/types";
import { createHash } from "node:crypto";
import type { Account, RpcProvider } from "starknet";
import {
  TransactionFinalityStatus,
  num,
  stark,
  validateAndParseAddress,
} from "starknet";

import type {
  PrivateReceiptCreator,
  SignedReceipt,
} from "./signed-receipt.js";
import {
  PRIVATE_EXACT_SCHEME,
  buildReceiptTypedData,
  invoiceExpiresAt,
} from "./signed-receipt.js";
import type { RequiredFinality } from "./rpc-finality.js";
import type { PayerJournal } from "./payer-journal.js";
import type { SpendBudget } from "./spend-budget.js";

type PayerAccount = Pick<
  Account,
  "address" | "estimateInvokeFee" | "execute" | "provider" | "signMessage"
>;
type PayerProvider = Pick<
  RpcProvider,
  | "callContract"
  | "getBlockNumber"
  | "getChainId"
  | "verifyMessageInStarknet"
  | "waitForTransaction"
>;

export const STRK_TOKEN_ADDRESS =
  "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";

export class Strk20ReceiptCreator implements PrivateReceiptCreator {
  private readonly authorizedPool: string;

  constructor(
    private readonly transfers: PrivateTransfersInterface,
    private readonly account: PayerAccount,
    private readonly provider: PayerProvider,
    private readonly poolAddress: string,
    private readonly expectedNetwork: Network,
    private readonly expectedToken: string,
    private readonly expectedRecipient: string,
    private readonly maxAmount: bigint,
    private readonly maxPoolFee: bigint,
    private readonly maxNetworkFee: bigint,
    private readonly requiredFinality: RequiredFinality,
    private readonly journal: PayerJournal,
    private readonly spendBudget: SpendBudget,
    private readonly minimumInvoiceValidityMs: number,
    private readonly allowedClockSkewMs: number,
    private readonly now: () => number = Date.now,
    private readonly paymaster?: Paymaster,
    private readonly maxPaymasterFee?: bigint,
  ) {
    this.authorizedPool = validateAndParseAddress(poolAddress);
    if (validateAndParseAddress(expectedToken) !== STRK_TOKEN_ADDRESS) {
      throw new Error("payer currently supports STRK payments only");
    }
    if (
      !Number.isSafeInteger(minimumInvoiceValidityMs) ||
      minimumInvoiceValidityMs < 1
    ) {
      throw new Error("minimum invoice validity must be a positive safe integer");
    }
    if (!Number.isSafeInteger(allowedClockSkewMs) || allowedClockSkewMs < 0) {
      throw new Error("allowed clock skew must be a non-negative safe integer");
    }
    for (const [name, value] of [
      ["maxAmount", maxAmount],
      ["maxPoolFee", maxPoolFee],
      ["maxNetworkFee", maxNetworkFee],
    ] as const) {
      if (value < 0n || value >= 2n ** 128n) {
        throw new Error(`${name} must fit in u128`);
      }
    }
    if (Boolean(paymaster) !== (maxPaymasterFee !== undefined)) {
      throw new Error("paymaster and max paymaster fee must be configured together");
    }
    if (
      maxPaymasterFee !== undefined &&
      (maxPaymasterFee <= 0n || maxPaymasterFee >= 2n ** 128n)
    ) {
      throw new Error("maxPaymasterFee must be a positive u128");
    }
  }

  async createReceipt(
    requirements: PaymentRequirements,
  ): Promise<SignedReceipt> {
    if (requirements.scheme !== PRIVATE_EXACT_SCHEME) {
      throw new Error("unsupported payment scheme");
    }
    if (requirements.network !== this.expectedNetwork) {
      throw new Error("payment network mismatch");
    }
    const token = validateAndParseAddress(requirements.asset);
    const recipient = validateAndParseAddress(requirements.payTo);
    if (token !== validateAndParseAddress(this.expectedToken)) {
      throw new Error("payment token is not authorized");
    }
    if (recipient !== validateAndParseAddress(this.expectedRecipient)) {
      throw new Error("payment recipient is not authorized");
    }
    const amount = parseAmount(requirements.amount);
    if (amount > this.maxAmount) throw new Error("payment exceeds local limit");
    const expiresAt = invoiceExpiresAt(requirements);
    const invoiceValue = requirements.extra.invoiceId;
    if (typeof invoiceValue !== "string") throw new Error("invalid invoice ID");
    const preflightMessage = buildReceiptTypedData(requirements, "0x0");
    const invoiceId = num.toHex(invoiceValue);
    const fingerprint = paymentFingerprint(requirements);
    const attempt = this.journal.begin(invoiceId, fingerprint);
    if (attempt.state === "in_progress") {
      throw new Error("payment for this invoice is already in progress");
    }
    if (attempt.state === "unknown") {
      throw new Error("payment submission outcome requires reconciliation");
    }
    if (attempt.state === "submitted") {
      return this.finishReceipt(requirements, attempt.transactionHash);
    }
    try {
      this.assertInvoiceValidity(requirements, expiresAt);
    } catch (error) {
      this.journal.release(invoiceId);
      throw error;
    }

    let calls: Parameters<PayerAccount["execute"]>[0] | undefined;
    let resourceBounds:
      | Awaited<ReturnType<PayerAccount["estimateInvokeFee"]>>["resourceBounds"]
      | undefined;
    let proof: string;
    let proofFacts: string[];
    let paymasterExecute: PaymasterExecute | undefined;
    try {
      const expectedChainId = networkChainId(this.expectedNetwork);
      const [providerChainId, accountChainId] = await Promise.all([
        this.provider.getChainId(),
        this.account.provider.getChainId(),
      ]);
      if (providerChainId !== expectedChainId || accountChainId !== expectedChainId) {
        throw new Error("payer chain mismatch");
      }
      const preflightSignature = await this.account.signMessage(preflightMessage);
      if (
        !(await this.provider.verifyMessageInStarknet(
          preflightMessage,
          preflightSignature,
          this.account.address,
        ))
      ) {
        throw new Error("payer account cannot verify receipt signatures");
      }

      const latestBlock = await this.provider.getBlockNumber();
      if (latestBlock < 10) throw new Error("chain is too young for proving");
      const provingBlockId = latestBlock - 10;

      const feeResult = await this.provider.callContract({
        contractAddress: this.authorizedPool,
        entrypoint: "get_fee_amount",
      });
      if (feeResult[0] === undefined) throw new Error("pool fee query failed");
      const feeAmount = BigInt(feeResult[0]);
      if (feeAmount > this.maxPoolFee) throw new Error("pool fee exceeds local limit");

      let paymasterFee = 0n;
      let paymasterFeeRecipient: string | undefined;
      if (this.paymaster) {
        const setup = await this.transfers.discoverRequirement(recipient, token);
        if (setup !== SetupRequirement.Ready) {
          throw new Error("private payment channel is not ready");
        }
        const quote = await this.paymaster.buildTransaction({
          kind: "applyAction",
          poolAddress: this.authorizedPool,
        });
        if (quote.typedData !== undefined || quote.feeAction.type !== "withdraw") {
          throw new Error("paymaster returned an invalid private quote");
        }
        if (validateAndParseAddress(quote.feeAction.token) !== STRK_TOKEN_ADDRESS) {
          throw new Error("paymaster fee token is not authorized");
        }
        paymasterFeeRecipient = validateAndParseAddress(
          quote.feeAction.recipient,
        );
        if (BigInt(paymasterFeeRecipient) === 0n) {
          throw new Error("paymaster fee recipient is invalid");
        }
        try {
          paymasterFee = BigInt(quote.feeAction.amount);
        } catch {
          throw new Error("paymaster fee amount is invalid");
        }
        if (paymasterFee <= 0n || paymasterFee >= 2n ** 128n) {
          throw new Error("paymaster fee amount is invalid");
        }
        if (paymasterFee > this.maxPaymasterFee!) {
          throw new Error("paymaster fee exceeds local limit");
        }
      }

      const builder = this.transfers
        .build({
          autoRegister: !this.paymaster,
          autoSetup: !this.paymaster,
          autoDiscover: { notes: "refresh", channels: "refresh" },
          autoSelectNotes: "naive",
        })
        .surplusTo(this.account.address)
        .with(token, (tokenBuilder) => {
          tokenBuilder.transfer({ recipient, amount });
          if (paymasterFeeRecipient) {
            tokenBuilder.withdraw({
              recipient: paymasterFeeRecipient,
              amount: paymasterFee,
            });
          }
        });
      const invocation: ProofInvocationResult =
        await builder.createProofInvocation({ provingBlockId });
      const { callAndProof } = await this.transfers.executeWithInvocation(
        invocation,
        provingBlockId,
      );
      if (
        !callAndProof.proof.data ||
        !callAndProof.proof.proofFacts?.length
      ) {
        throw new Error("prover returned incomplete proof data");
      }
      if (
        validateAndParseAddress(callAndProof.call.contractAddress) !==
          this.authorizedPool ||
        callAndProof.call.entrypoint !== "apply_actions"
      ) {
        throw new Error("prover returned an unauthorized pool call");
      }
      proof = callAndProof.proof.data;
      proofFacts = callAndProof.proof.proofFacts;
      this.assertInvoiceValidity(requirements, expiresAt);
      let reservationAmount: bigint;
      if (this.paymaster) {
        if (amount + paymasterFee >= 2n ** 128n) {
          throw new Error("total private spend exceeds u128");
        }
        paymasterExecute = {
          kind: "applyAction",
          applyActionsCall: toPaymasterCall(callAndProof.call),
          proof,
          proofFacts,
        };
        reservationAmount = amount + paymasterFee;
      } else {
        calls =
          feeAmount === 0n
            ? callAndProof.call
            : [
                {
                  contractAddress: STRK_TOKEN_ADDRESS,
                  entrypoint: "approve",
                  calldata: [this.authorizedPool, feeAmount.toString(), "0"],
                },
                callAndProof.call,
              ];
        const estimate = await this.account.estimateInvokeFee(calls, {
          tip: 0n,
          proofFacts,
          proof,
        });
        if (estimate.overall_fee > this.maxNetworkFee) {
          throw new Error("network fee exceeds local limit");
        }
        resourceBounds = estimate.resourceBounds;
        reservationAmount = amount + feeAmount + estimate.overall_fee;
      }
      const reservation = this.spendBudget.reserve(
        invoiceId,
        reservationAmount,
      );
      if (reservation === "limit_exceeded") {
        throw new Error("daily payment limit exceeded");
      }
      if (reservation === "already_reserved") {
        throw new Error("payment budget requires reconciliation");
      }
    } catch (error) {
      this.journal.release(invoiceId);
      throw error;
    }

    let transactionHash: string;
    try {
      if (this.paymaster && paymasterExecute) {
        transactionHash = (
          await this.paymaster.executeTransaction(paymasterExecute)
        ).transactionHash;
        if (!/^0x[0-9a-f]+$/i.test(transactionHash)) {
          throw new Error("paymaster returned an invalid transaction hash");
        }
      } else {
        if (!calls || !resourceBounds) {
          throw new Error("direct payment preparation is incomplete");
        }
        const submitted = await this.account.execute(calls, {
          tip: 0n,
          resourceBounds,
          proofFacts,
          proof,
        });
        transactionHash = submitted.transaction_hash;
      }
    } catch (error) {
      this.journal.markUnknown(invoiceId);
      throw new Error("payment submission outcome is unknown", { cause: error });
    }
    this.journal.markSubmitted(invoiceId, transactionHash);
    return this.finishReceipt(requirements, transactionHash);
  }

  private async finishReceipt(
    requirements: PaymentRequirements,
    transactionHash: string,
  ): Promise<SignedReceipt> {
    const receipt = await this.provider.waitForTransaction(transactionHash, {
      retryInterval: 1_000,
      retries: this.requiredFinality === "l1" ? 14_400 : 300,
      successStates:
        this.requiredFinality === "l1"
          ? [TransactionFinalityStatus.ACCEPTED_ON_L1]
          : [
              TransactionFinalityStatus.ACCEPTED_ON_L2,
              TransactionFinalityStatus.ACCEPTED_ON_L1,
            ],
    });
    if (!receipt.isSuccess()) throw new Error("private payment reverted");

    const message = buildReceiptTypedData(requirements, transactionHash);
    const signature = stark.signatureToHexArray(
      await this.account.signMessage(message),
    );
    const invoiceId = requirements.extra.invoiceId;
    if (typeof invoiceId !== "string") throw new Error("invalid invoice ID");

    return {
      invoiceId: num.toHex(invoiceId),
      transactionHash,
      payer: this.account.address,
      signature,
    };
  }

  private assertInvoiceValidity(
    requirements: PaymentRequirements,
    expiresAt: number,
  ): void {
    const timeoutMs = requirements.maxTimeoutSeconds * 1_000;
    if (
      !Number.isSafeInteger(timeoutMs) ||
      timeoutMs < 1 ||
      expiresAt - this.now() > timeoutMs + this.allowedClockSkewMs
    ) {
      throw new Error("invoice expiry exceeds allowed clock skew");
    }
    if (expiresAt - this.now() < this.minimumInvoiceValidityMs) {
      throw new Error("invoice expires before payment can settle");
    }
  }
}

function networkChainId(network: Network): string {
  if (network === "starknet:SN_MAIN") return "0x534e5f4d41494e";
  if (network === "starknet:SN_SEPOLIA") return "0x534e5f5345504f4c4941";
  throw new Error("unsupported payment network");
}

function paymentFingerprint(requirements: PaymentRequirements): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        scheme: requirements.scheme,
        network: requirements.network,
        asset: validateAndParseAddress(requirements.asset),
        amount: requirements.amount,
        payTo: validateAndParseAddress(requirements.payTo),
        maxTimeoutSeconds: requirements.maxTimeoutSeconds,
        expiresAt: invoiceExpiresAt(requirements),
        invoiceId:
          typeof requirements.extra.invoiceId === "string"
            ? num.toHex(requirements.extra.invoiceId)
            : requirements.extra.invoiceId,
      }),
    )
    .digest("hex");
}

function parseAmount(value: string): bigint {
  if (!/^\d+$/.test(value)) throw new Error("payment amount must be an integer");
  const amount = BigInt(value);
  if (amount <= 0n || amount >= 2n ** 128n) {
    throw new Error("payment amount must be a positive u128");
  }
  return amount;
}
