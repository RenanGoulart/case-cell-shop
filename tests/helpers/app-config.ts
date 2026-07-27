import "dotenv/config";

import { loadConfig, type AppConfig } from "@/config/env.js";

export function testAppConfig(): AppConfig {
  return loadConfig();
}
