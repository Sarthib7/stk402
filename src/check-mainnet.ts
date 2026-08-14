import { RpcProvider } from "starknet";

import {
  DEFAULT_STRK20_POOL_ADDRESS,
  loadNetworkConfig,
} from "./config.js";

process.env.STK402_NETWORK ??= "mainnet";
process.env.STARKNET_RPC_URL ??= "https://rpc.starknet.lava.build";
process.env.STRK20_POOL_ADDRESS ??= DEFAULT_STRK20_POOL_ADDRESS;

const config = loadNetworkConfig();
if (config.network !== "mainnet") {
  throw new Error("check:mainnet requires STK402_NETWORK=mainnet");
}

const proving = process.env.STRK20_PROVING_SERVICE_URL?.trim() ?? "";
const indexer = process.env.STRK20_INDEXER_URL?.trim() ?? "";

if (!proving || !indexer) {
  console.log(
    JSON.stringify(
      {
        network: config.network,
        poolAddress: config.poolAddress,
        rpcUrl: config.rpcUrl,
        provingServiceUrl: proving || null,
        indexerUrl: indexer || null,
        status: "blocked",
        reason:
          "Mainnet discovery/proving URLs still unpublished. Fill .env.mainnet only from Day 0 / organizers. Do not guess.",
      },
      null,
      2,
    ),
  );
  process.exitCode = 2;
  process.exit();
}

const provider = new RpcProvider({ nodeUrl: config.rpcUrl });
const chainId = await provider.getChainId();
if (chainId !== config.expectedChainId) {
  throw new Error(
    `Expected mainnet chain ID ${config.expectedChainId}, received ${chainId}`,
  );
}
const poolClassHash = await provider.getClassHashAt(config.poolAddress);

console.log(
  JSON.stringify(
    {
      network: config.network,
      chainId,
      poolAddress: config.poolAddress,
      poolClassHash,
      provingServiceUrl: proving.replace(/\/$/, ""),
      indexerUrl: indexer.replace(/\/$/, ""),
      rpcReachable: true,
      status: "ready",
    },
    null,
    2,
  ),
);
