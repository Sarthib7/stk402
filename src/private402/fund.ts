import { loadFundingConfig } from "./payer-config.js";
import { runFunding } from "./payer-runtime.js";

try {
  const transactionHash = await runFunding(loadFundingConfig());
  process.stdout.write(`${JSON.stringify({ transactionHash })}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
