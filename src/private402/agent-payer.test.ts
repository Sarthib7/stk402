import assert from "node:assert/strict";
import test from "node:test";

import type { PrivateTransfersInterface } from "@starkware-libs/starknet-privacy-sdk";
import type { PaymentRequirements } from "@x402/core/types";
import type { Account, RpcProvider } from "starknet";

import { Strk20ReceiptCreator } from "./agent-payer.js";
import type { PayerAttempt, PayerJournal } from "./payer-journal.js";
import type { SpendBudget, SpendReservation } from "./spend-budget.js";

const requirements: PaymentRequirements = {
  scheme: "exact-private",
  network: "starknet:SN_SEPOLIA",
  asset: "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d",
  amount: "50",
  payTo: "0x222",
  maxTimeoutSeconds: 900,
  extra: { invoiceId: "0x555", expiresAt: "900000" },
};

function fixture(
  finality: "l2" | "l1" = "l2",
  feeAmount = 7n,
  options: {
    afterProof?: () => void;
    executeError?: Error;
    generatedEntrypoint?: string;
    generatedPool?: string;
    networkFee?: bigint;
    proofData?: string;
    proofFacts?: string[];
    providerChainId?: string;
    spendReservation?: SpendReservation;
    now?: () => number;
  } = {},
) {
  const calls: Array<[string, unknown]> = [];
  const attempts = new Map<string, PayerAttempt>();
  const fingerprints = new Map<string, string>();
  const journal: PayerJournal = {
    begin: (invoiceId, fingerprint) => {
      const attempt = attempts.get(invoiceId);
      if (attempt) {
        if (fingerprints.get(invoiceId) !== fingerprint) {
          throw new Error("invoice requirements changed");
        }
        return attempt;
      }
      attempts.set(invoiceId, { state: "in_progress" });
      fingerprints.set(invoiceId, fingerprint);
      return { state: "new" };
    },
    inspect: (invoiceId) => {
      const attempt = attempts.get(invoiceId);
      return attempt?.state === "new" ? null : attempt ?? null;
    },
    release: (invoiceId) => {
      attempts.delete(invoiceId);
      fingerprints.delete(invoiceId);
    },
    markUnknown: (invoiceId) => {
      attempts.set(invoiceId, { state: "unknown" });
    },
    markSubmitted: (invoiceId, transactionHash) => {
      attempts.set(invoiceId, { state: "submitted", transactionHash });
    },
    reconcileSubmitted: (invoiceId, _fingerprint, transactionHash) => {
      attempts.set(invoiceId, { state: "submitted", transactionHash });
    },
    reconcileNotBroadcast: (invoiceId) => {
      attempts.delete(invoiceId);
    },
    reconcileReverted: (invoiceId) => {
      attempts.delete(invoiceId);
    },
  };
  const spendBudget: SpendBudget = {
    reserve: (invoiceId, amount) => {
      calls.push(["reserveSpend", { invoiceId, amount }]);
      return options.spendReservation ?? "reserved";
    },
  };
  const tokenBuilder = {
    transfer: (output: unknown) => {
      calls.push(["transfer", output]);
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
    createProofInvocation: async (options: unknown) => {
      calls.push(["createProofInvocation", options]);
      return { invocation: {}, registry: {}, warnings: [] };
    },
  };
  const transfers = {
    build: (options: unknown) => {
      calls.push(["build", options]);
      return builder;
    },
    executeWithInvocation: async (_invocation: unknown, block: unknown) => {
      calls.push(["executeWithInvocation", block]);
      options.afterProof?.();
      return {
        callAndProof: {
          call: {
            contractAddress: options.generatedPool ?? "0x999",
            entrypoint: options.generatedEntrypoint ?? "apply_actions",
            calldata: [],
          },
          proof: {
            data: options.proofData ?? "proof",
            proofFacts: options.proofFacts ?? ["0x1"],
          },
        },
        registry: {},
        warnings: [],
      };
    },
  } as unknown as PrivateTransfersInterface;
  const account = {
    address: "0x111",
    provider: { getChainId: async () => "0x534e5f5345504f4c4941" },
    estimateInvokeFee: async (_call: unknown, details: unknown) => {
      calls.push(["estimate", details]);
      return {
        overall_fee: options.networkFee ?? 3n,
        resourceBounds: { l1_gas: {} },
      };
    },
    execute: async (call: unknown, details: unknown) => {
      calls.push(["executeCalls", call]);
      calls.push(["execute", details]);
      if (options.executeError) throw options.executeError;
      return { transaction_hash: "0x444" };
    },
    signMessage: async (message: unknown) => {
      calls.push(["signMessage", message]);
      return ["0x1", "0x2"];
    },
  } as unknown as Pick<
    Account,
    "address" | "estimateInvokeFee" | "execute" | "provider" | "signMessage"
  >;
  const provider = {
    callContract: async () => [feeAmount.toString()],
    getBlockNumber: async () => 100,
    getChainId: async () =>
      options.providerChainId ?? "0x534e5f5345504f4c4941",
    verifyMessageInStarknet: async () => true,
    waitForTransaction: async (hash: unknown, options: unknown) => {
      calls.push(["waitForTransaction", { hash, options }]);
      return { isSuccess: () => true };
    },
  } as unknown as Pick<
    RpcProvider,
    | "callContract"
    | "getBlockNumber"
    | "getChainId"
    | "verifyMessageInStarknet"
    | "waitForTransaction"
  >;

  return {
    calls,
    attempts,
    creator: new Strk20ReceiptCreator(
      transfers,
      account,
      provider,
      "0x999",
      "starknet:SN_SEPOLIA",
      "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d",
      "0x222",
      100n,
      10n,
      10n,
      finality,
      journal,
      spendBudget,
      300_000,
      30_000,
      options.now ?? (() => 0),
    ),
  };
}

test("proves, submits, waits, and signs one private payment", async () => {
  const { calls, creator } = fixture();
  const receipt = await creator.createReceipt(requirements);

  assert.equal(receipt.invoiceId, "0x555");
  assert.equal(receipt.transactionHash, "0x444");
  assert.equal(receipt.payer, "0x111");
  assert.deepEqual(receipt.signature, ["0x1", "0x2"]);
  assert.deepEqual(
    calls.find(([name]) => name === "transfer")?.[1],
    { recipient: "0x0000000000000000000000000000000000000000000000000000000000000222", amount: 50n },
  );
  assert.deepEqual(
    calls.find(([name]) => name === "createProofInvocation")?.[1],
    { provingBlockId: 90 },
  );
  const wait = calls.find(([name]) => name === "waitForTransaction")?.[1] as {
    hash: string;
    options: { retries: number; successStates: string[] };
  };
  assert.equal(wait.hash, "0x444");
  assert.deepEqual(wait.options.successStates, ["ACCEPTED_ON_L2", "ACCEPTED_ON_L1"]);
  assert.equal(wait.options.retries, 300);
  const executeCalls = calls.find(([name]) => name === "executeCalls")?.[1] as Array<{
    contractAddress: string;
    entrypoint: string;
    calldata: string[];
  }>;
  assert.equal(executeCalls[0]?.entrypoint, "approve");
  assert.deepEqual(executeCalls[0]?.calldata, [
    "0x0000000000000000000000000000000000000000000000000000000000000999",
    "7",
    "0",
  ]);
  assert.equal(executeCalls[1]?.entrypoint, "apply_actions");
  const execution = calls.find(([name]) => name === "execute")?.[1] as {
    proof: string;
    proofFacts: string[];
    resourceBounds: unknown;
  };
  assert.equal(execution.proof, "proof");
  assert.deepEqual(execution.proofFacts, ["0x1"]);
  assert.ok(execution.resourceBounds);
  assert.deepEqual(
    calls.find(([name]) => name === "reserveSpend")?.[1],
    { invoiceId: "0x555", amount: 60n },
  );
  const signedMessages = calls
    .filter(([name]) => name === "signMessage")
    .map(([, message]) => message) as Array<{ message: { transaction_hash: string } }>;
  assert.equal(signedMessages[0]?.message.transaction_hash, "0x0");
  assert.equal(signedMessages[1]?.message.transaction_hash, "0x444");
});

test("omits approval when the pool fee is zero", async () => {
  const { calls, creator } = fixture("l2", 0n);
  await creator.createReceipt(requirements);

  const executeCalls = calls.find(([name]) => name === "executeCalls")?.[1] as {
    entrypoint: string;
  };
  assert.equal(executeCalls.entrypoint, "apply_actions");
});

test("can wait for L1 without changing payment construction", async () => {
  const { calls, creator } = fixture("l1");
  await creator.createReceipt(requirements);

  const wait = calls.find(([name]) => name === "waitForTransaction")?.[1] as {
    options: { retries: number; successStates: string[] };
  };
  assert.deepEqual(wait.options.successStates, ["ACCEPTED_ON_L1"]);
  assert.equal(wait.options.retries, 14_400);
});

test("rejects malformed requirements before proving", async () => {
  const { calls, creator } = fixture();
  await assert.rejects(
    creator.createReceipt({ ...requirements, amount: "0" }),
    /positive u128/,
  );
  assert.equal(calls.length, 0);
});

test("rejects another network or an amount above the local limit", async () => {
  const first = fixture();
  await assert.rejects(
    first.creator.createReceipt({
      ...requirements,
      network: "starknet:SN_MAIN",
    }),
    /network mismatch/,
  );
  assert.equal(first.calls.length, 0);

  const second = fixture();
  await assert.rejects(
    second.creator.createReceipt({ ...requirements, amount: "101" }),
    /exceeds local limit/,
  );
  assert.equal(second.calls.length, 0);
});

test("rejects unauthorized token and recipient before journal creation", async () => {
  const token = fixture();
  await assert.rejects(
    token.creator.createReceipt({ ...requirements, asset: "0x334" }),
    /token is not authorized/,
  );
  assert.equal(token.attempts.size, 0);

  const recipient = fixture();
  await assert.rejects(
    recipient.creator.createReceipt({ ...requirements, payTo: "0x223" }),
    /recipient is not authorized/,
  );
  assert.equal(recipient.attempts.size, 0);
});

test("rejects a non-STRK spend policy during construction", () => {
  assert.throws(
    () =>
      new Strk20ReceiptCreator(
        {} as PrivateTransfersInterface,
        {} as never,
        {} as never,
        "0x999",
        "starknet:SN_SEPOLIA",
        "0x333",
        "0x222",
        100n,
        10n,
        10n,
        "l2",
        {} as PayerJournal,
        {} as SpendBudget,
        300_000,
        30_000,
        () => 0,
      ),
    /STRK payments only/,
  );
});

test("releases safe failures before submission", async () => {
  for (const [fixtureValue, message] of [
    [fixture("l2", 11n), /pool fee exceeds/],
    [fixture("l2", 7n, { networkFee: 11n }), /network fee exceeds/],
    [fixture("l2", 7n, { proofFacts: [] }), /incomplete proof/],
    [fixture("l2", 7n, { spendReservation: "limit_exceeded" }), /daily payment limit/],
    [fixture("l2", 7n, { generatedPool: "0x998" }), /unauthorized pool call/],
    [fixture("l2", 7n, { generatedEntrypoint: "transfer" }), /unauthorized pool call/],
    [
      fixture("l2", 7n, { providerChainId: "0x534e5f4d41494e" }),
      /payer chain mismatch/,
    ],
  ] as const) {
    await assert.rejects(fixtureValue.creator.createReceipt(requirements), message);
    assert.equal(fixtureValue.attempts.size, 0);
    assert.equal(
      fixtureValue.calls.some(([name]) => name === "execute"),
      false,
    );
  }
});

test("reuses a submitted transaction instead of paying twice", async () => {
  const value = fixture();
  await value.creator.createReceipt(requirements);
  await value.creator.createReceipt(requirements);

  assert.equal(
    value.calls.filter(([name]) => name === "execute").length,
    1,
  );
  assert.equal(
    value.calls.filter(([name]) => name === "waitForTransaction").length,
    2,
  );
});

test("resumes a submitted payment below the new-payment validity margin", async () => {
  let now = 0;
  const value = fixture("l2", 7n, { now: () => now });
  await value.creator.createReceipt(requirements);
  now = 600_001;
  await value.creator.createReceipt(requirements);

  assert.equal(
    value.calls.filter(([name]) => name === "execute").length,
    1,
  );
  assert.equal(
    value.calls.filter(([name]) => name === "waitForTransaction").length,
    2,
  );
});

test("rejects changed expiry when resuming a submitted invoice", async () => {
  const value = fixture();
  await value.creator.createReceipt(requirements);
  await assert.rejects(
    value.creator.createReceipt({
      ...requirements,
      extra: { ...requirements.extra, expiresAt: "900001" },
    }),
    /requirements changed/,
  );
  assert.equal(
    value.calls.filter(([name]) => name === "execute").length,
    1,
  );
});

test("blocks automatic retry after an unknown submission outcome", async () => {
  const value = fixture("l2", 7n, { executeError: new Error("RPC timeout") });
  await assert.rejects(
    value.creator.createReceipt(requirements),
    /submission outcome is unknown/,
  );
  await assert.rejects(
    value.creator.createReceipt(requirements),
    /requires reconciliation/,
  );
  assert.equal(
    value.calls.filter(([name]) => name === "execute").length,
    1,
  );
});

test("blocks a retry when spend was reserved before a crash", async () => {
  const value = fixture("l2", 7n, {
    spendReservation: "already_reserved",
  });
  await assert.rejects(
    value.creator.createReceipt(requirements),
    /budget requires reconciliation/,
  );
  assert.equal(
    value.calls.some(([name]) => name === "execute"),
    false,
  );
  assert.equal(value.attempts.size, 0);
});

test("rejects an invoice that cannot cover payment settlement", async () => {
  const value = fixture();
  await assert.rejects(
    value.creator.createReceipt({
      ...requirements,
      extra: { ...requirements.extra, expiresAt: "299999" },
    }),
    /expires before payment can settle/,
  );
  assert.equal(value.calls.length, 0);
  assert.equal(value.attempts.size, 0);
});

test("rejects an invoice outside the allowed clock skew", async () => {
  const value = fixture();
  await assert.rejects(
    value.creator.createReceipt({
      ...requirements,
      extra: { ...requirements.extra, expiresAt: "930001" },
    }),
    /allowed clock skew/,
  );
  assert.equal(value.calls.length, 0);
  assert.equal(value.attempts.size, 0);
});

test("rechecks invoice validity after proving", async () => {
  let now = 0;
  const value = fixture("l2", 7n, {
    afterProof: () => {
      now = 600_001;
    },
    now: () => now,
  });
  await assert.rejects(
    value.creator.createReceipt(requirements),
    /expires before payment can settle/,
  );
  assert.equal(
    value.calls.some(([name]) => name === "execute"),
    false,
  );
  assert.equal(value.attempts.size, 0);
});
