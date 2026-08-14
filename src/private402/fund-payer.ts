import type {
  PrivateTransfersInterface,
  ProofInvocationResult,
} from "@starkware-libs/starknet-privacy-sdk";
import { createHash } from "node:crypto";
import type { Account, RpcProvider } from "starknet";
import {
  TransactionFinalityStatus,
  uint256,
  validateAndParseAddress,
} from "starknet";

import { STRK_TOKEN_ADDRESS } from "./agent-payer.js";
import type { PayerJournal } from "./payer-journal.js";

type FundingAccount = Pick<
  Account,
  "address" | "estimateInvokeFee" | "execute" | "provider"
>;
type FundingProvider = Pick<
  RpcProvider,
  "callContract" | "getBlockNumber" | "getChainId" | "waitForTransaction"
>;

export class Strk20PayerFunding {
  private readonly poolAddress: string;
  private readonly accountAddress: string;
  private readonly fundingKey: string;
  private readonly fingerprint: string;

  constructor(
    private readonly transfers: PrivateTransfersInterface,
    private readonly account: FundingAccount,
    private readonly provider: FundingProvider,
    poolAddress: string,
    private readonly expectedChainId: string,
    fundingId: string,
    private readonly amount: bigint,
    private readonly maxPoolFee: bigint,
    private readonly maxNetworkFee: bigint,
    private readonly minimumProofValidityBlocks: number,
    private readonly journal: PayerJournal,
  ) {
    this.poolAddress = validateAndParseAddress(poolAddress);
    this.accountAddress = validateAndParseAddress(account.address);
    if (!/^[A-Za-z0-9._-]{1,64}$/.test(fundingId)) {
      throw new Error("funding ID must use 1 to 64 safe characters");
    }
    for (const [name, value] of [
      ["funding amount", amount],
      ["maximum pool fee", maxPoolFee],
      ["maximum network fee", maxNetworkFee],
    ] as const) {
      if (value < 0n || value >= 2n ** 128n) {
        throw new Error(`${name} must fit in u128`);
      }
    }
    if (amount === 0n) throw new Error("funding amount must be positive");
    if (
      !Number.isSafeInteger(minimumProofValidityBlocks) ||
      minimumProofValidityBlocks < 1
    ) {
      throw new Error("minimum proof validity must be a positive safe integer");
    }
    this.fundingKey = `fund:${expectedChainId}:${fundingId}`;
    this.fingerprint = createHash("sha256")
      .update(
        JSON.stringify({
          account: this.accountAddress,
          pool: this.poolAddress,
          token: STRK_TOKEN_ADDRESS,
          amount: amount.toString(),
          maxPoolFee: maxPoolFee.toString(),
          maxNetworkFee: maxNetworkFee.toString(),
        }),
      )
      .digest("hex");
  }

  async fund(): Promise<string> {
    const attempt = this.journal.begin(this.fundingKey, this.fingerprint);
    if (attempt.state === "in_progress") {
      throw new Error("private funding is already in progress");
    }
    if (attempt.state === "unknown") {
      throw new Error("private funding outcome requires reconciliation");
    }
    if (attempt.state === "submitted") {
      await this.waitForSuccess(attempt.transactionHash);
      return attempt.transactionHash;
    }

    let calls: Parameters<FundingAccount["execute"]>[0];
    let resourceBounds: Awaited<
      ReturnType<FundingAccount["estimateInvokeFee"]>
    >["resourceBounds"];
    let proof: string;
    let proofFacts: string[];
    try {
      const [providerChainId, accountChainId] = await Promise.all([
        this.provider.getChainId(),
        this.account.provider.getChainId(),
      ]);
      if (
        providerChainId !== this.expectedChainId ||
        accountChainId !== this.expectedChainId
      ) {
        throw new Error("funding chain mismatch");
      }

      const latestBlock = await this.provider.getBlockNumber();
      if (latestBlock < 10) throw new Error("chain is too young for proving");
      const provingBlockId = latestBlock - 10;
      const historicalBalance = await this.strkBalance(provingBlockId);
      if (historicalBalance < this.amount) {
        throw new Error("STRK balance is not old enough or is insufficient");
      }

      const feeResult = await this.provider.callContract({
        contractAddress: this.poolAddress,
        entrypoint: "get_fee_amount",
      });
      if (feeResult[0] === undefined) throw new Error("pool fee query failed");
      const poolFee = BigInt(feeResult[0]);
      if (poolFee < 0n || poolFee > this.maxPoolFee) {
        throw new Error("pool fee exceeds local limit");
      }
      const approvalAmount = this.amount + poolFee;
      if (approvalAmount >= 2n ** 256n) {
        throw new Error("funding approval exceeds u256");
      }

      const builder = this.transfers
        .build({
          autoRegister: true,
          autoSetup: true,
          autoDiscover: { notes: "refresh", channels: "refresh" },
        })
        .surplusTo(this.accountAddress)
        .with(STRK_TOKEN_ADDRESS, (tokenBuilder) => {
          tokenBuilder.deposit({ amount: this.amount });
        });
      const invocation: ProofInvocationResult =
        await builder.createProofInvocation({ provingBlockId });
      const { callAndProof } = await this.transfers.executeWithInvocation(
        invocation,
        provingBlockId,
      );
      if (!callAndProof.proof.data || !callAndProof.proof.proofFacts?.length) {
        throw new Error("prover returned incomplete proof data");
      }
      if (
        validateAndParseAddress(callAndProof.call.contractAddress) !==
          this.poolAddress ||
        callAndProof.call.entrypoint !== "apply_actions"
      ) {
        throw new Error("prover returned an unauthorized pool call");
      }
      const validityResult = await this.provider.callContract({
        contractAddress: this.poolAddress,
        entrypoint: "get_proof_validity_blocks",
      });
      if (validityResult[0] === undefined) {
        throw new Error("proof validity query failed");
      }
      const proofValidityBlocks = BigInt(validityResult[0]);
      if (proofValidityBlocks < 1n || proofValidityBlocks >= 2n ** 64n) {
        throw new Error("proof validity response is invalid");
      }
      await this.assertProofValidity(provingBlockId, proofValidityBlocks);
      proof = callAndProof.proof.data;
      proofFacts = callAndProof.proof.proofFacts;
      const approval = uint256.bnToUint256(approvalAmount);
      calls = [
        {
          contractAddress: STRK_TOKEN_ADDRESS,
          entrypoint: "approve",
          calldata: [
            this.poolAddress,
            approval.low.toString(),
            approval.high.toString(),
          ],
        },
        callAndProof.call,
      ];
      const estimate = await this.account.estimateInvokeFee(calls, {
        tip: 0n,
        proofFacts,
        proof,
      });
      if (
        estimate.overall_fee < 0n ||
        estimate.overall_fee > this.maxNetworkFee
      ) {
        throw new Error("network fee exceeds local limit");
      }
      const currentBalance = await this.strkBalance("latest");
      if (currentBalance < approvalAmount + estimate.overall_fee) {
        throw new Error("current STRK balance cannot cover funding and fees");
      }
      await this.assertProofValidity(provingBlockId, proofValidityBlocks);
      resourceBounds = estimate.resourceBounds;
    } catch (error) {
      this.journal.release(this.fundingKey);
      throw error;
    }

    let transactionHash: string;
    try {
      const submitted = await this.account.execute(calls, {
        tip: 0n,
        resourceBounds,
        proofFacts,
        proof,
      });
      transactionHash = submitted.transaction_hash;
    } catch (error) {
      this.journal.markUnknown(this.fundingKey);
      throw new Error("private funding outcome is unknown", { cause: error });
    }
    this.journal.markSubmitted(this.fundingKey, transactionHash);
    await this.waitForSuccess(transactionHash);
    return transactionHash;
  }

  private async strkBalance(blockIdentifier: number | "latest"): Promise<bigint> {
    const result = await this.provider.callContract(
      {
        contractAddress: STRK_TOKEN_ADDRESS,
        entrypoint: "balanceOf",
        calldata: [this.accountAddress],
      },
      blockIdentifier,
    );
    if (result[0] === undefined || result[1] === undefined) {
      throw new Error("STRK balance query failed");
    }
    const low = BigInt(result[0]);
    const high = BigInt(result[1]);
    if (low < 0n || low >= 2n ** 128n || high < 0n || high >= 2n ** 128n) {
      throw new Error("STRK balance response is invalid");
    }
    return low + (high << 128n);
  }

  private async waitForSuccess(transactionHash: string): Promise<void> {
    const receipt = await this.provider.waitForTransaction(transactionHash, {
      retryInterval: 1_000,
      retries: 300,
      successStates: [
        TransactionFinalityStatus.ACCEPTED_ON_L2,
        TransactionFinalityStatus.ACCEPTED_ON_L1,
      ],
    });
    if (!receipt.isSuccess()) throw new Error("private funding reverted");
  }

  private async assertProofValidity(
    provingBlockId: number,
    proofValidityBlocks: bigint,
  ): Promise<void> {
    const currentBlock = await this.provider.getBlockNumber();
    if (
      BigInt(currentBlock) + BigInt(this.minimumProofValidityBlocks) >
      BigInt(provingBlockId) + proofValidityBlocks
    ) {
      throw new Error("proof validity window is too short for submission");
    }
  }
}
