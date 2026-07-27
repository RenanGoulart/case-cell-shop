FROM node:24-bookworm-slim AS base

RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:24-bookworm-slim AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=base /app/package*.json ./
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/dist ./dist
COPY --from=base /app/src ./src
COPY --from=base /app/prisma ./prisma
COPY --from=base /app/prisma.config.ts ./prisma.config.ts
COPY --from=base /app/eslint.config.mjs ./eslint.config.mjs
COPY --from=base /app/.prettierrc.json ./.prettierrc.json
COPY --from=base /app/tsconfig.json ./tsconfig.json
COPY --from=base /app/vitest.config.ts ./vitest.config.ts
COPY --from=base /app/docker-compose.yml ./docker-compose.yml
COPY --from=base /app/tests ./tests
COPY --from=base /app/specs ./specs

EXPOSE 3000 9091

CMD ["node", "dist/src/api/main.js"]
