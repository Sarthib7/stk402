import assert from "node:assert/strict";
import test from "node:test";

import type {
  PrivateTransfersInterface,
  ProvingServiceProofProvider,
  IndexerDiscoveryProvider,
} from "@starkware-libs/starknet-privacy-sdk";
import type { Account } from "starknet";

import { loadPayerConfig } from "./payer-config.js";
import { createPayerTransfers } from "./payer-runtime.js";

test("composes OHTTP discovery and proving for Sepolia", () => {
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
});
