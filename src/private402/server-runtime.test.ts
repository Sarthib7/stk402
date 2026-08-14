import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  decodePaymentRequiredHeader,
} from "@x402/core/http";
import type { IndexerDiscoveryProvider } from "@starkware-libs/starknet-privacy-sdk";
import type { RpcProvider } from "starknet";

import { createPaidServerRuntime } from "./server-runtime.js";
import type { PaidServerConfig } from "./server-config.js";

function config(ledgerPath: string): PaidServerConfig {
  return {
    network: "sepolia",
    x402Network: "starknet:SN_SEPOLIA",
    rpcUrl: "https://rpc.example",
    expectedChainId: "0x534e5f5345504f4c4941",
    poolAddress: "0x123",
    indexerUrl: "https://indexer.example",
    recipient: "0x456",
    viewingKey: 0x789n,
    token: "0xabc",
    amount: 50n,
    ledgerPath,
    publicOrigin: new URL("https://seller.example"),
    host: "127.0.0.1",
    port: 3402,
    requiredFinality: "l2",
    maxOutstandingInvoices: 10,
    invoiceTimeoutSeconds: 900,
  };
}

function provider(chainId: string) {
  return {
    getChainId: async () => chainId,
  } as unknown as RpcProvider;
}

const indexer = {} as IndexerDiscoveryProvider;

test("checks the live chain before creating replay storage", async () => {
  const directory = mkdtempSync(join(tmpdir(), "stk402-chain-"));
  const ledgerPath = join(directory, "claims.sqlite");
  try {
    await assert.rejects(
      createPaidServerRuntime(config(ledgerPath), {
        provider: provider("0x534e5f4d41494e"),
        indexer,
      }),
      /Expected chain ID/,
    );
    assert.throws(() => readFileSync(ledgerPath), /ENOENT/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("composes SQLite and the paid route", async () => {
  const directory = mkdtempSync(join(tmpdir(), "stk402-runtime-"));
  const ledgerPath = join(directory, "nested", "claims.sqlite");
  const runtime = await createPaidServerRuntime(config(ledgerPath), {
    provider: provider("0x534e5f5345504f4c4941"),
    indexer,
  });

  try {
    const response = await runtime.handler(
      new Request("http://internal/tools/sha256?text=stk402"),
    );
    assert.equal(response.status, 402);
    const challenge = decodePaymentRequiredHeader(
      response.headers.get("payment-required")!,
    );
    assert.equal(
      challenge.resource.url,
      "https://seller.example/tools/sha256?text=stk402",
    );
    assert.equal(challenge.accepts[0]?.maxTimeoutSeconds, 900);
    assert.equal(readFileSync(ledgerPath).subarray(0, 15).toString(), "SQLite format 3");
  } finally {
    runtime.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
