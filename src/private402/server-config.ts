import type { Network } from "@x402/core/types";
import { createPublicKey, type KeyObject } from "node:crypto";
import { validateAndParseAddress } from "starknet";

import {
  loadNetworkConfig,
  loadIndexerServiceUrl,
  type NetworkName,
} from "../config.js";
import type { RequiredFinality } from "./rpc-finality.js";
import {
  envelopeKeyId,
  parseEnvelopePrivateKey,
  parseEnvelopePublicKey,
} from "./private-envelope.js";

export interface PaidServerConfig {
  network: Exclude<NetworkName, "devnet">;
  x402Network: Network;
  rpcUrl: string;
  expectedChainId: string;
  poolAddress: string;
  indexerUrl: string;
  recipient: string;
  viewingKey: bigint;
  token: string;
  amount: bigint;
  ledgerPath: string;
  publicOrigin: URL;
  host: string;
  port: number;
  requiredFinality: RequiredFinality;
  maxOutstandingInvoices: number;
  invoiceTimeoutSeconds: number;
  envelopePrivateKey: KeyObject;
  envelopePublicKey: KeyObject;
  authorizedClientEnvelopePublicKey: string;
}

function required(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function positiveBigInt(environment: NodeJS.ProcessEnv, name: string): bigint {
  let value: bigint;
  try {
    value = BigInt(required(environment, name));
  } catch {
    throw new Error(`${name} must be an integer`);
  }
  if (value <= 0n) throw new Error(`${name} must be positive`);
  return value;
}

function positiveSafeInteger(
  environment: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
): number {
  const raw = environment[name]?.trim();
  const value = raw === undefined || raw === "" ? fallback : Number(raw);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive safe integer`);
  }
  return value;
}

export function publicResourceUrl(requestUrl: string, publicOrigin: URL): string {
  const request = new URL(requestUrl);
  const resource = new URL(publicOrigin);
  resource.pathname = request.pathname;
  resource.search = request.search;
  return resource.toString();
}

export function assertExpectedChainId(actual: string, expected: string): void {
  if (actual !== expected) {
    throw new Error(`Expected chain ID ${expected}, received ${actual}`);
  }
}

export function loadPaidServerConfig(
  environment: NodeJS.ProcessEnv = process.env,
): PaidServerConfig {
  const network = loadNetworkConfig(environment);
  if (network.network === "devnet") {
    throw new Error("serve:paid supports sepolia or mainnet");
  }
  const indexerUrl = loadIndexerServiceUrl(environment);
  const recipient = validateAndParseAddress(
    required(environment, "STK402_RECIPIENT_ADDRESS"),
  );
  const token = validateAndParseAddress(
    required(environment, "STK402_PAYMENT_TOKEN"),
  );
  const viewingKey = positiveBigInt(
    environment,
    "STK402_RECIPIENT_VIEWING_KEY",
  );
  if (viewingKey >= 2n ** 251n) {
    throw new Error("STK402_RECIPIENT_VIEWING_KEY must be a felt");
  }
  const amount = positiveBigInt(environment, "STK402_PAYMENT_AMOUNT");
  if (amount >= 2n ** 128n) {
    throw new Error("STK402_PAYMENT_AMOUNT must fit in u128");
  }
  const ledgerPath = required(environment, "STK402_LEDGER_PATH");
  if (ledgerPath === ":memory:") {
    throw new Error("STK402_LEDGER_PATH must use a filesystem path");
  }

  const publicOrigin = new URL(
    required(environment, "STK402_PUBLIC_ORIGIN"),
  );
  if (publicOrigin.protocol !== "https:") {
    throw new Error("STK402_PUBLIC_ORIGIN must use HTTPS");
  }
  publicOrigin.pathname = "/";
  publicOrigin.search = "";
  publicOrigin.hash = "";

  const port = positiveSafeInteger(environment, "STK402_PORT", 3402);
  if (port > 65_535) throw new Error("STK402_PORT must be at most 65535");
  const envelopePrivateKey = parseEnvelopePrivateKey(
    required(environment, "STK402_ENVELOPE_PRIVATE_KEY"),
  );
  const envelopePublicKey = parseEnvelopePublicKey(
    required(environment, "STK402_ENVELOPE_PUBLIC_KEY"),
  );
  const authorizedClientEnvelopePublicKey = required(
    environment,
    "STK402_AUTHORIZED_CLIENT_ENVELOPE_PUBLIC_KEY",
  );
  parseEnvelopePublicKey(authorizedClientEnvelopePublicKey);
  if (
    envelopeKeyId(createPublicKey(envelopePrivateKey)) !==
    envelopeKeyId(envelopePublicKey)
  ) {
    throw new Error("STK402 envelope keys do not match");
  }

  return {
    network: network.network,
    x402Network:
      network.network === "mainnet"
        ? "starknet:SN_MAIN"
        : "starknet:SN_SEPOLIA",
    rpcUrl: network.rpcUrl,
    expectedChainId: network.expectedChainId,
    poolAddress: network.poolAddress,
    indexerUrl,
    recipient,
    viewingKey,
    token,
    amount,
    ledgerPath,
    publicOrigin,
    host: environment.STK402_HOST?.trim() || "127.0.0.1",
    port,
    requiredFinality: "l2",
    maxOutstandingInvoices: positiveSafeInteger(
      environment,
      "STK402_MAX_OUTSTANDING_INVOICES",
      1_000,
    ),
    invoiceTimeoutSeconds: positiveSafeInteger(
      environment,
      "STK402_INVOICE_TIMEOUT_SECONDS",
      900,
    ),
    envelopePrivateKey,
    envelopePublicKey,
    authorizedClientEnvelopePublicKey,
  };
}
