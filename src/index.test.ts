import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CLIENT_KEY_HEADER,
  DEFAULT_STRK20_POOL_ADDRESS,
  PRIVATE_ENVELOPE_SCHEME,
  PRIVATE_EXACT_SCHEME,
  SEPOLIA_STRK20_POOL_ADDRESS,
  SN_MAIN,
  SN_SEPOLIA,
} from "./index.js";

test("sdk barrel exports scheme constants and pool defaults", () => {
  assert.equal(PRIVATE_EXACT_SCHEME, "exact-private");
  assert.equal(PRIVATE_ENVELOPE_SCHEME, "exact-private-envelope-v1");
  assert.equal(CLIENT_KEY_HEADER, "stk402-client-key");
  assert.equal(SN_MAIN, "0x534e5f4d41494e");
  assert.equal(SN_SEPOLIA, "0x534e5f5345504f4c4941");
  assert.match(DEFAULT_STRK20_POOL_ADDRESS, /^0x/);
  assert.match(SEPOLIA_STRK20_POOL_ADDRESS, /^0x/);
});
