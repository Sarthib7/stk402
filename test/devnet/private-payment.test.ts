import assert from "node:assert/strict";
import { test } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { x402Facilitator } from "@x402/core/facilitator";
import { stark } from "starknet";

import {
  InMemoryClaimLedger,
  PrivateExactFacilitator,
  buildReceiptTypedData,
} from "../../src/private402/signed-receipt.js";
import { Strk20HistoryEvidenceReader } from "../../src/private402/strk20-history.js";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
process.env.PATH = `${join(projectRoot, ".tools/bin")}:${process.env.PATH ?? ""}`;

test("deposits STRK and transfers it privately on Devnet", { timeout: 120_000 }, async () => {
  const { Devnet } = await import(
    "@starkware-libs/starknet-privacy-sdk/testing"
  );
  const { IndexerDiscoveryProvider } = await import(
    "@starkware-libs/starknet-privacy-sdk"
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
        bob: import("@starkware-libs/starknet-privacy-sdk").PrivateTransfersInterface;
      };
      indexer: {
        apiUrl: string;
        waitForBlock(rpcUrl: string): Promise<string>;
        shutdown(): Promise<void>;
      };
    }>;
  };
  const devnet = new Devnet();
  let indexer: Awaited<ReturnType<typeof createE2eTestEnv>>["indexer"] | undefined;

  try {
    const testEnvironment = await createE2eTestEnv(devnet, {
      indexer: { logFile: ".cache/stk402-indexer.log" },
    });
    const { env, transfers } = testEnvironment;
    indexer = testEnvironment.indexer;

    await env.alice.execute({
      contractAddress: env.strk,
      entrypoint: "approve",
      calldata: [env.privacy.address, 100n, 0n],
    });

    const bobRegistration = await transfers.bob.build().register().execute();
    const bobReceipt = await devnet.executeOutside(bobRegistration.callAndProof);
    assert.equal(bobReceipt.isReverted(), false);

    const payment = await transfers.alice
      .build({
        autoRegister: true,
        autoSetup: true,
        autoDiscover: { notes: "refresh", channels: "refresh" },
      })
      .with(env.strk)
      .deposit({ amount: 100n })
      .transfer({ recipient: env.bob.address, amount: 50n })
      .surplusTo(env.alice.address)
      .execute();

    const paymentReceipt = await devnet.executeOutside(payment.callAndProof);
    assert.equal(paymentReceipt.isReverted(), false);
    assert.ok("transaction_hash" in paymentReceipt);
    const transactionHash = paymentReceipt.transaction_hash;
    await indexer.waitForBlock(devnet.url);

    const aliceNotes = await transfers.alice.discoverNotes();
    assert.equal(aliceNotes.notes.get(env.strk)?.[0]?.amount, 50n);

    const bobChannels = await transfers.alice.discoverChannels([env.bob.address]);
    assert.equal(bobChannels.channels?.get(env.bob.address)?.tokens.get(env.strk)?.noteNonce, 1);

    const bobNotes = await transfers.bob.discoverNotes();
    assert.equal(bobNotes.notes.get(env.strk)?.[0]?.amount, 50n);

    const requirements = {
      scheme: "exact-private",
      network: "starknet:SN_SEPOLIA" as const,
      asset: env.strk,
      amount: "50",
      payTo: env.bob.address,
      maxTimeoutSeconds: 60,
      extra: { invoiceId: "0x402" },
    };
    const signature = stark.signatureToHexArray(
      await env.alice.signMessage(
        buildReceiptTypedData(requirements, transactionHash),
      ),
    );
    const evidenceReader = new Strk20HistoryEvidenceReader(
      new IndexerDiscoveryProvider(indexer.apiUrl, env.privacy.address),
      BigInt(env.bob.address),
      0xb0bn,
      async (candidateHash) => {
        const receipt = await env.node.getTransactionReceipt(candidateHash);
        return receipt.isSuccess();
      },
    );
    const mechanism = new PrivateExactFacilitator({
      ledger: new InMemoryClaimLedger(),
      signatureVerifier: {
        verify: (message, candidateSignature, payer) =>
          env.node.verifyMessageInStarknet(
            message,
            candidateSignature,
            payer,
          ),
      },
      evidenceReader,
    });
    const facilitator = new x402Facilitator().register(
      requirements.network,
      mechanism,
    );
    const payload = {
      x402Version: 2,
      accepted: requirements,
      payload: {
        invoiceId: requirements.extra.invoiceId,
        transactionHash,
        payer: env.alice.address,
        signature,
      },
    };

    const verified = await facilitator.verify(payload, requirements);
    assert.equal(verified.isValid, true);

    const settled = await facilitator.settle(payload, requirements);
    assert.equal(settled.success, true);

    const replay = await facilitator.settle(payload, requirements);
    assert.equal(replay.success, false);
    assert.equal(replay.errorReason, "transaction_used");
  } finally {
    await indexer?.shutdown();
    await devnet.cleanup();
  }
});
