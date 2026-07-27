import "dotenv/config";
import { defineConfig } from "prisma/config";

function requireEnv(name: string): string {
  const value = process.env[name];

  if (value === undefined || value.trim().length === 0) {
    throw new Error(`${name} must be defined in an .env* file before running Prisma commands`);
  }

  return value;
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: requireEnv("DATABASE_URL"),
  },
});
