/**
 * Public Agent Payer SDK surface for stk402.
 * Prefer these imports from app code, MCP, and skills.
 */

export {
  loadNetworkConfig,
  loadProductionServicesConfig,
  loadIndexerServiceUrl,
  SN_MAIN,
  SN_SEPOLIA,
  DEFAULT_STRK20_POOL_ADDRESS,
  SEPOLIA_STRK20_POOL_ADDRESS,
  type NetworkConfig,
  type NetworkName,
  type ProductionServicesConfig,
} from "./config.js";

export {
  payResource,
  type PaidResourceResult,
} from "./private402/pay-resource.js";

export {
  loadPayerConfig,
  loadFundingConfig,
  type PayerConfig,
  type PayerRuntimeConfig,
  type FundingConfig,
} from "./private402/payer-config.js";

export {
  runPayer,
  runFunding,
} from "./private402/payer-runtime.js";

export {
  loadPaidServerConfig,
  type PaidServerConfig,
} from "./private402/server-config.js";

export { PRIVATE_EXACT_SCHEME } from "./private402/signed-receipt.js";

export {
  PRIVATE_ENVELOPE_SCHEME,
  CLIENT_KEY_HEADER,
} from "./private402/private-envelope.js";
