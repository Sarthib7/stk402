import assert from "node:assert/strict";
import test from "node:test";

import {
  IndexerDiscoveryProvider,
  ProvingServiceProofProvider,
  createPrivateTransfers,
} from "@starkware-libs/starknet-privacy-sdk";

test("loads the STRK20 runtime exports needed by the mainnet spike", () => {
  assert.equal(typeof createPrivateTransfers, "function");
  assert.equal(typeof IndexerDiscoveryProvider, "function");
  assert.equal(typeof ProvingServiceProofProvider, "function");
});
