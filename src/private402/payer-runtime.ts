import {
  IndexerDiscoveryProvider,
  ProvingServiceProofProvider,
  createPrivateTransfers,
  type PrivateTransfersInterface,
} from "@starkware-libs/starknet-privacy-sdk";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Account, RpcProvider, constants } from "starknet";

import { Strk20ReceiptCreator, STRK_TOKEN_ADDRESS } from "./agent-payer.js";
import { Strk20PayerFunding } from "./fund-payer.js";
import type {
  FundingConfig,
  PayerConfig,
  PayerRuntimeConfig,
} from "./payer-config.js";
import { SqlitePayerJournal } from "./payer-journal.js";
import { payResource, type PaidResourceResult } from "./pay-resource.js";
import { SqlitePaymentSessionStore } from "./payment-session.js";
import { SqliteDailySpendBudget } from "./spend-budget.js";

interface PayerSdkFactories {
  discovery: typeof IndexerDiscoveryProvider;
  prover: typeof ProvingServiceProofProvider;
  transfers: typeof createPrivateTransfers;
}

const defaultSdkFactories: PayerSdkFactories = {
  discovery: IndexerDiscoveryProvider,
  prover: ProvingServiceProofProvider,
  transfers: createPrivateTransfers,
};

export function createPayerTransfers(
  config: PayerRuntimeConfig,
  account: Account,
  factories: PayerSdkFactories = defaultSdkFactories,
): PrivateTransfersInterface {
  const chainId =
    config.network === "mainnet"
      ? constants.StarknetChainId.SN_MAIN
      : constants.StarknetChainId.SN_SEPOLIA;
  const discovery = new factories.discovery(
    config.indexerUrl,
    config.poolAddress,
    { ohttp: true },
  );
  const prover = new factories.prover(config.provingServiceUrl, chainId, {
    requestTimeoutMs: config.proverRequestTimeoutMs,
    nodeUrl: config.rpcUrl,
    poolAddress: config.poolAddress,
    ohttp: true,
  });
  return factories.transfers({
    account,
    viewingKeyProvider: {
      getViewingKey: async () => config.viewingKey,
    },
    provingProvider: prover,
    discoveryProvider: discovery,
    poolContractAddress: config.poolAddress,
  });
}

export async function runPayer(config: PayerConfig): Promise<PaidResourceResult> {
  mkdirSync(dirname(config.statePath), { recursive: true });
  const provider = new RpcProvider({ nodeUrl: config.rpcUrl, batch: 50 });
  const account = new Account({
    provider,
    address: config.accountAddress,
    signer: config.privateKey,
    cairoVersion: "1",
  });
  const transfers = createPayerTransfers(config, account);
  const journal = new SqlitePayerJournal(config.statePath);
  const budget = new SqliteDailySpendBudget(
    config.statePath,
    config.dailySpendLimit,
  );
  const sessions = new SqlitePaymentSessionStore(config.statePath);
  try {
    const receiptCreator = new Strk20ReceiptCreator(
      transfers,
      account,
      provider,
      config.poolAddress,
      config.x402Network,
      STRK_TOKEN_ADDRESS,
      config.expectedRecipient,
      config.maxAmount,
      config.maxPoolFee,
      config.maxNetworkFee,
      "l2",
      journal,
      budget,
      config.minimumInvoiceValidityMs,
      config.allowedClockSkewMs,
    );
    return await payResource(
      config.resourceUrl,
      config.x402Network,
      receiptCreator,
      sessions,
    );
  } finally {
    journal.close();
    budget.close();
    sessions.close();
  }
}

export async function runFunding(config: FundingConfig): Promise<string> {
  mkdirSync(dirname(config.statePath), { recursive: true });
  const provider = new RpcProvider({ nodeUrl: config.rpcUrl, batch: 50 });
  const account = new Account({
    provider,
    address: config.accountAddress,
    signer: config.privateKey,
    cairoVersion: "1",
  });
  const transfers = createPayerTransfers(config, account);
  const journal = new SqlitePayerJournal(config.statePath);
  try {
    return await new Strk20PayerFunding(
      transfers,
      account,
      provider,
      config.poolAddress,
      config.x402Network === "starknet:SN_MAIN"
        ? constants.StarknetChainId.SN_MAIN
        : constants.StarknetChainId.SN_SEPOLIA,
      config.fundingId,
      config.fundingAmount,
      config.maxPoolFee,
      config.maxNetworkFee,
      config.fundingMinimumProofValidityBlocks,
      journal,
    ).fund();
  } finally {
    journal.close();
  }
}
