import { createClient, type RedisClientType } from "redis";

export const redisNamespace = "casecellshop:v1";

export type RedisHealthState = "healthy" | "degraded";

export interface RedisClientAdapter {
  readonly client: RedisClientType;
  healthState: RedisHealthState;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  markDegraded(error?: unknown): void;
  markHealthy(): void;
}

export function createRedisClientAdapter(redisUrl: string): RedisClientAdapter {
  const client = createClient({ url: redisUrl });

  return {
    client,
    healthState: "healthy",
    async connect() {
      if (!client.isOpen) {
        await client.connect();
      }
    },
    async disconnect() {
      if (client.isOpen) {
        await client.quit();
      }
    },
    markDegraded(error?: unknown) {
      void error;
      this.healthState = "degraded";
    },
    markHealthy() {
      this.healthState = "healthy";
    },
  };
}
