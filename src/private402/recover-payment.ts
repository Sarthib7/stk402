import { loadPayerConfig } from "./payer-config.js";
import { SqlitePayerJournal } from "./payer-journal.js";
import { clearUnstartedPayment } from "./payment-recovery.js";
import { SqlitePaymentSessionStore } from "./payment-session.js";

try {
  const config = loadPayerConfig();
  const journal = new SqlitePayerJournal(config.statePath);
  const sessions = new SqlitePaymentSessionStore(config.statePath);
  try {
    clearUnstartedPayment(
      config.resourceUrl,
      sessions,
      journal,
      Date.now(),
      config.allowedClockSkewMs,
    );
    console.log("Cleared unstarted payment session.");
  } finally {
    journal.close();
    sessions.close();
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
