import {
  IndexerDiscoveryProvider,
  ProvingService,
} from "@starkware-libs/starknet-privacy-sdk";
import { RpcProvider } from "starknet";

import {
  loadNetworkConfig,
  loadProductionServicesConfig,
} from "./config.js";

const network = loadNetworkConfig();
if (network.network !== "sepolia") {
  throw new Error("STK402_NETWORK must be sepolia for this check");
}

const services = loadProductionServicesConfig();
const provider = new RpcProvider({ nodeUrl: network.rpcUrl });
const chainId = await provider.getChainId();
if (chainId !== network.expectedChainId) {
  throw new Error(
    `Expected Sepolia chain ID ${network.expectedChainId}, received ${chainId}`,
  );
}

const poolClassHash = await provider.getClassHashAt(network.poolAddress);

const indexer = new IndexerDiscoveryProvider(
  services.indexerUrl,
  network.poolAddress,
);
const indexerHealth = await indexer.getHealth();
if (indexerHealth.status !== "OK") {
  throw new Error(`STRK20 indexer status is ${indexerHealth.status}`);
}

const prover = new ProvingService({ baseUrl: services.provingServiceUrl });
const proverSpecVersion = await prover.getSpecVersion();

console.log(
  JSON.stringify(
    {
      network: network.network,
      chainId,
      poolAddress: network.poolAddress,
      poolClassHash,
      indexer: indexerHealth,
      proverSpecVersion,
    },
    null,
    2,
  ),
);
