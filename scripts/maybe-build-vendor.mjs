#!/usr/bin/env node
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const sdkConfig = "vendor/starknet-privacy/sdk/tsconfig.build.json";

if (process.env.RENDER && process.env.STK402_BUILD_VENDOR !== "1") {
  console.warn(
    "skip vendor build on Render (set STK402_BUILD_VENDOR=1 for the Paid Resource Web Service)",
  );
  process.exit(0);
}

if (!existsSync(sdkConfig)) {
  console.warn("skip vendor build: %s is missing (git submodule not checked out)", sdkConfig);
  process.exit(0);
}

const result = spawnSync("npm", ["run", "build:vendor"], {
  stdio: "inherit",
  shell: false,
});
process.exit(result.status ?? 1);
