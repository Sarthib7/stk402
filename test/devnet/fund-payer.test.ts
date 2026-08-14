import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { constants } from "starknet";

import { Strk20PayerFunding } from "../../src/private402/fund-payer.js";
import { SqlitePayerJournal } from "../../src/private402/payer-journal.js";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
process.env.PATH = `${join(projectRoot, ".tools/bin")}:${process.env.PATH ?? ""}`;

test("funds the payer private balance once on Devnet", { timeout: 120_000 }, async () => {
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
        alice: import("@starkware-libs/starknet-privacy-sdk").PrivateTransfersInterface;
      };
      indexer: {
        apiUrl: string;
        waitForBlock(rpcUrl: string): Promise<string>;
        shutdown(): Promise<void>;
      };
    }>;
  };
  const devnet = new Devnet();
  const directory = mkdtempSync(join(tmpdir(), "stk402-devnet-funding-"));
  let indexer: Awaited<ReturnType<typeof createE2eTestEnv>>["indexer"] | undefined;
  let journal: SqlitePayerJournal | undefined;

  try {
    const testEnvironment = await createE2eTestEnv(devnet, {
      indexer: { logFile: ".cache/stk402-funding-indexer.log" },
    });
    const { env, transfers } = testEnvironment;
    indexer = testEnvironment.indexer;
    let submissions = 0;
    const account = new Proxy(env.alice, {
      get(target, property, receiver) {
        if (property === "execute") {
          return async (...args: Parameters<typeof target.execute>) => {
            submissions += 1;
            return target.execute(...args);
          };
        }
        const value = Reflect.get(target, property, receiver) as unknown;
        return typeof value === "function" ? value.bind(target) : value;
      },
    }) as unknown as ConstructorParameters<typeof Strk20PayerFunding>[1];
    const fundingTransfers = new Proxy(transfers.alice, {
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
    const fundingPath = join(directory, "payer.sqlite");
    journal = new SqlitePayerJournal(fundingPath);
    const funding = new Strk20PayerFunding(
      fundingTransfers,
      account,
      env.node,
      env.privacy.address,
      constants.StarknetChainId.SN_SEPOLIA,
      "devnet-funding",
      25n,
      2n ** 128n - 1n,
      2n ** 128n - 1n,
      10,
      journal,
    );

    const transactionHash = await funding.fund();
    await indexer.waitForBlock(devnet.url);
    const notes = await transfers.alice.discoverNotes();
    assert.equal(notes.notes.get(env.strk)?.[0]?.amount, 25n);
    journal.close();

    journal = new SqlitePayerJournal(fundingPath);
    const retry = new Strk20PayerFunding(
      fundingTransfers,
      account,
      env.node,
      env.privacy.address,
      constants.StarknetChainId.SN_SEPOLIA,
      "devnet-funding",
      25n,
      2n ** 128n - 1n,
      2n ** 128n - 1n,
      10,
      journal,
    );
    assert.equal(await retry.fund(), transactionHash);
    assert.equal(submissions, 1);
  } finally {
    journal?.close();
    await indexer?.shutdown();
    await devnet.cleanup();
    rmSync(directory, { recursive: true, force: true });
  }
});
