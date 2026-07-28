import { buildApp } from "./app.js";
import { loadConfig } from "../config/env.js";

const config = loadConfig();
const app = await buildApp(config);
let shuttingDown = false;

async function shutdown(signal: "SIGINT" | "SIGTERM") {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  app.log.info({ signal }, "api shutdown requested");
  await app.close();
}

process.once("SIGINT", () => {
  void shutdown("SIGINT").finally(() => process.exit(0));
});

process.once("SIGTERM", () => {
  void shutdown("SIGTERM").finally(() => process.exit(0));
});

try {
  await app.listen({ host: config.apiHost, port: config.apiPort });
} catch (error) {
  app.log.error({ error }, "failed to start API");
  await app.close();
  process.exitCode = 1;
}
