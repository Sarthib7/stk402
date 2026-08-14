import { loadPayerConfig } from "./payer-config.js";
import { SqlitePaymentSessionStore } from "./payment-session.js";

try {
  const config = loadPayerConfig();
  const sessions = new SqlitePaymentSessionStore(config.statePath);
  try {
    sessions.acknowledge(config.resourceUrl);
    console.log("Acknowledged completed payment result.");
  } finally {
    sessions.close();
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
