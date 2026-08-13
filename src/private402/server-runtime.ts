import { IndexerDiscoveryProvider } from "@starkware-libs/starknet-privacy-sdk";
import { x402Facilitator } from "@x402/core/facilitator";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { RpcProvider } from "starknet";

import { SqliteClaimLedger } from "./claim-ledger.js";
import { createHandlerServer } from "./http-server.js";
import { createPaidSha256Handler } from "./paid-sha256.js";
import { RpcFinalityChecker } from "./rpc-finality.js";
import {
  assertExpectedChainId,
  publicResourceUrl,
  type PaidServerConfig,
} from "./server-config.js";
import { PrivateExactFacilitator } from "./signed-receipt.js";
import { StarknetReceiptSignatureVerifier } from "./starknet-signature-verifier.js";
import { Strk20HistoryEvidenceReader } from "./strk20-history.js";

export async function createPaidServerRuntime(
  config: PaidServerConfig,
  dependencies?: {
    provider?: RpcProvider;
    indexer?: IndexerDiscoveryProvider;
  },
) {
  const provider =
    dependencies?.provider ?? new RpcProvider({ nodeUrl: config.rpcUrl });
  const chainId = await provider.getChainId();
  assertExpectedChainId(chainId, config.expectedChainId);
  const indexer =
    dependencies?.indexer ??
    new IndexerDiscoveryProvider(config.indexerUrl, config.poolAddress, {
      ohttp: true,
    });

  mkdirSync(dirname(config.ledgerPath), { recursive: true });
  const ledger = new SqliteClaimLedger(config.ledgerPath);
  const finality = new RpcFinalityChecker(provider, config.requiredFinality);
  const evidenceReader = new Strk20HistoryEvidenceReader(
    indexer,
    BigInt(config.recipient),
    config.viewingKey,
    (transactionHash) => finality.isFinal(transactionHash),
  );
  const mechanism = new PrivateExactFacilitator({
    ledger,
    evidenceReader,
    signatureVerifier: new StarknetReceiptSignatureVerifier(provider),
  });
  const facilitator = new x402Facilitator().register(
    config.x402Network,
    mechanism,
  );
  const handler = createPaidSha256Handler({
    network: config.x402Network,
    token: config.token,
    amount: config.amount,
    recipient: config.recipient,
    facilitator,
    maxOutstandingInvoices: config.maxOutstandingInvoices,
    resourceUrl: (request) =>
      publicResourceUrl(request.url, config.publicOrigin),
  });

  return {
    handler,
    server: createHandlerServer(handler),
    close: () => ledger.close(),
  };
}
