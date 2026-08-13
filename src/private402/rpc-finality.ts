import type { RpcProvider } from "starknet";
import { TransactionFinalityStatus } from "starknet";

type ReceiptProvider = Pick<RpcProvider, "getTransactionReceipt">;

export type RequiredFinality = "l2" | "l1";

export class RpcFinalityChecker {
  constructor(
    private readonly provider: ReceiptProvider,
    private readonly requiredFinality: RequiredFinality,
  ) {}

  async isFinal(transactionHash: string): Promise<boolean> {
    const receipt = await this.provider.getTransactionReceipt(transactionHash);
    if (!receipt.isSuccess()) return false;

    if (this.requiredFinality === "l1") {
      return (
        receipt.finality_status === TransactionFinalityStatus.ACCEPTED_ON_L1
      );
    }

    return (
      receipt.finality_status === TransactionFinalityStatus.ACCEPTED_ON_L2 ||
      receipt.finality_status === TransactionFinalityStatus.ACCEPTED_ON_L1
    );
  }
}
