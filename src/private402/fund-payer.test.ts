import assert from "node:assert/strict";
import test from "node:test";

import type { PrivateTransfersInterface } from "@starkware-libs/starknet-privacy-sdk";
import type { Account, RpcProvider } from "starknet";

import { Strk20PayerFunding } from "./fund-payer.js";
import type { PayerAttempt, PayerJournal } from "./payer-journal.js";

function fixture(options: {
  afterProofBlock?: number;
  beforeSubmitBlock?: number;
  currentBalance?: bigint;
  executeError?: Error;
  generatedPool?: string;
  historicalBalance?: bigint;
  networkFee?: bigint;
  poolFee?: bigint;
  providerChainId?: string;
  proofValidityBlocks?: bigint;
} = {}) {
  const calls: Array<[string, unknown]> = [];
  const attempts = new Map<string, PayerAttempt>();
  const fingerprints = new Map<string, string>();
  const journal: PayerJournal = {
    begin: (id, fingerprint) => {
      const attempt = attempts.get(id);
      if (attempt) {
        if (fingerprints.get(id) !== fingerprint) {
          throw new Error("funding requirements changed");
        }
        return attempt;
      }
      attempts.set(id, { state: "in_progress" });
      fingerprints.set(id, fingerprint);
      return { state: "new" };
    },
    inspect: (id) => {
      const attempt = attempts.get(id);
      return attempt?.state === "new" ? null : attempt ?? null;
    },
    release: (id) => {
      attempts.delete(id);
      fingerprints.delete(id);
    },
    markUnknown: (id) => attempts.set(id, { state: "unknown" }),
    markSubmitted: (id, transactionHash) =>
      attempts.set(id, { state: "submitted", transactionHash }),
    reconcileSubmitted: () => undefined,
    reconcileNotBroadcast: () => undefined,
    reconcileReverted: () => undefined,
  };
  const tokenBuilder = {
    deposit: (input: unknown) => {
      calls.push(["deposit", input]);
      return tokenBuilder;
    },
  };
  const builder = {
    surplusTo: (recipient: unknown) => {
      calls.push(["surplusTo", recipient]);
      return builder;
    },
    with: (token: unknown, callback: (value: typeof tokenBuilder) => void) => {
      calls.push(["with", token]);
      callback(tokenBuilder);
      return builder;
    },
    createProofInvocation: async (details: unknown) => {
      calls.push(["createProofInvocation", details]);
      return { invocation: {}, registry: {}, warnings: [] };
    },
  };
  const transfers = {
    build: (details: unknown) => {
      calls.push(["build", details]);
      return builder;
    },
    executeWithInvocation: async (_invocation: unknown, block: unknown) => {
      calls.push(["executeWithInvocation", block]);
      return {
        callAndProof: {
          call: {
            contractAddress: options.generatedPool ?? "0x999",
            entrypoint: "apply_actions",
            calldata: [],
          },
          proof: { data: "proof", proofFacts: ["0x1"] },
        },
        registry: {},
        warnings: [],
      };
    },
  } as unknown as PrivateTransfersInterface;
  const account = {
    address: "0x111",
    provider: { getChainId: async () => "0x534e5f5345504f4c4941" },
    estimateInvokeFee: async (_calls: unknown, details: unknown) => {
      calls.push(["estimate", details]);
      return {
        overall_fee: options.networkFee ?? 3n,
        resourceBounds: { l1_gas: {} },
      };
    },
    execute: async (submittedCalls: unknown, details: unknown) => {
      calls.push(["executeCalls", submittedCalls]);
      calls.push(["execute", details]);
      if (options.executeError) throw options.executeError;
      return { transaction_hash: "0x444" };
    },
  } as unknown as Pick<
    Account,
    "address" | "estimateInvokeFee" | "execute" | "provider"
  >;
  let blockReads = 0;
  const provider = {
    getBlockNumber: async () => {
      const read = blockReads++;
      if (read === 0) return 100;
      if (read === 1) return options.afterProofBlock ?? 100;
      return options.beforeSubmitBlock ?? options.afterProofBlock ?? 100;
    },
    getChainId: async () =>
      options.providerChainId ?? "0x534e5f5345504f4c4941",
    callContract: async (
      call: { entrypoint: string },
      blockIdentifier?: number | string,
    ) => {
      calls.push(["callContract", { call, blockIdentifier }]);
      if (call.entrypoint === "get_fee_amount") {
        return [(options.poolFee ?? 7n).toString()];
      }
      if (call.entrypoint === "get_proof_validity_blocks") {
        return [(options.proofValidityBlocks ?? 450n).toString()];
      }
      const balance =
        blockIdentifier === 90
          ? options.historicalBalance ?? 100n
          : options.currentBalance ?? 1_000n;
      return [balance.toString(), "0"];
    },
    waitForTransaction: async (hash: unknown, details: unknown) => {
      calls.push(["waitForTransaction", { hash, details }]);
      return { isSuccess: () => true };
    },
  } as unknown as Pick<
    RpcProvider,
    "callContract" | "getBlockNumber" | "getChainId" | "waitForTransaction"
  >;

  return {
    attempts,
    calls,
    funding: new Strk20PayerFunding(
      transfers,
      account,
      provider,
      "0x999",
      "0x534e5f5345504f4c4941",
      "initial-sepolia-funding",
      50n,
      10n,
      20n,
      10,
      journal,
    ),
  };
}

test("proves, caps, submits, and waits for one private STRK deposit", async () => {
  const { calls, funding } = fixture();
  assert.equal(await funding.fund(), "0x444");
  assert.deepEqual(calls.find(([name]) => name === "deposit")?.[1], {
    amount: 50n,
  });
  assert.deepEqual(
    calls.find(([name]) => name === "createProofInvocation")?.[1],
    { provingBlockId: 90 },
  );
  const submittedCalls = calls.find(([name]) => name === "executeCalls")?.[1] as Array<{
    entrypoint: string;
    calldata: string[];
  }>;
  assert.equal(submittedCalls[0]?.entrypoint, "approve");
  assert.deepEqual(submittedCalls[0]?.calldata, [
    "0x0000000000000000000000000000000000000000000000000000000000000999",
    "0x39",
    "0x0",
  ]);
  assert.equal(submittedCalls[1]?.entrypoint, "apply_actions");
  const execution = calls.find(([name]) => name === "execute")?.[1] as {
    proof: string;
    proofFacts: string[];
    resourceBounds: unknown;
  };
  assert.equal(execution.proof, "proof");
  assert.deepEqual(execution.proofFacts, ["0x1"]);
  assert.ok(execution.resourceBounds);
  const wait = calls.find(([name]) => name === "waitForTransaction")?.[1] as {
    hash: string;
    details: { retries: number; successStates: string[] };
  };
  assert.equal(wait.hash, "0x444");
  assert.equal(wait.details.retries, 300);
  assert.deepEqual(wait.details.successStates, [
    "ACCEPTED_ON_L2",
    "ACCEPTED_ON_L1",
  ]);
});

test("resumes a submitted deposit without another proof or transaction", async () => {
  const { calls, funding } = fixture();
  assert.equal(await funding.fund(), "0x444");
  assert.equal(await funding.fund(), "0x444");
  assert.equal(calls.filter(([name]) => name === "executeCalls").length, 1);
  assert.equal(
    calls.filter(([name]) => name === "createProofInvocation").length,
    1,
  );
  assert.equal(calls.filter(([name]) => name === "waitForTransaction").length, 2);
});

test("rejects unsafe funding evidence before submission", async () => {
  for (const [options, error] of [
    [{ historicalBalance: 49n }, /not old enough or is insufficient/],
    [{ poolFee: 11n }, /pool fee exceeds/],
    [{ generatedPool: "0x998" }, /unauthorized pool call/],
    [{ networkFee: 21n }, /network fee exceeds/],
    [{ currentBalance: 59n }, /cannot cover funding and fees/],
    [{ providerChainId: "0x534e5f4d41494e" }, /chain mismatch/],
    [
      { afterProofBlock: 531, proofValidityBlocks: 450n },
      /proof validity window is too short/,
    ],
    [
      { beforeSubmitBlock: 531, proofValidityBlocks: 450n },
      /proof validity window is too short/,
    ],
  ] as const) {
    const { calls, funding } = fixture(options);
    await assert.rejects(() => funding.fund(), error);
    assert.equal(calls.some(([name]) => name === "executeCalls"), false);
  }
});

test("blocks a retry after an unknown submission outcome", async () => {
  const { attempts, calls, funding } = fixture({
    executeError: new Error("RPC timed out"),
  });
  await assert.rejects(() => funding.fund(), /outcome is unknown/);
  assert.equal([...attempts.values()][0]?.state, "unknown");
  await assert.rejects(() => funding.fund(), /requires reconciliation/);
  assert.equal(calls.filter(([name]) => name === "executeCalls").length, 1);
});
