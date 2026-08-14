import assert from "node:assert/strict";
import test from "node:test";

import type {
  PrivateTransfersInterface,
  ProvingServiceProofProvider,
  IndexerDiscoveryProvider,
} from "@starkware-libs/starknet-privacy-sdk";
import type { Paymaster } from "@starkware-libs/starknet-privacy-client";
import type { Account, RpcProvider } from "starknet";

import { loadPayerConfig } from "./payer-config.js";
import {
  createPayerReceiptCreator,
  createPayerTransfers,
} from "./payer-runtime.js";
import { generateServerEnvelopeKey } from "./private-envelope.js";
import type { SqlitePayerJournal } from "./payer-journal.js";
import type { SqliteDailySpendBudget } from "./spend-budget.js";
import type { Strk20ReceiptCreator } from "./agent-payer.js";

test("composes OHTTP discovery and proving for Sepolia", () => {
  const envelope = generateServerEnvelopeKey();
  const clientEnvelope = generateServerEnvelopeKey();
  const config = loadPayerConfig({
    STK402_NETWORK: "sepolia",
    STARKNET_RPC_URL: "https://rpc.example",
    STRK20_POOL_ADDRESS: "0x123",
    STRK20_INDEXER_URL: "https://indexer.example",
    STRK20_PROVING_SERVICE_URL: "https://prover.example",
    STK402_RESOURCE_URL: "https://seller.example/tool",
    STK402_PAYER_ADDRESS: "0x456",
    STK402_PAYER_PRIVATE_KEY: "0x789",
    STK402_PAYER_VIEWING_KEY: "0xabc",
    STK402_EXPECTED_RECIPIENT: "0xdef",
    STK402_MAX_PAYMENT_AMOUNT: "100",
    STK402_MAX_POOL_FEE: "10",
    STK402_MAX_NETWORK_FEE: "20",
    STK402_DAILY_SPEND_LIMIT: "500",
    STK402_PAYER_STATE_PATH: "./data/payer.sqlite",
    STK402_ENVELOPE_PUBLIC_KEY: envelope.publicKeyValue,
    STK402_CLIENT_ENVELOPE_PRIVATE_KEY: clientEnvelope.privateKeyValue,
    STK402_CLIENT_ENVELOPE_PUBLIC_KEY: clientEnvelope.publicKeyValue,
    STK402_PAYMASTER_URL: "https://paymaster.example",
    STK402_PAYMASTER_API_KEY: "test-api-key",
    STK402_MAX_PAYMASTER_FEE: "30",
  });
  const seen: Array<[string, unknown]> = [];
  const discovery = {} as IndexerDiscoveryProvider;
  const prover = {} as ProvingServiceProofProvider;
  const transfers = {} as PrivateTransfersInterface;

  const result = createPayerTransfers(config, {} as Account, {
    discovery: class {
      constructor(...args: unknown[]) {
        seen.push(["discovery", args]);
        return discovery;
      }
    } as never,
    prover: class {
      constructor(...args: unknown[]) {
        seen.push(["prover", args]);
        return prover;
      }
    } as never,
    transfers: ((args: unknown) => {
      seen.push(["transfers", args]);
      return transfers;
    }) as never,
  });

  assert.equal(result, transfers);
  assert.deepEqual((seen[0]?.[1] as unknown[])[2], { ohttp: true });
  assert.deepEqual((seen[1]?.[1] as unknown[])[2], {
    requestTimeoutMs: 600_000,
    nodeUrl: "https://rpc.example/",
    poolAddress:
      "0x0000000000000000000000000000000000000000000000000000000000000123",
    ohttp: true,
  });
  const transferArgs = seen[2]?.[1] as {
    provingProvider: unknown;
    discoveryProvider: unknown;
  };
  assert.equal(transferArgs.provingProvider, prover);
  assert.equal(transferArgs.discoveryProvider, discovery);

  const paymentSeen: Array<[string, unknown]> = [];
  const paymaster = {} as Paymaster;
  const receiptCreator = {} as Strk20ReceiptCreator;
  const composed = createPayerReceiptCreator(
    config,
    transfers,
    {} as Account,
    {} as RpcProvider,
    {} as SqlitePayerJournal,
    {} as SqliteDailySpendBudget,
    {
      paymaster: (options) => {
        paymentSeen.push(["paymaster", options]);
        return paymaster;
      },
      receiptCreator: (...args) => {
        paymentSeen.push(["receiptCreator", args]);
        return receiptCreator;
      },
    },
  );

  assert.equal(composed, receiptCreator);
  assert.deepEqual(paymentSeen[0], [
    "paymaster",
    {
      url: "https://paymaster.example/",
      apiKey: "test-api-key",
      feeMode: {
        mode: "sponsored_private",
        poolFeeToken:
          "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d",
        tip: "normal",
      },
    },
  ]);
  const receiptArgs = paymentSeen[1]?.[1] as unknown[];
  assert.equal(receiptArgs[0], transfers);
  assert.equal(receiptArgs[10], "l2");
  assert.equal(receiptArgs[16], paymaster);
  assert.equal(receiptArgs[17], 30n);
});
