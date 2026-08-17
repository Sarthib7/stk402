#!/usr/bin/env node
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const sdkConfig = "vendor/starknet-privacy/sdk/tsconfig.build.json";

if (!existsSync(sdkConfig)) {
  console.warn("skip vendor build: %s is missing (git submodule not checked out)", sdkConfig);
  process.exit(0);
}

const result = spawnSync("npm", ["run", "build:vendor"], {
  stdio: "inherit",
  shell: false,
});
process.exit(result.status ?? 1);
