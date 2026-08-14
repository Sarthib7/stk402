import { x402Client, x402HTTPClient } from "@x402/core/client";
import type { SettleResponse } from "@x402/core/types";
import { decodePaymentRequiredHeader } from "@x402/core/http";
import type { KeyObject } from "node:crypto";

import {
  PrivateEnvelopeClient,
  PrivateExactClient,
  type PrivateReceiptCreator,
} from "./signed-receipt.js";
import type { PaymentSessionStore } from "./payment-session.js";
import {
  CLIENT_KEY_HEADER,
  PRIVATE_ENVELOPE_SCHEME,
  openPaymentTerms,
  type ClientEnvelopeKey,
  type SealedValue,
} from "./private-envelope.js";

export interface PaidResourceResult {
  status: number;
  body: unknown;
  settlement: SettleResponse;
}

async function responseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  return contentType.includes("application/json")
    ? response.json()
    : response.text();
}

export async function payResource(
  resourceUrl: string,
  network: "starknet:SN_MAIN" | "starknet:SN_SEPOLIA",
  receiptCreator: PrivateReceiptCreator,
  sessions: PaymentSessionStore,
  fetcher: typeof fetch = fetch,
  serverEnvelopePublicKey?: KeyObject,
  clientEnvelopeKey?: ClientEnvelopeKey,
): Promise<PaidResourceResult> {
  let session = sessions.load(resourceUrl);
  if (session?.state === "completed") return session.result;
  if (!session) {
    if (serverEnvelopePublicKey && !clientEnvelopeKey) {
      throw new Error("client envelope key is required");
    }
    const clientKey = serverEnvelopePublicKey ? clientEnvelopeKey! : null;
    const unpaid = await fetcher(resourceUrl, {
      redirect: "error",
      ...(clientKey
        ? { headers: { [CLIENT_KEY_HEADER]: clientKey.publicKeyHeader } }
        : {}),
    });
    if (unpaid.status !== 402) {
      throw new Error(`resource returned ${unpaid.status} before payment`);
    }
    await responseBody(unpaid);
    const paymentRequiredHeader = unpaid.headers.get("payment-required");
    if (!paymentRequiredHeader) throw new Error("payment challenge is missing");
    const candidate = decodePaymentRequiredHeader(paymentRequiredHeader);
    if (new URL(candidate.resource.url).toString() !== resourceUrl) {
      throw new Error("payment challenge resource mismatch");
    }
    let privateRequirements;
    if (serverEnvelopePublicKey && clientKey) {
      const publicRequirements = candidate.accepts[0];
      const invoiceId = publicRequirements?.extra.invoiceId;
      const expiresAt = publicRequirements?.extra.expiresAt;
      if (
        !publicRequirements ||
        publicRequirements.scheme !== PRIVATE_ENVELOPE_SCHEME ||
        typeof invoiceId !== "string" ||
        typeof expiresAt !== "string"
      ) {
        throw new Error("invalid encrypted payment challenge");
      }
      privateRequirements = openPaymentTerms(
        publicRequirements.extra.terms as unknown as SealedValue,
        {
          invoiceId,
          resourceUrl,
          network: publicRequirements.network,
          asset: publicRequirements.asset,
          maxTimeoutSeconds: publicRequirements.maxTimeoutSeconds,
          expiresAt,
          clientPublicKey: clientKey.publicKeyHeader,
        },
        clientKey.privateKey,
        serverEnvelopePublicKey,
      );
    }
    session = sessions.claim(resourceUrl, candidate, privateRequirements);
    if (session.state === "completed") return session.result;
  }
  const paymentRequired = session.paymentRequired;
  if (new URL(paymentRequired.resource.url).toString() !== resourceUrl) {
    throw new Error("payment challenge resource mismatch");
  }

  const scheme = paymentRequired.accepts[0]?.scheme;
  const schemeClient =
    scheme === PRIVATE_ENVELOPE_SCHEME && session.privateRequirements && serverEnvelopePublicKey
      ? new PrivateEnvelopeClient(
          receiptCreator,
          session.privateRequirements,
          resourceUrl,
          serverEnvelopePublicKey,
        )
      : new PrivateExactClient(receiptCreator);
  const client = new x402HTTPClient(
    new x402Client().register(network, schemeClient),
  );
  const payment = await client.createPaymentPayload(paymentRequired);
  const paid = await fetcher(resourceUrl, {
    redirect: "error",
    headers: client.encodePaymentSignatureHeader(payment),
  });
  const body = await responseBody(paid);
  if (!paid.ok) {
    throw new Error(`paid resource returned ${paid.status}`);
  }
  const settlement = client.getPaymentSettleResponse((name) =>
    paid.headers.get(name),
  );
  if (!settlement.success) throw new Error("payment settlement failed");
  const result = { status: paid.status, body, settlement };
  sessions.complete(resourceUrl, result);
  return result;
}
