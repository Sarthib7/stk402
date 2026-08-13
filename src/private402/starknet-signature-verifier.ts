import type { RpcProvider, Signature, TypedData } from "starknet";

import type { ReceiptSignatureVerifier } from "./signed-receipt.js";

type MessageVerifier = Pick<RpcProvider, "verifyMessageInStarknet">;

export class StarknetReceiptSignatureVerifier
  implements ReceiptSignatureVerifier
{
  constructor(private readonly provider: MessageVerifier) {}

  verify(
    message: TypedData,
    signature: Signature,
    payer: string,
  ): Promise<boolean> {
    return this.provider.verifyMessageInStarknet(message, signature, payer);
  }
}
