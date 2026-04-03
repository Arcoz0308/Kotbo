FROM oven/bun:latest AS builder

WORKDIR /app

COPY package.json bun.lock tsconfig.json bunfig.toml ./

COPY packages/database/package.json packages/database/
COPY apps/bot/package.json apps/bot/

COPY packages/database/prisma packages/database/prisma

RUN bun install --frozen-lockfile

COPY . .

RUN bun run db:generate

FROM oven/bun:latest

WORKDIR /app

COPY --from=builder /app /app

ENV NODE_ENV=production
CMD ["bun","deploy-commands", "&&", "bun", "run", "--filter", "@kotbo/bot", "start"]
