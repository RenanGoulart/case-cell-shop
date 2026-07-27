import { z } from "zod";

export type ErpMode =
  "probabilistic" | "confirmed" | "temporarily_unavailable" | "unavailable" | "timeout";

export interface AppConfig {
  readonly nodeEnv: "development" | "test" | "production";
  readonly logLevel: string;
  readonly apiHost: string;
  readonly apiPort: number;
  readonly workerMetricsHost: string;
  readonly workerMetricsPort: number;
  readonly databaseUrl: string;
  readonly redisUrl: string;
  readonly rabbitMqUrl: string;
  readonly catalogCacheTtlSeconds: number;
  readonly catalogDbArtificialDelayMs: number;
  readonly idempotencyRetentionHours: number;
  readonly reservationTtlSeconds: number;
  readonly erpAttemptTimeoutSeconds: number;
  readonly erpMaxAttempts: number;
  readonly erpRetryDelaySeconds: number;
  readonly erpMode: ErpMode;
  readonly erpSuccessRate: number;
  readonly erpTemporaryUnavailableRate: number;
  readonly erpUnavailableRate: number;
  readonly erpTimeoutRate: number;
  readonly seedFakerSeed: number;
}

export class ConfigurationError extends Error {
  public override readonly name = "ConfigurationError";
}

const numericString = (name: string) =>
  z.coerce.number({
    error: (issue) => `${name} must be numeric; received ${String(issue.input)}`,
  });

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.string().trim().min(1).default("info"),
  API_HOST: z.string().trim().min(1).default("0.0.0.0"),
  API_PORT: numericString("API_PORT").int().min(1).max(65_535).default(3000),
  WORKER_METRICS_HOST: z.string().trim().min(1).default("0.0.0.0"),
  WORKER_METRICS_PORT: numericString("WORKER_METRICS_PORT").int().min(1).max(65_535).default(9091),
  DATABASE_URL: z.url(),
  REDIS_URL: z.url(),
  RABBITMQ_URL: z.url(),
  CATALOG_CACHE_TTL_SECONDS: numericString("CATALOG_CACHE_TTL_SECONDS")
    .int()
    .positive()
    .default(60),
  CATALOG_DB_ARTIFICIAL_DELAY_MS: numericString("CATALOG_DB_ARTIFICIAL_DELAY_MS")
    .int()
    .nonnegative()
    .default(500),
  IDEMPOTENCY_RETENTION_HOURS: numericString("IDEMPOTENCY_RETENTION_HOURS")
    .int()
    .positive()
    .default(24),
  RESERVATION_TTL_SECONDS: numericString("RESERVATION_TTL_SECONDS").int().positive().default(300),
  ERP_ATTEMPT_TIMEOUT_SECONDS: numericString("ERP_ATTEMPT_TIMEOUT_SECONDS")
    .int()
    .positive()
    .default(60),
  ERP_MAX_ATTEMPTS: numericString("ERP_MAX_ATTEMPTS").int().positive().default(3),
  ERP_RETRY_DELAY_SECONDS: numericString("ERP_RETRY_DELAY_SECONDS").int().positive().default(5),
  ERP_MODE: z
    .enum(["probabilistic", "confirmed", "temporarily_unavailable", "unavailable", "timeout"])
    .default("probabilistic"),
  ERP_SUCCESS_RATE: numericString("ERP_SUCCESS_RATE").min(0).max(1).default(0.8),
  ERP_TEMPORARY_UNAVAILABLE_RATE: numericString("ERP_TEMPORARY_UNAVAILABLE_RATE")
    .min(0)
    .max(1)
    .default(0.1),
  ERP_UNAVAILABLE_RATE: numericString("ERP_UNAVAILABLE_RATE").min(0).max(1).default(0.05),
  ERP_TIMEOUT_RATE: numericString("ERP_TIMEOUT_RATE").min(0).max(1).default(0.05),
  SEED_FAKER_SEED: numericString("SEED_FAKER_SEED").int().positive().default(20260727),
});

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);

  if (!parsed.success) {
    throw new ConfigurationError(formatZodError(parsed.error));
  }

  return {
    nodeEnv: parsed.data.NODE_ENV,
    logLevel: parsed.data.LOG_LEVEL,
    apiHost: parsed.data.API_HOST,
    apiPort: parsed.data.API_PORT,
    workerMetricsHost: parsed.data.WORKER_METRICS_HOST,
    workerMetricsPort: parsed.data.WORKER_METRICS_PORT,
    databaseUrl: parsed.data.DATABASE_URL,
    redisUrl: parsed.data.REDIS_URL,
    rabbitMqUrl: parsed.data.RABBITMQ_URL,
    catalogCacheTtlSeconds: parsed.data.CATALOG_CACHE_TTL_SECONDS,
    catalogDbArtificialDelayMs: parsed.data.CATALOG_DB_ARTIFICIAL_DELAY_MS,
    idempotencyRetentionHours: parsed.data.IDEMPOTENCY_RETENTION_HOURS,
    reservationTtlSeconds: parsed.data.RESERVATION_TTL_SECONDS,
    erpAttemptTimeoutSeconds: parsed.data.ERP_ATTEMPT_TIMEOUT_SECONDS,
    erpMaxAttempts: parsed.data.ERP_MAX_ATTEMPTS,
    erpRetryDelaySeconds: parsed.data.ERP_RETRY_DELAY_SECONDS,
    erpMode: parsed.data.ERP_MODE,
    erpSuccessRate: parsed.data.ERP_SUCCESS_RATE,
    erpTemporaryUnavailableRate: parsed.data.ERP_TEMPORARY_UNAVAILABLE_RATE,
    erpUnavailableRate: parsed.data.ERP_UNAVAILABLE_RATE,
    erpTimeoutRate: parsed.data.ERP_TIMEOUT_RATE,
    seedFakerSeed: parsed.data.SEED_FAKER_SEED,
  };
}

function formatZodError(error: z.ZodError): string {
  const details = error.issues
    .map((issue) => {
      const path = issue.path.join(".") || "environment";
      return `${path}: ${issue.message}`;
    })
    .join("; ");

  return `Invalid environment configuration: ${details}`;
}
