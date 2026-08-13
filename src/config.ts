import { validateAndParseAddress } from "starknet";

export const SN_MAIN = "0x534e5f4d41494e";
export const SN_SEPOLIA = "0x534e5f5345504f4c4941";
export const DEFAULT_STRK20_POOL_ADDRESS =
  "0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a";
export const SEPOLIA_STRK20_POOL_ADDRESS =
  "0x0254a6b2997ef52e9f830ce1f543f6b29768295e8d17e2267d672c552cfe0d91";

export type NetworkName = "devnet" | "sepolia" | "mainnet";

export interface NetworkConfig {
  network: NetworkName;
  expectedChainId: string;
  rpcUrl: string;
  poolAddress: string;
}

export interface ProductionServicesConfig {
  provingServiceUrl: string;
  indexerUrl: string;
}

function requiredEnvironmentValue(
  environment: NodeJS.ProcessEnv,
  name: string,
): string {
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

function networkName(environment: NodeJS.ProcessEnv): NetworkName {
  const value = environment.STK402_NETWORK?.trim() || "devnet";

  if (value !== "devnet" && value !== "sepolia" && value !== "mainnet") {
    throw new Error("STK402_NETWORK must be devnet, sepolia, or mainnet");
  }

  return value;
}

function httpsServiceUrl(
  environment: NodeJS.ProcessEnv,
  name: string,
): string {
  const value = requiredEnvironmentValue(environment, name);

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL`);
  }

  if (parsedUrl.protocol !== "https:") {
    throw new Error(`${name} must use HTTPS`);
  }

  return parsedUrl.toString().replace(/\/$/, "");
}

export function loadProductionServicesConfig(
  environment: NodeJS.ProcessEnv = process.env,
): ProductionServicesConfig {
  return {
    provingServiceUrl: httpsServiceUrl(
      environment,
      "STRK20_PROVING_SERVICE_URL",
    ),
    indexerUrl: httpsServiceUrl(environment, "STRK20_INDEXER_URL"),
  };
}

export function loadIndexerServiceUrl(
  environment: NodeJS.ProcessEnv = process.env,
): string {
  return httpsServiceUrl(environment, "STRK20_INDEXER_URL");
}

export function loadNetworkConfig(
  environment: NodeJS.ProcessEnv = process.env,
): NetworkConfig {
  const network = networkName(environment);
  const rpcUrl = requiredEnvironmentValue(environment, "STARKNET_RPC_URL");
  const poolAddress =
    environment.STRK20_POOL_ADDRESS?.trim() ||
    (network === "mainnet"
      ? DEFAULT_STRK20_POOL_ADDRESS
      : network === "sepolia"
        ? SEPOLIA_STRK20_POOL_ADDRESS
        : "");

  if (!poolAddress || poolAddress.includes("replace_")) {
    throw new Error("STRK20_POOL_ADDRESS must contain a deployed pool address");
  }

  let parsedPoolAddress: string;
  try {
    parsedPoolAddress = validateAndParseAddress(poolAddress);
  } catch {
    throw new Error("STRK20_POOL_ADDRESS must be a valid Starknet address");
  }

  let parsedRpcUrl: URL;
  try {
    parsedRpcUrl = new URL(rpcUrl);
  } catch {
    throw new Error("STARKNET_RPC_URL must be a valid URL");
  }

  const isLoopbackDevnet =
    network === "devnet" &&
    parsedRpcUrl.protocol === "http:" &&
    (parsedRpcUrl.hostname === "127.0.0.1" ||
      parsedRpcUrl.hostname === "localhost");

  if (parsedRpcUrl.protocol !== "https:" && !isLoopbackDevnet) {
    throw new Error("STARKNET_RPC_URL must use HTTPS outside local Devnet");
  }

  return {
    network,
    expectedChainId: network === "mainnet" ? SN_MAIN : SN_SEPOLIA,
    rpcUrl: parsedRpcUrl.toString(),
    poolAddress: parsedPoolAddress,
  };
}
