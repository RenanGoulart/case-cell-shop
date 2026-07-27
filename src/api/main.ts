import { buildApp } from "./app.js";
import { loadConfig } from "../config/env.js";

const config = loadConfig();
const app = await buildApp(config);

try {
  await app.listen({ host: config.apiHost, port: config.apiPort });
} catch (error) {
  app.log.error({ error }, "failed to start API");
  process.exitCode = 1;
}
