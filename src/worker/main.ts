import { createPrismaClient } from "../adapters/database/prisma.js";
import { PrismaProcessingRepository } from "../adapters/database/processing-repository.js";
import {
  createRabbitMqAdapter,
  orderProcessingQueue,
  RabbitMqOrderPublisher,
} from "../adapters/messaging/rabbitmq.js";
import { SimulatedErpClient } from "../adapters/erp/simulated-erp-client.js";
import { loadConfig } from "../config/env.js";
import { createLogger } from "../observability/logger.js";
import { createWorkerMetricsRegistry } from "../observability/metrics.js";
import {
  cryptoUuidGenerator,
  mathRandomGenerator,
  systemClock,
  systemSleeper,
} from "../shared/ports/runtime.js";
import { OrderConsumer } from "./order-consumer.js";
import { OutboxPublisher } from "./outbox-publisher.js";
import { RecoverySweeper } from "./recovery-sweeper.js";
import { ReservationExpirer } from "./reservation-expirer.js";
import { startWorkerMetricsServer } from "./metrics-server.js";

const config = loadConfig();
const logger = createLogger(config.logLevel).child({ component: "worker" });
const metrics = createWorkerMetricsRegistry();

logger.info(
  {
    metricsContentType: metrics.contentType,
    metricsPort: config.workerMetricsPort,
  },
  "worker lifecycle initializing",
);

async function runWorker(): Promise<void> {
  const prisma = createPrismaClient(config.databaseUrl);
  const rabbitMq = await createRabbitMqAdapter(config.rabbitMqUrl);
  const repository = new PrismaProcessingRepository(prisma);
  const publisher = new OutboxPublisher({
    repository,
    publisher: new RabbitMqOrderPublisher(rabbitMq.channel),
    clock: systemClock,
    uuidGenerator: cryptoUuidGenerator,
    batchSize: 10,
    leaseMs: 30_000,
    metrics: metrics.worker,
  });
  const consumer = new OrderConsumer({
    repository,
    erpClient: new SimulatedErpClient({
      mode: config.erpMode,
      randomGenerator: mathRandomGenerator,
      sleeper: systemSleeper,
      timeoutMs: config.erpAttemptTimeoutSeconds * 1_000,
    }),
    maxAttempts: config.erpMaxAttempts,
    retryDelayMs: config.erpRetryDelaySeconds * 1_000,
    metrics: metrics.worker,
    logger,
  });
  const expirer = new ReservationExpirer({
    repository,
    clock: systemClock,
    metrics: metrics.worker,
  });
  const recoverySweeper = new RecoverySweeper({
    repository,
    clock: systemClock,
    maxAttempts: config.erpMaxAttempts,
    retryDelayMs: config.erpRetryDelaySeconds * 1_000,
  });

  const metricsServer = await startWorkerMetricsServer({
    host: config.workerMetricsHost,
    port: config.workerMetricsPort,
    metrics,
  });

  await rabbitMq.channel.consume(
    orderProcessingQueue,
    (message) => {
      void (async () => {
        if (message === null) {
          return;
        }

        try {
          const payload: unknown = JSON.parse(message.content.toString("utf8"));
          const result = await consumer.handle(payload);

          if (result.action === "dead_letter") {
            rabbitMq.channel.reject(message, false);
            return;
          }

          rabbitMq.channel.ack(message);
        } catch (error) {
          logger.error({ error }, "worker failed to process RabbitMQ message");
          rabbitMq.channel.nack(message, false, true);
        }
      })();
    },
    { noAck: false },
  );

  const timers = [
    setInterval(() => {
      void publisher.runOnce().catch((error: unknown) => {
        logger.error({ error }, "outbox publisher tick failed");
      });
    }, 1_000),
    setInterval(() => {
      void expirer.runOnce().catch((error: unknown) => {
        logger.error({ error }, "reservation expirer tick failed");
      });
    }, 5_000),
    setInterval(() => {
      void recoverySweeper.runOnce().catch((error: unknown) => {
        logger.error({ error }, "recovery sweeper tick failed");
      });
    }, 10_000),
  ];

  const shutdown = async () => {
    logger.info("worker shutdown requested");
    for (const timer of timers) {
      clearInterval(timer);
    }
    await metricsServer.close();
    await rabbitMq.close();
    await prisma.$disconnect();
  };

  process.once("SIGINT", () => {
    void shutdown().finally(() => process.exit(0));
  });
  process.once("SIGTERM", () => {
    void shutdown().finally(() => process.exit(0));
  });

  logger.info("worker lifecycle initialized");
}

void runWorker().catch((error: unknown) => {
  logger.fatal({ error }, "worker startup failed");
  process.exit(1);
});
