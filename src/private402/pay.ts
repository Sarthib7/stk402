import { loadPayerConfig } from "./payer-config.js";
import { runPayer } from "./payer-runtime.js";

try {
  const result = await runPayer(loadPayerConfig());
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
