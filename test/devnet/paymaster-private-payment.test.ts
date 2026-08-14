import assert from "node:assert/strict";
import { test } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  SetupRequirement,
  type PrivateTransfersInterface,
} from "@starkware-libs/starknet-privacy-sdk";
import type { Paymaster } from "@starkware-libs/starknet-privacy-client";

import { Strk20ReceiptCreator } from "../../src/private402/agent-payer.js";
import type { PayerAttempt, PayerJournal } from "../../src/private402/payer-journal.js";
import type { SpendBudget } from "../../src/private402/spend-budget.js";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
process.env.PATH = `${join(projectRoot, ".tools/bin")}:${process.env.PATH ?? ""}`;

test(
  "hides payer and recipient in a later paymaster transaction on Devnet",
  { timeout: 120_000 },
  async () => {
    const { Devnet } = await import(
      "@starkware-libs/starknet-privacy-sdk/testing"
    );
    const harnessModule = "../../vendor/starknet-privacy/e2e/src/harness.js";
    const { createE2eTestEnv } = (await import(harnessModule)) as {
      createE2eTestEnv: (
        devnet: InstanceType<typeof Devnet>,
        config: { indexer: { logFile: string } },
      ) => Promise<{
        env: Awaited<ReturnType<InstanceType<typeof Devnet>["initialize"]>>;
        transfers: {
          alice: PrivateTransfersInterface;
          bob: PrivateTransfersInterface;
        };
        indexer: {
          waitForBlock(rpcUrl: string): Promise<string>;
          shutdown(): Promise<void>;
        };
      }>;
    };
    const devnet = new Devnet();
    let indexer: Awaited<ReturnType<typeof createE2eTestEnv>>["indexer"] | undefined;

    try {
      const testEnvironment = await createE2eTestEnv(devnet, {
        indexer: { logFile: ".cache/stk402-paymaster-indexer.log" },
      });
      const { env, transfers } = testEnvironment;
      indexer = testEnvironment.indexer;

      await env.alice.execute({
        contractAddress: env.strk,
        entrypoint: "approve",
        calldata: [env.privacy.address, 100n, 0n],
      });
      const registration = await transfers.bob.build().register().execute();
      await devnet.executeOutside(registration.callAndProof);
      const first = await transfers.alice
        .build({
          autoRegister: true,
          autoSetup: true,
          autoDiscover: { notes: "refresh", channels: "refresh" },
        })
        .with(env.strk)
        .deposit({ amount: 100n })
        .transfer({ recipient: env.bob.address, amount: 1n })
        .surplusTo(env.alice.address)
        .execute();
      const firstReceipt = await devnet.executeOutside(first.callAndProof);
      assert.ok("transaction_hash" in firstReceipt);
      for (let blockIndex = 0; blockIndex < 10; blockIndex++) {
        const response = await fetch(devnet.url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: blockIndex,
            method: "devnet_createBlock",
          }),
        });
        assert.equal(response.ok, true);
      }
      await indexer.waitForBlock(devnet.url);
      const aliceNotes = await transfers.alice.discoverNotes();
      const aliceTotal = (aliceNotes.notes.get(env.strk) ?? []).reduce(
        (sum, note) => sum + note.amount,
        0n,
      );
      assert.equal(aliceTotal, 99n);
      assert.equal(
        await transfers.alice.discoverRequirement(env.bob.address, env.strk),
        SetupRequirement.Ready,
      );

      const privateTransfers = new Proxy(transfers.alice, {
        get(target, property, receiver) {
          if (property === "executeWithInvocation") {
            return async (
              ...args: Parameters<typeof target.executeWithInvocation>
            ) => {
              const result = await target.executeWithInvocation(...args);
              return {
                ...result,
                callAndProof: {
                  ...result.callAndProof,
                  proof: {
                    ...result.callAndProof.proof,
                    data: result.callAndProof.proof.data ?? "AA==",
                  },
                },
              };
            };
          }
          const value = Reflect.get(target, property, receiver) as unknown;
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
      const paymaster: Paymaster = {
        buildTransaction: async () => ({
          feeAction: {
            type: "withdraw",
            token: env.strk,
            recipient: env.admin.address,
            amount: "1",
          },
        }),
        executeTransaction: async (request) => {
          assert.equal(request.kind, "applyAction");
          const receipt = await devnet.executeOutside({
            call: {
              contractAddress: request.applyActionsCall.to,
              entrypoint: "apply_actions",
              calldata: request.applyActionsCall.calldata,
            },
            proof: {
              data: request.proof,
              proofFacts: request.proofFacts,
            },
          } as never);
          assert.ok("transaction_hash" in receipt);
          return { transactionHash: receipt.transaction_hash };
        },
      };
      const attempts = new Map<string, PayerAttempt>();
      const journal: PayerJournal = {
        begin: (invoiceId) => {
          const prior = attempts.get(invoiceId);
          if (prior) return prior;
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
      const budget: SpendBudget = { reserve: () => "reserved" };
      const creator = new Strk20ReceiptCreator(
        privateTransfers,
        env.alice as unknown as ConstructorParameters<
          typeof Strk20ReceiptCreator
        >[1],
        env.node as unknown as ConstructorParameters<
          typeof Strk20ReceiptCreator
        >[2],
        env.privacy.address,
        "starknet:SN_SEPOLIA",
        env.strk,
        env.bob.address,
        10n,
        0n,
        0n,
        "l2",
        journal,
        budget,
        1,
        30_000,
        Date.now,
        paymaster,
        10n,
      );
      const result = await creator.createReceipt({
        scheme: "exact-private",
        network: "starknet:SN_SEPOLIA",
        asset: env.strk,
        amount: "2",
        payTo: env.bob.address,
        maxTimeoutSeconds: 900,
        extra: {
          invoiceId: "0x402",
          expiresAt: (Date.now() + 900_000).toString(),
        },
      });
      await indexer.waitForBlock(devnet.url);

      const firstTransaction = await env.node.getTransactionByHash(
        firstReceipt.transaction_hash,
      );
      const privateTransaction = await env.node.getTransactionByHash(
        result.transactionHash,
      );
      const firstInvoke = firstTransaction as unknown as {
        calldata: string[];
      };
      const privateInvoke = privateTransaction as unknown as {
        sender_address: string;
        calldata: string[];
      };
      assert.equal(BigInt(privateInvoke.sender_address), BigInt(env.admin.address));
      assert.notEqual(
        BigInt(privateInvoke.sender_address),
        BigInt(env.alice.address),
      );
      assert.equal(
        firstInvoke.calldata.some(
          (value) => BigInt(value) === BigInt(env.bob.address),
        ),
        true,
      );
      assert.equal(
        privateInvoke.calldata.some(
          (value) => BigInt(value) === BigInt(env.bob.address),
        ),
        false,
      );
      assert.equal(
        privateInvoke.calldata.some(
          (value) => BigInt(value) === BigInt(env.alice.address),
        ),
        false,
      );
      const bobNotes = await transfers.bob.discoverNotes();
      const bobTotal = (bobNotes.notes.get(env.strk) ?? []).reduce(
        (sum, note) => sum + note.amount,
        0n,
      );
      assert.equal(bobTotal, 3n);
    } finally {
      await indexer?.shutdown();
      await devnet.cleanup();
    }
  },
);
