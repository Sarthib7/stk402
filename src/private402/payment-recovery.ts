import { num } from "starknet";

import type { PayerJournal } from "./payer-journal.js";
import type { PaymentSessionStore } from "./payment-session.js";
import { invoiceExpiresAt } from "./signed-receipt.js";

export function clearUnstartedPayment(
  resourceUrl: string,
  sessions: PaymentSessionStore,
  journal: PayerJournal,
  now: number,
  allowedClockSkewMs: number,
): void {
  const session = sessions.load(resourceUrl);
  if (!session) throw new Error("payment session is missing");
  if (session.state !== "pending") {
    throw new Error("completed payment requires acknowledgement");
  }
  const requirements = session.paymentRequired.accepts[0];
  if (!requirements) throw new Error("stored payment session has no requirements");
  if (now <= invoiceExpiresAt(requirements) + allowedClockSkewMs) {
    throw new Error("payment session is not expired beyond clock skew");
  }
  const invoiceValue = requirements.extra.invoiceId;
  if (typeof invoiceValue !== "string") {
    throw new Error("stored payment session has no invoice ID");
  }
  const invoiceId = num.toHex(invoiceValue);
  if (journal.inspect(invoiceId)) {
    throw new Error("payment attempt exists and requires chain reconciliation");
  }
  sessions.clearPending(resourceUrl);
}
