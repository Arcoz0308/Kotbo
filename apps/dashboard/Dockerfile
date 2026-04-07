# Build stage
FROM oven/bun:1-alpine AS builder

WORKDIR /app

# Copy root monorepo config
COPY package.json bun.lock tsconfig.json bunfig.toml ./

# Copy dashboard package.json
COPY apps/dashboard/package.json apps/dashboard/
COPY apps/bot/package.json apps/bot/
COPY packages/database/package.json packages/database/

# Install dependencies (only for the dashboard)
RUN bun install --frozen-lockfile

# Copy dashboard source
COPY apps/dashboard apps/dashboard

# Build the Svelte app
WORKDIR /app/apps/dashboard
RUN bun run build

# Production stage
FROM nginx:alpine

# Copy built files from builder
COPY --from=builder /app/apps/dashboard/dist /usr/share/nginx/html

# Copy custom Nginx config for SPA routing
COPY apps/dashboard/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
