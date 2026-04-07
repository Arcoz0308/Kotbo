# Stage 1: Build stage
FROM oven/bun:latest-alpine AS builder

WORKDIR /app

# Copy monorepo root configuration
COPY package.json bun.lock tsconfig.json bunfig.toml ./

# Copy dependency definitions for caching
COPY packages/database/package.json packages/database/
COPY apps/bot/package.json apps/bot/

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source code
COPY packages/database packages/database
COPY apps/bot apps/bot

# Generate Prisma client
RUN bun run db:generate

# Stage 2: Runtime stage
FROM oven/bun:latest-alpine

WORKDIR /app

# Copy only necessary files for runtime
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/packages/database ./packages/database
COPY --from=builder /app/apps/bot ./apps/bot

ENV NODE_ENV=production

# Run migrations/deploy commands and start the bot
CMD ["sh", "-c", "bun run --filter @kotbo/bot deploy-commands && bun run --filter @kotbo/bot start"]
