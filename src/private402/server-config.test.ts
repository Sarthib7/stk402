import assert from "node:assert/strict";
import test from "node:test";

import {
  assertExpectedChainId,
  loadPaidServerConfig,
  publicResourceUrl,
} from "./server-config.js";
import { generateServerEnvelopeKey } from "./private-envelope.js";

const envelope = generateServerEnvelopeKey();
const clientEnvelope = generateServerEnvelopeKey();

function environment(network: "sepolia" | "mainnet" = "sepolia") {
  return {
    STK402_NETWORK: network,
    STARKNET_RPC_URL: "https://rpc.example",
    STRK20_POOL_ADDRESS: "0x123",
    STRK20_INDEXER_URL: "https://indexer.example",
    STK402_RECIPIENT_ADDRESS: "0x456",
    STK402_RECIPIENT_VIEWING_KEY: "0x789",
    STK402_PAYMENT_TOKEN: "0xabc",
    STK402_PAYMENT_AMOUNT: "50",
    STK402_LEDGER_PATH: "./data/claims.sqlite",
    STK402_PUBLIC_ORIGIN: "https://seller.example/base?ignored=true",
    STK402_ENVELOPE_PRIVATE_KEY: envelope.privateKeyValue,
    STK402_ENVELOPE_PUBLIC_KEY: envelope.publicKeyValue,
    STK402_AUTHORIZED_CLIENT_ENVELOPE_PUBLIC_KEY:
      clientEnvelope.publicKeyValue,
  } satisfies NodeJS.ProcessEnv;
}

test("loads a Sepolia paid server with L2 finality", () => {
  const config = loadPaidServerConfig(environment());

  assert.equal(config.x402Network, "starknet:SN_SEPOLIA");
  assert.equal(config.requiredFinality, "l2");
  assert.equal(config.publicOrigin.toString(), "https://seller.example/");
  assert.equal(config.port, 3402);
  assert.equal(config.amount, 50n);
  assert.equal(config.invoiceTimeoutSeconds, 900);
});

test("confines resource URLs to the configured public origin", () => {
  assert.equal(
    publicResourceUrl(
      "http://internal//evil.example/tools/sha256?text=x",
      new URL("https://seller.example"),
    ),
    "https://seller.example//evil.example/tools/sha256?text=x",
  );
});

test("uses L2 finality on Mainnet", () => {
  const config = loadPaidServerConfig(environment("mainnet"));

  assert.equal(config.x402Network, "starknet:SN_MAIN");
  assert.equal(config.requiredFinality, "l2");
});

test("loads and validates a custom invoice timeout", () => {
  assert.equal(
    loadPaidServerConfig({
      ...environment(),
      STK402_INVOICE_TIMEOUT_SECONDS: "1800",
    }).invoiceTimeoutSeconds,
    1800,
  );
  assert.throws(
    () =>
      loadPaidServerConfig({
        ...environment(),
        STK402_INVOICE_TIMEOUT_SECONDS: "0",
      }),
    /positive safe integer/,
  );
  assert.throws(
    () =>
      loadPaidServerConfig({
        ...environment(),
        STK402_INVOICE_TIMEOUT_SECONDS: "1.5",
      }),
    /positive safe integer/,
  );
});

test("rejects an RPC for another Starknet network", () => {
  assert.throws(
    () => assertExpectedChainId("0x534e5f5345504f4c4941", "0x534e5f4d41494e"),
    /Expected chain ID/,
  );
});

test("rejects memory-only replay storage and insecure origins", () => {
  assert.throws(
    () =>
      loadPaidServerConfig({
        ...environment(),
        STK402_LEDGER_PATH: ":memory:",
      }),
    /filesystem path/,
  );
  assert.throws(
    () =>
      loadPaidServerConfig({
        ...environment(),
        STK402_PUBLIC_ORIGIN: "http://seller.example",
      }),
    /must use HTTPS/,
  );
  assert.throws(
    () => loadPaidServerConfig({ ...environment(), STK402_PORT: "65536" }),
    /at most 65535/,
  );
  assert.throws(
    () =>
      loadPaidServerConfig({
        ...environment(),
        STK402_ENVELOPE_PRIVATE_KEY:
          generateServerEnvelopeKey().privateKeyValue,
      }),
    /keys do not match/,
  );
});
