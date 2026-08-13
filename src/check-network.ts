import { RpcProvider } from "starknet";

import { loadNetworkConfig } from "./config.js";

const config = loadNetworkConfig();
const provider = new RpcProvider({ nodeUrl: config.rpcUrl });

const chainId = await provider.getChainId();
if (chainId !== config.expectedChainId) {
  throw new Error(
    `Expected ${config.network} chain ID ${config.expectedChainId}, received ${chainId}`,
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
      rpcReachable: true,
    },
    null,
    2,
  ),
);
