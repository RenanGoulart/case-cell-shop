import { randomUUID } from "node:crypto";

import Fastify from "fastify";

import type { MetricsRegistry } from "../observability/metrics.js";

export interface WorkerMetricsServerOptions {
  readonly host: string;
  readonly port: number;
  readonly metrics: MetricsRegistry;
}

export interface WorkerMetricsServer {
  readonly url: string;
  close(): Promise<void>;
}

export async function startWorkerMetricsServer(
  options: WorkerMetricsServerOptions,
): Promise<WorkerMetricsServer> {
  const app = Fastify({ logger: false });

  app.addHook("onRequest", (request, reply, done) => {
    const requestId = request.headers["x-request-id"] ?? randomUUID();
    const correlationId = request.headers["x-correlation-id"] ?? requestId;

    reply.header("x-request-id", requestId);
    reply.header("x-correlation-id", correlationId);

    done();
  });

  app.get("/health", () => ({ status: "ok" }));
  app.get("/metrics", (_request, reply) => {
    reply.header("content-type", options.metrics.contentType);
    return options.metrics.metrics();
  });

  const address = await app.listen({ host: options.host, port: options.port });

  return {
    url: address,
    close: () => app.close(),
  };
}
