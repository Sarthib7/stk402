import assert from "node:assert/strict";
import test from "node:test";

import {
  SetupRequirement,
  type PrivateTransfersInterface,
} from "@starkware-libs/starknet-privacy-sdk";
import type {
  Paymaster,
  PaymasterQuote,
} from "@starkware-libs/starknet-privacy-client";
import type { PaymentRequirements } from "@x402/core/types";
import type { Account, RpcProvider } from "starknet";

import { Strk20ReceiptCreator } from "./agent-payer.js";
import type { PayerAttempt, PayerJournal } from "./payer-journal.js";
import type { SpendBudget } from "./spend-budget.js";

const strk =
  "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";
const requirements: PaymentRequirements = {
  scheme: "exact-private",
  network: "starknet:SN_SEPOLIA",
  asset: strk,
  amount: "50",
  payTo: "0x222",
  maxTimeoutSeconds: 900,
  extra: { invoiceId: "0x555", expiresAt: "900000" },
};

function fixture(options: {
  setup?: SetupRequirement;
  quote?: PaymasterQuote;
  executeError?: Error;
} = {}) {
  const calls: Array<[string, unknown]> = [];
  const attempts = new Map<string, PayerAttempt>();
  const journal: PayerJournal = {
    begin: (invoiceId) => {
      const attempt = attempts.get(invoiceId);
      if (attempt) return attempt;
      attempts.set(invoiceId, { state: "in_progress" });
      return { state: "new" };
    },
    inspect: (invoiceId) => {
      const attempt = attempts.get(invoiceId);
      return attempt?.state === "new" ? null : attempt ?? null;
    },
    release: (invoiceId) => {
      attempts.delete(invoiceId);
    },
    markUnknown: (invoiceId) => {
      attempts.set(invoiceId, { state: "unknown" });
    },
    markSubmitted: (invoiceId, transactionHash) => {
      attempts.set(invoiceId, { state: "submitted", transactionHash });
    },
    reconcileSubmitted: () => undefined,
    reconcileNotBroadcast: () => undefined,
    reconcileReverted: () => undefined,
  };
  const budget: SpendBudget = {
    reserve: (invoiceId, amount) => {
      calls.push(["reserve", { invoiceId, amount }]);
      return "reserved";
    },
  };
  const tokenBuilder = {
    transfer: (value: unknown) => {
      calls.push(["transfer", value]);
      return tokenBuilder;
    },
    withdraw: (value: unknown) => {
      calls.push(["withdraw", value]);
      return tokenBuilder;
    },
  };
  const builder = {
    surplusTo: () => builder,
    with: (_token: unknown, callback: (value: typeof tokenBuilder) => void) => {
      callback(tokenBuilder);
      return builder;
    },
    createProofInvocation: async () => ({ invocation: {}, registry: {}, warnings: [] }),
  };
  const transfers = {
    discoverRequirement: async (recipient: unknown, token: unknown) => {
      calls.push(["discoverRequirement", { recipient, token }]);
      return options.setup ?? SetupRequirement.Ready;
    },
    build: (value: unknown) => {
      calls.push(["build", value]);
      return builder;
    },
    executeWithInvocation: async () => {
      calls.push(["prove", null]);
      return {
        callAndProof: {
          call: {
            contractAddress: "0x999",
            entrypoint: "apply_actions",
            calldata: ["0x1"],
          },
          proof: { data: "proof", proofFacts: ["0xabc"] },
        },
        registry: {},
        warnings: [],
      };
    },
  } as unknown as PrivateTransfersInterface;
  const account = {
    address: "0x111",
    provider: { getChainId: async () => "0x534e5f5345504f4c4941" },
    signMessage: async () => ["0x1", "0x2"],
    estimateInvokeFee: async () => {
      throw new Error("direct fee estimate must not run");
    },
    execute: async () => {
      throw new Error("direct account execute must not run");
    },
  } as unknown as Pick<
    Account,
    "address" | "provider" | "signMessage" | "estimateInvokeFee" | "execute"
  >;
  const provider = {
    callContract: async () => ["7"],
    getBlockNumber: async () => 100,
    getChainId: async () => "0x534e5f5345504f4c4941",
    verifyMessageInStarknet: async () => true,
    waitForTransaction: async () => ({ isSuccess: () => true }),
  } as unknown as Pick<
    RpcProvider,
    | "callContract"
    | "getBlockNumber"
    | "getChainId"
    | "verifyMessageInStarknet"
    | "waitForTransaction"
  >;
  const paymaster: Paymaster = {
    buildTransaction: async (value) => {
      calls.push(["quote", value]);
      return (
        options.quote ?? {
          feeAction: {
            type: "withdraw",
            token: strk,
            recipient: "0x777",
            amount: "8",
          },
        }
      );
    },
    executeTransaction: async (value) => {
      calls.push(["paymasterExecute", value]);
      if (options.executeError) throw options.executeError;
      return { transactionHash: "0x444" };
    },
  };
  return {
    calls,
    attempts,
    creator: new Strk20ReceiptCreator(
      transfers,
      account,
      provider,
      "0x999",
      "starknet:SN_SEPOLIA",
      strk,
      "0x222",
      100n,
      10n,
      10n,
      "l2",
      journal,
      budget,
      300_000,
      30_000,
      () => 0,
      paymaster,
      20n,
    ),
  };
}

test("requires a ready channel and submits through the paymaster", async () => {
  const { calls, creator } = fixture();
  const receipt = await creator.createReceipt(requirements);

  assert.equal(receipt.transactionHash, "0x444");
  assert.deepEqual(calls.find(([name]) => name === "build")?.[1], {
    autoRegister: false,
    autoSetup: false,
    autoDiscover: { notes: "refresh", channels: "refresh" },
    autoSelectNotes: "naive",
  });
  assert.deepEqual(calls.find(([name]) => name === "withdraw")?.[1], {
    recipient:
      "0x0000000000000000000000000000000000000000000000000000000000000777",
    amount: 8n,
  });
  assert.deepEqual(calls.find(([name]) => name === "reserve")?.[1], {
    invoiceId: "0x555",
    amount: 58n,
  });
  assert.deepEqual(calls.find(([name]) => name === "quote")?.[1], {
    kind: "applyAction",
    poolAddress:
      "0x0000000000000000000000000000000000000000000000000000000000000999",
  });
  const submitted = calls.find(([name]) => name === "paymasterExecute")?.[1] as {
    kind: string;
    proof: string;
    proofFacts: string[];
  };
  assert.equal(submitted.kind, "applyAction");
  assert.equal(submitted.proof, "proof");
  assert.deepEqual(submitted.proofFacts, ["0xabc"]);
});

test("rejects every incomplete channel before quote or proof", async (context) => {
  for (const setup of [
    SetupRequirement.Register,
    SetupRequirement.SetupChannel,
    SetupRequirement.SetupToken,
  ]) {
    await context.test(String(setup), async () => {
      const { calls, creator, attempts } = fixture({ setup });
      await assert.rejects(
        creator.createReceipt(requirements),
        /channel is not ready/,
      );
      assert.equal(calls.some(([name]) => name === "quote"), false);
      assert.equal(calls.some(([name]) => name === "prove"), false);
      assert.equal(attempts.size, 0);
    });
  }
});

test("rejects unsafe paymaster quotes before proof or submission", async (context) => {
  const quotes: Array<[string, PaymasterQuote]> = [
    [
      "wrong token",
      {
        feeAction: {
          type: "withdraw",
          token: "0x333",
          recipient: "0x777",
          amount: "8",
        },
      },
    ],
    [
      "zero fee",
      {
        feeAction: {
          type: "withdraw",
          token: strk,
          recipient: "0x777",
          amount: "0",
        },
      },
    ],
    [
      "fee cap",
      {
        feeAction: {
          type: "withdraw",
          token: strk,
          recipient: "0x777",
          amount: "21",
        },
      },
    ],
    [
      "unexpected typed data",
      {
        feeAction: {
          type: "withdraw",
          token: strk,
          recipient: "0x777",
          amount: "8",
        },
        typedData: {} as never,
      },
    ],
  ];
  for (const [name, quote] of quotes) {
    await context.test(name, async () => {
      const { calls, creator, attempts } = fixture({ quote });
      await assert.rejects(creator.createReceipt(requirements));
      assert.equal(calls.some(([call]) => call === "prove"), false);
      assert.equal(calls.some(([call]) => call === "paymasterExecute"), false);
      assert.equal(attempts.size, 0);
    });
  }
});

test("blocks retry after an uncertain paymaster submission", async () => {
  const { calls, creator, attempts } = fixture({
    executeError: new Error("timeout"),
  });
  await assert.rejects(
    creator.createReceipt(requirements),
    /submission outcome is unknown/,
  );
  assert.deepEqual(attempts.get("0x555"), { state: "unknown" });
  await assert.rejects(
    creator.createReceipt(requirements),
    /requires reconciliation/,
  );
  assert.equal(calls.filter(([name]) => name === "quote").length, 1);
  assert.equal(calls.filter(([name]) => name === "paymasterExecute").length, 1);
});
