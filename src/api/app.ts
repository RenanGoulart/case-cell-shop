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
import { PrismaCheckoutRepository } from "../adapters/database/checkout-repository.js";
import { PrismaOrderStatusRepository } from "../adapters/database/order-status-repository.js";
import { createPrismaClient } from "../adapters/database/prisma.js";
import type { AppConfig } from "../config/env.js";
import { InvalidateCatalogUseCase } from "../modules/catalog/application/invalidate-catalog.js";
import { ListProductsUseCase } from "../modules/catalog/application/list-products.js";
import { AcceptCheckoutUseCase } from "../modules/orders/application/accept-checkout.js";
import { GetOrderStatusUseCase } from "../modules/orders/application/get-order-status.js";
import { createCatalogMetrics } from "../observability/catalog-metrics.js";
import { createCheckoutMetrics } from "../observability/checkout-metrics.js";
import { createLogger } from "../observability/logger.js";
import { createApiMetricsRegistry } from "../observability/metrics.js";
import {
  createProductsHandler,
  productsRouteSchema,
  type ProductsRouteDependencies,
} from "./routes/products.js";
import {
  createCheckoutHandler,
  checkoutRouteSchema,
  type CheckoutRouteDependencies,
} from "./routes/checkout.js";
import {
  createOrderStatusHandler,
  orderStatusRouteSchema,
  type OrderStatusRouteDependencies,
} from "./routes/order-status.js";
import { systemSleeper } from "../shared/ports/runtime.js";

export interface AppDependencies {
  readonly products?: ProductsRouteDependencies;
  readonly checkout?: CheckoutRouteDependencies;
  readonly orderStatus?: OrderStatusRouteDependencies;
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

  app.setErrorHandler((error, request, reply) => {
    const maybeRequestError = error as {
      readonly validation?: unknown;
      readonly statusCode?: number;
      readonly code?: string;
    };

    if (maybeRequestError.validation !== undefined || maybeRequestError.statusCode === 400) {
      reply.status(400).send({
        code: "INVALID_REQUEST",
        message:
          maybeRequestError.code === "FST_ERR_CTP_INVALID_JSON_BODY"
            ? "Invalid JSON body"
            : "Invalid request",
        requestId: request.id,
        details: {
          reason:
            maybeRequestError.code === "FST_ERR_CTP_INVALID_JSON_BODY"
              ? "invalid_json"
              : "validation_failed",
        },
      });
      return;
    }

    request.log.error({ err: error }, "unhandled api error");

    reply.status(500).send({
      code: "INTERNAL_ERROR",
      message: "Unexpected internal error",
      requestId: request.id,
    });
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

  const hasDependencyOverrides =
    dependencies.products !== undefined ||
    dependencies.checkout !== undefined ||
    dependencies.orderStatus !== undefined;

  const productRouteDependencies =
    dependencies.products ??
    (hasDependencyOverrides
      ? createStubProductsRouteDependencies()
      : createDefaultProductsRouteDependencies(config, metrics.registry));
  app.get(
    "/products",
    { schema: productsRouteSchema },
    createProductsHandler(productRouteDependencies),
  );

  const checkoutRouteDependencies =
    dependencies.checkout ??
    (hasDependencyOverrides
      ? createStubCheckoutRouteDependencies()
      : createDefaultCheckoutRouteDependencies(config, metrics.registry));
  app.post(
    "/checkout",
    { schema: checkoutRouteSchema },
    createCheckoutHandler(checkoutRouteDependencies),
  );

  const orderStatusRouteDependencies =
    dependencies.orderStatus ??
    (hasDependencyOverrides
      ? createStubOrderStatusRouteDependencies()
      : createDefaultOrderStatusRouteDependencies(config));
  app.get(
    "/orders/:orderId/status",
    { schema: orderStatusRouteSchema },
    createOrderStatusHandler(orderStatusRouteDependencies),
  );

  return app;
}

function createStubProductsRouteDependencies(): ProductsRouteDependencies {
  return {
    listProducts: {
      execute: () => Promise.reject(new Error("Products route dependency not configured")),
    },
  };
}

function createStubCheckoutRouteDependencies(): CheckoutRouteDependencies {
  return {
    acceptCheckout: {
      execute: () => Promise.reject(new Error("Checkout route dependency not configured")),
    },
  };
}

function createStubOrderStatusRouteDependencies(): OrderStatusRouteDependencies {
  return {
    getOrderStatus: {
      execute: () => Promise.reject(new Error("Order status route dependency not configured")),
    },
  };
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

function createDefaultOrderStatusRouteDependencies(
  config: AppConfig,
): OrderStatusRouteDependencies {
  const prisma = createPrismaClient(config.databaseUrl);
  const repository = new PrismaOrderStatusRepository(prisma);

  return {
    getOrderStatus: new GetOrderStatusUseCase(repository),
  };
}

function createDefaultCheckoutRouteDependencies(
  config: AppConfig,
  registry: ReturnType<typeof createApiMetricsRegistry>["registry"],
): CheckoutRouteDependencies {
  const prisma = createPrismaClient(config.databaseUrl);
  const redis = createRedisClientAdapter(config.redisUrl);
  const cache = new RedisCatalogCache(redis);
  const repository = new PrismaCheckoutRepository(prisma);
  const metrics = createCheckoutMetrics(registry);
  return {
    acceptCheckout: new AcceptCheckoutUseCase(
      {
        repository,
        invalidateCatalog: new InvalidateCatalogUseCase(cache),
        idempotencyMetrics: metrics,
      },
      {
        idempotencyRetentionHours: config.idempotencyRetentionHours,
        reservationTtlSeconds: config.reservationTtlSeconds,
      },
    ),
  };
}
