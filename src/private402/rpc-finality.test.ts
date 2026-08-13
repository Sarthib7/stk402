import assert from "node:assert/strict";
import test from "node:test";

import type { RpcProvider } from "starknet";

import { RpcFinalityChecker } from "./rpc-finality.js";

function provider(receipt: {
  success: boolean;
  finality_status: "PRE_CONFIRMED" | "ACCEPTED_ON_L2" | "ACCEPTED_ON_L1";
}) {
  return {
    getTransactionReceipt: async (transactionHash: unknown) => {
      assert.equal(transactionHash, "0x1");
      return {
        finality_status: receipt.finality_status,
        isSuccess: () => receipt.success,
      };
    },
  } as unknown as Pick<RpcProvider, "getTransactionReceipt">;
}

test("requires a successful accepted receipt", async () => {
  const l2 = new RpcFinalityChecker(
    provider({ success: true, finality_status: "ACCEPTED_ON_L2" }),
    "l2",
  );
  const preConfirmed = new RpcFinalityChecker(
    provider({ success: true, finality_status: "PRE_CONFIRMED" }),
    "l2",
  );
  const reverted = new RpcFinalityChecker(
    provider({ success: false, finality_status: "ACCEPTED_ON_L1" }),
    "l2",
  );

  assert.equal(await l2.isFinal("0x1"), true);
  assert.equal(await preConfirmed.isFinal("0x1"), false);
  assert.equal(await reverted.isFinal("0x1"), false);
});

test("requires L1 acceptance when configured", async () => {
  const l2 = new RpcFinalityChecker(
    provider({ success: true, finality_status: "ACCEPTED_ON_L2" }),
    "l1",
  );
  const l1 = new RpcFinalityChecker(
    provider({ success: true, finality_status: "ACCEPTED_ON_L1" }),
    "l1",
  );

  assert.equal(await l2.isFinal("0x1"), false);
  assert.equal(await l1.isFinal("0x1"), true);
});
