import assert from "node:assert/strict";
import test from "node:test";

import {
  loadFundingConfig,
  loadPayerConfig,
  STRK_TOKEN_ADDRESS,
} from "./payer-config.js";

function environment(): NodeJS.ProcessEnv {
  return {
    STK402_NETWORK: "sepolia",
    STARKNET_RPC_URL: "https://rpc.example",
    STRK20_POOL_ADDRESS: "0x123",
    STRK20_INDEXER_URL: "https://indexer.example",
    STRK20_PROVING_SERVICE_URL: "https://prover.example",
    STK402_RESOURCE_URL:
      "https://seller.example/tools/sha256?text=stk402",
    STK402_PAYER_ADDRESS: "0x456",
    STK402_PAYER_PRIVATE_KEY: "0x789",
    STK402_PAYER_VIEWING_KEY: "0xabc",
    STK402_EXPECTED_RECIPIENT: "0xdef",
    STK402_MAX_PAYMENT_AMOUNT: "100",
    STK402_MAX_POOL_FEE: "10",
    STK402_MAX_NETWORK_FEE: "20",
    STK402_DAILY_SPEND_LIMIT: "500",
    STK402_PAYER_STATE_PATH: "./data/payer.sqlite",
  };
}

test("loads a production Sepolia payer policy", () => {
  const config = loadPayerConfig(environment());

  assert.equal(config.x402Network, "starknet:SN_SEPOLIA");
  assert.equal(config.maxAmount, 100n);
  assert.equal(config.maxPoolFee, 10n);
  assert.equal(config.maxNetworkFee, 20n);
  assert.equal(config.dailySpendLimit, 500n);
  assert.equal(config.proverRequestTimeoutMs, 600_000);
  assert.equal(config.minimumInvoiceValidityMs, 360_000);
  assert.equal(config.minimumInvoiceValidityMs > 300_000, true);
  assert.equal(config.allowedClockSkewMs, 30_000);
  assert.equal(STRK_TOKEN_ADDRESS.startsWith("0x"), true);
});

test("rejects unsafe payer policy and secret placeholders", () => {
  assert.throws(
    () =>
      loadPayerConfig({
        ...environment(),
        STK402_PAYER_PRIVATE_KEY: "replace_me",
      }),
    /real value/,
  );
  assert.throws(
    () =>
      loadPayerConfig({
        ...environment(),
        STK402_RESOURCE_URL: "http://seller.example/tool",
      }),
    /HTTPS URL/,
  );
  assert.throws(
    () =>
      loadPayerConfig({
        ...environment(),
        STK402_PAYER_STATE_PATH: ":memory:",
      }),
    /filesystem path/,
  );
  assert.throws(
    () =>
      loadPayerConfig({
        ...environment(),
        STK402_DAILY_SPEND_LIMIT: "0",
      }),
    /u128 range/,
  );
});

test("loads and validates one private funding instruction", () => {
  const fundingEnvironment = environment();
  delete fundingEnvironment.STK402_RESOURCE_URL;
  delete fundingEnvironment.STK402_EXPECTED_RECIPIENT;
  delete fundingEnvironment.STK402_MAX_PAYMENT_AMOUNT;
  delete fundingEnvironment.STK402_DAILY_SPEND_LIMIT;
  fundingEnvironment.STK402_PRIVATE_FUNDING_ID = "initial-sepolia-funding";
  fundingEnvironment.STK402_PRIVATE_FUND_AMOUNT = "50";
  const config = loadFundingConfig(fundingEnvironment);
  assert.equal(config.fundingId, "initial-sepolia-funding");
  assert.equal(config.fundingAmount, 50n);
  assert.equal(config.fundingMinimumProofValidityBlocks, 10);

  assert.throws(
    () =>
      loadFundingConfig({
        ...environment(),
        STK402_PRIVATE_FUNDING_ID: "bad funding id",
        STK402_PRIVATE_FUND_AMOUNT: "50",
      }),
    /safe characters/,
  );
  assert.throws(
    () =>
      loadFundingConfig({
        ...environment(),
        STK402_PRIVATE_FUNDING_ID: "initial-sepolia-funding",
        STK402_PRIVATE_FUND_AMOUNT: "0",
      }),
    /u128 range/,
  );
  assert.throws(
    () =>
      loadFundingConfig({
        ...fundingEnvironment,
        STK402_FUND_MIN_PROOF_VALIDITY_BLOCKS: "0",
      }),
    /safe integer/,
  );
});
