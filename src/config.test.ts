import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_STRK20_POOL_ADDRESS,
  SEPOLIA_STRK20_POOL_ADDRESS,
  SN_MAIN,
  SN_SEPOLIA,
  loadNetworkConfig,
  loadProductionServicesConfig,
} from "./config.js";

test("loads local Devnet over loopback HTTP", () => {
  const config = loadNetworkConfig({
    STK402_NETWORK: "devnet",
    STARKNET_RPC_URL: "http://127.0.0.1:5050",
    STRK20_POOL_ADDRESS: "0x123",
  });

  assert.equal(config.network, "devnet");
  assert.equal(config.expectedChainId, SN_SEPOLIA);
  assert.equal(config.rpcUrl, "http://127.0.0.1:5050/");
});

test("loads Mainnet with the default STRK20 pool", () => {
  const config = loadNetworkConfig({
    STK402_NETWORK: "mainnet",
    STARKNET_RPC_URL: "https://starknet-mainnet.example/rpc",
  });

  assert.equal(config.expectedChainId, SN_MAIN);
  assert.equal(config.poolAddress, DEFAULT_STRK20_POOL_ADDRESS);
});

test("loads Sepolia with the deployed STRK20 pool", () => {
  const config = loadNetworkConfig({
    STK402_NETWORK: "sepolia",
    STARKNET_RPC_URL: "https://starknet-sepolia.example/rpc",
  });

  assert.equal(config.expectedChainId, SN_SEPOLIA);
  assert.equal(config.poolAddress, SEPOLIA_STRK20_POOL_ADDRESS);
});

test("loads production prover and indexer URLs", () => {
  const config = loadProductionServicesConfig({
    STRK20_PROVING_SERVICE_URL: "https://prover.example",
    STRK20_INDEXER_URL: "https://indexer.example",
  });

  assert.equal(config.provingServiceUrl, "https://prover.example");
  assert.equal(config.indexerUrl, "https://indexer.example");
});

test("removes trailing slashes from production service URLs", () => {
  const config = loadProductionServicesConfig({
    STRK20_PROVING_SERVICE_URL: "https://prover.example/",
    STRK20_INDEXER_URL: "https://indexer.example/",
  });

  assert.equal(config.provingServiceUrl, "https://prover.example");
  assert.equal(config.indexerUrl, "https://indexer.example");
});

test("rejects insecure production service URLs", () => {
  assert.throws(
    () =>
      loadProductionServicesConfig({
        STRK20_PROVING_SERVICE_URL: "http://prover.example",
        STRK20_INDEXER_URL: "https://indexer.example",
      }),
    /STRK20_PROVING_SERVICE_URL must use HTTPS/,
  );
});

test("rejects production service placeholders", () => {
  assert.throws(
    () =>
      loadProductionServicesConfig({
        STRK20_PROVING_SERVICE_URL: "https://YOUR_PROVING_SERVICE",
        STRK20_INDEXER_URL: "https://indexer.example",
      }),
    /STRK20_PROVING_SERVICE_URL must contain a real value/,
  );
});

test("rejects the placeholder RPC value", () => {
  assert.throws(
    () =>
      loadNetworkConfig({
        STARKNET_RPC_URL:
          "https://starknet-mainnet.g.alchemy.com/v2/replace_me",
        STRK20_POOL_ADDRESS: "0x123",
      }),
    /STARKNET_RPC_URL must contain a real value/,
  );
});

test("rejects HTTP outside local Devnet", () => {
  assert.throws(
    () =>
      loadNetworkConfig({
        STK402_NETWORK: "sepolia",
        STARKNET_RPC_URL: "http://sepolia.example/rpc",
        STRK20_POOL_ADDRESS: "0x123",
      }),
    /STARKNET_RPC_URL must use HTTPS outside local Devnet/,
  );
});

test("rejects an invalid pool address", () => {
  assert.throws(
    () =>
      loadNetworkConfig({
        STK402_NETWORK: "sepolia",
        STARKNET_RPC_URL: "https://starknet-mainnet.example/rpc",
        STRK20_POOL_ADDRESS: "not-an-address",
      }),
    /STRK20_POOL_ADDRESS must be a valid Starknet address/,
  );
});

test("requires a deployed pool outside Mainnet", () => {
  assert.throws(
    () =>
      loadNetworkConfig({
        STK402_NETWORK: "devnet",
        STARKNET_RPC_URL: "http://localhost:5050",
      }),
    /STRK20_POOL_ADDRESS must contain a deployed pool address/,
  );
});
