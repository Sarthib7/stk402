import { validateAndParseAddress } from "starknet";

import {
  loadNetworkConfig,
  loadProductionServicesConfig,
  type NetworkName,
} from "../config.js";
import { STRK_TOKEN_ADDRESS } from "./agent-payer.js";

export interface PayerConfig {
  network: Exclude<NetworkName, "devnet">;
  x402Network: "starknet:SN_MAIN" | "starknet:SN_SEPOLIA";
  rpcUrl: string;
  poolAddress: string;
  indexerUrl: string;
  provingServiceUrl: string;
  resourceUrl: string;
  accountAddress: string;
  privateKey: string;
  viewingKey: bigint;
  expectedRecipient: string;
  maxAmount: bigint;
  maxPoolFee: bigint;
  maxNetworkFee: bigint;
  dailySpendLimit: bigint;
  statePath: string;
  proverRequestTimeoutMs: number;
  minimumInvoiceValidityMs: number;
  allowedClockSkewMs: number;
}

function required(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name]?.trim();
  if (
    !value ||
    value.toLowerCase().includes("replace_me") ||
    value.toLowerCase().includes("your_")
  ) {
    throw new Error(`${name} must contain a real value`);
  }
  return value;
}

function u128(
  environment: NodeJS.ProcessEnv,
  name: string,
  allowZero = false,
): bigint {
  let value: bigint;
  try {
    value = BigInt(required(environment, name));
  } catch {
    throw new Error(`${name} must be an integer`);
  }
  if (value < 0n || (!allowZero && value === 0n) || value >= 2n ** 128n) {
    throw new Error(`${name} must fit the configured u128 range`);
  }
  return value;
}

function safeInteger(
  environment: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  allowZero = false,
): number {
  const raw = environment[name]?.trim();
  const value = raw ? Number(raw) : fallback;
  if (
    !Number.isSafeInteger(value) ||
    value < 0 ||
    (!allowZero && value === 0)
  ) {
    throw new Error(`${name} must be a valid safe integer`);
  }
  return value;
}

function feltSecret(environment: NodeJS.ProcessEnv, name: string): string {
  const value = required(environment, name);
  let parsed: bigint;
  try {
    parsed = BigInt(value);
  } catch {
    throw new Error(`${name} must be a felt`);
  }
  if (parsed <= 0n || parsed >= 2n ** 251n) {
    throw new Error(`${name} must be a positive felt`);
  }
  return value;
}

function httpsResource(environment: NodeJS.ProcessEnv): string {
  const resource = new URL(required(environment, "STK402_RESOURCE_URL"));
  if (
    resource.protocol !== "https:" ||
    resource.username ||
    resource.password ||
    resource.hash
  ) {
    throw new Error("STK402_RESOURCE_URL must be an HTTPS URL without credentials or a fragment");
  }
  return resource.toString();
}

export function loadPayerConfig(
  environment: NodeJS.ProcessEnv = process.env,
): PayerConfig {
  const network = loadNetworkConfig(environment);
  if (network.network === "devnet") {
    throw new Error("pay:resource supports sepolia or mainnet");
  }
  const services = loadProductionServicesConfig(environment);
  const statePath = required(environment, "STK402_PAYER_STATE_PATH");
  if (statePath === ":memory:") {
    throw new Error("STK402_PAYER_STATE_PATH must use a filesystem path");
  }

  const privateKey = feltSecret(environment, "STK402_PAYER_PRIVATE_KEY");
  const viewingKey = BigInt(
    feltSecret(environment, "STK402_PAYER_VIEWING_KEY"),
  );

  return {
    network: network.network,
    x402Network:
      network.network === "mainnet"
        ? "starknet:SN_MAIN"
        : "starknet:SN_SEPOLIA",
    rpcUrl: network.rpcUrl,
    poolAddress: network.poolAddress,
    indexerUrl: services.indexerUrl,
    provingServiceUrl: services.provingServiceUrl,
    resourceUrl: httpsResource(environment),
    accountAddress: validateAndParseAddress(
      required(environment, "STK402_PAYER_ADDRESS"),
    ),
    privateKey,
    viewingKey,
    expectedRecipient: validateAndParseAddress(
      required(environment, "STK402_EXPECTED_RECIPIENT"),
    ),
    maxAmount: u128(environment, "STK402_MAX_PAYMENT_AMOUNT"),
    maxPoolFee: u128(environment, "STK402_MAX_POOL_FEE", true),
    maxNetworkFee: u128(environment, "STK402_MAX_NETWORK_FEE", true),
    dailySpendLimit: u128(environment, "STK402_DAILY_SPEND_LIMIT"),
    statePath,
    proverRequestTimeoutMs: safeInteger(
      environment,
      "STK402_PROVER_TIMEOUT_MS",
      600_000,
    ),
    minimumInvoiceValidityMs: safeInteger(
      environment,
      "STK402_MIN_INVOICE_VALIDITY_MS",
      360_000,
    ),
    allowedClockSkewMs: safeInteger(
      environment,
      "STK402_ALLOWED_CLOCK_SKEW_MS",
      30_000,
      true,
    ),
  };
}

export { STRK_TOKEN_ADDRESS };
