import assert from "node:assert/strict";
import test from "node:test";

import type { RpcProvider, TypedData } from "starknet";

import { StarknetReceiptSignatureVerifier } from "./starknet-signature-verifier.js";

test("verifies the receipt through the payer account contract", async () => {
  const message = { domain: {}, types: {}, primaryType: "Receipt", message: {} };
  let receivedPayer: unknown;
  const provider = {
    verifyMessageInStarknet: async (
      receivedMessage: unknown,
      _signature: unknown,
      payer: unknown,
    ) => {
      assert.equal(receivedMessage, message);
      receivedPayer = payer;
      return true;
    },
  } as unknown as Pick<RpcProvider, "verifyMessageInStarknet">;
  const verifier = new StarknetReceiptSignatureVerifier(provider);

  assert.equal(
    await verifier.verify(message as TypedData, ["0x1", "0x2"], "0x123"),
    true,
  );
  assert.equal(receivedPayer, "0x123");
});
