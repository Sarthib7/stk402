import { createPaidServerRuntime } from "./server-runtime.js";
import { loadPaidServerConfig } from "./server-config.js";

const config = loadPaidServerConfig();
const runtime = await createPaidServerRuntime(config);
const server = runtime.server;

server.listen(config.port, config.host, () => {
  console.log(
    JSON.stringify({
      status: "listening",
      network: config.network,
      host: config.host,
      port: config.port,
      finality: config.requiredFinality,
    }),
  );
});

function shutdown() {
  const forceClose = setTimeout(() => server.closeAllConnections(), 10_000);
  forceClose.unref();
  server.close(() => {
    clearTimeout(forceClose);
    runtime.close();
    process.exit(0);
  });
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
