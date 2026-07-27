import fastifySwagger from "@fastify/swagger";
import fastifySwaggerUi from "@fastify/swagger-ui";
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "@fastify/type-provider-zod";
import Fastify from "fastify";

import { RedisCatalogCache } from "../adapters/cache/catalog-cache.js";
import { createRedisClientAdapter } from "../adapters/cache/redis-client.js";
import { PrismaCatalogRepository } from "../adapters/database/catalog-repository.js";
import { createPrismaClient } from "../adapters/database/prisma.js";
import type { AppConfig } from "../config/env.js";
import { ListProductsUseCase } from "../modules/catalog/application/list-products.js";
import { createCatalogMetrics } from "../observability/catalog-metrics.js";
import { createLogger } from "../observability/logger.js";
import { createApiMetricsRegistry } from "../observability/metrics.js";
import {
  createProductsHandler,
  productsRouteSchema,
  type ProductsRouteDependencies,
} from "./routes/products.js";
import { systemSleeper } from "../shared/ports/runtime.js";

export interface AppDependencies {
  readonly products?: ProductsRouteDependencies;
}

export async function buildApp(config: AppConfig, dependencies: AppDependencies = {}) {
  const app = Fastify({
    loggerInstance: createLogger(config.logLevel),
    genReqId: (request) => {
      const header = request.headers["x-request-id"];
      return typeof header === "string" && header.length > 0 ? header : crypto.randomUUID();
    },
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.addHook("onRequest", (request, reply, done) => {
    const correlationHeader = request.headers["x-correlation-id"];
    const correlationId =
      typeof correlationHeader === "string" && correlationHeader.length > 0
        ? correlationHeader
        : crypto.randomUUID();

    reply.header("x-request-id", request.id);
    reply.header("x-correlation-id", correlationId);
    done();
  });

  await app.register(fastifySwagger, {
    openapi: {
      info: {
        title: "CaseCellShop Backend",
        version: "0.1.0",
      },
    },
    transform: jsonSchemaTransform,
  });

  await app.register(fastifySwaggerUi, {
    routePrefix: "/documentation",
  });

  const metrics = createApiMetricsRegistry();
  app.get("/health", () => ({ status: "ok" }));
  app.get("/metrics", (_request, reply) => {
    reply.header("content-type", metrics.contentType);
    return metrics.metrics();
  });

  const productRouteDependencies =
    dependencies.products ?? createDefaultProductsRouteDependencies(config, metrics.registry);
  app.get(
    "/products",
    { schema: productsRouteSchema },
    createProductsHandler(productRouteDependencies),
  );

  return app;
}

function createDefaultProductsRouteDependencies(
  config: AppConfig,
  registry: ReturnType<typeof createApiMetricsRegistry>["registry"],
): ProductsRouteDependencies {
  const prisma = createPrismaClient(config.databaseUrl);
  const redis = createRedisClientAdapter(config.redisUrl);
  const repository = new PrismaCatalogRepository(prisma);
  const cache = new RedisCatalogCache(redis);
  const catalogMetrics = createCatalogMetrics(registry);

  return {
    listProducts: new ListProductsUseCase(
      {
        repository,
        cache,
        metrics: catalogMetrics,
        sleeper: systemSleeper,
      },
      {
        ttlSeconds: config.catalogCacheTtlSeconds,
        databaseArtificialDelayMs: config.catalogDbArtificialDelayMs,
      },
    ),
  };
}
