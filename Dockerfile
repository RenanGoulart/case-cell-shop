FROM node:24-bookworm-slim AS base

RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ARG DATABASE_URL
ENV DATABASE_URL=${DATABASE_URL}

FROM base AS deps

COPY package*.json ./
RUN npm ci

FROM deps AS build

COPY . .
RUN npm run build

FROM base AS prod-deps

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev --omit=optional

FROM base AS runtime

ENV NODE_ENV=production

COPY --from=prod-deps /app/package*.json ./
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma/schema.prisma ./prisma/schema.prisma
COPY --from=build /app/prisma/migrations ./prisma/migrations

EXPOSE 3000 9091

CMD ["node", "dist/src/api/main.js"]

FROM build AS migrate

CMD ["sh", "-c", "npm run prisma:migrate && npm run prisma:seed"]

FROM build AS test

CMD ["npm", "run", "verify"]
