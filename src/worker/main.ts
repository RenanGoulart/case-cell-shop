import { loadConfig } from "../config/env.js";
import { createLogger } from "../observability/logger.js";
import { createWorkerMetricsRegistry } from "../observability/metrics.js";

const config = loadConfig();
const logger = createLogger(config.logLevel).child({ component: "worker" });
const metrics = createWorkerMetricsRegistry();

logger.info(
  {
    metricsContentType: metrics.contentType,
    metricsPort: config.workerMetricsPort,
  },
  "worker lifecycle initialized",
);
