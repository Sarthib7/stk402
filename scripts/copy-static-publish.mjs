#!/usr/bin/env node
import { cpSync, existsSync, rmSync } from "node:fs";

const source = "web/dist";
if (!existsSync(`${source}/index.html`)) {
  throw new Error(`missing ${source}/index.html; Consumer Vite build did not run`);
}

for (const destination of ["dist", "build"]) {
  rmSync(destination, { recursive: true, force: true });
  cpSync(source, destination, { recursive: true });
  console.log("copied %s -> %s", source, destination);
}
