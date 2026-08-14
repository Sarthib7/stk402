import { x402Client, x402HTTPClient } from "@x402/core/client";
import type { SettleResponse } from "@x402/core/types";

import {
  PrivateExactClient,
  type PrivateReceiptCreator,
} from "./signed-receipt.js";
import type { PaymentSessionStore } from "./payment-session.js";

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
): Promise<PaidResourceResult> {
  const client = new x402HTTPClient(
    new x402Client().register(network, new PrivateExactClient(receiptCreator)),
  );
  let session = sessions.load(resourceUrl);
  if (session?.state === "completed") return session.result;
  if (!session) {
    const unpaid = await fetcher(resourceUrl, { redirect: "error" });
    if (unpaid.status !== 402) {
      throw new Error(`resource returned ${unpaid.status} before payment`);
    }
    const unpaidBody = await responseBody(unpaid);
    const candidate = client.getPaymentRequiredResponse(
      (name) => unpaid.headers.get(name),
      unpaidBody,
    );
    if (new URL(candidate.resource.url).toString() !== resourceUrl) {
      throw new Error("payment challenge resource mismatch");
    }
    session = sessions.claim(resourceUrl, candidate);
    if (session.state === "completed") return session.result;
  }
  const paymentRequired = session.paymentRequired;
  if (new URL(paymentRequired.resource.url).toString() !== resourceUrl) {
    throw new Error("payment challenge resource mismatch");
  }

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
