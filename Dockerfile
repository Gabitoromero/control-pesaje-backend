# Stage 1: Build TypeScript code
FROM node:22-alpine AS builder
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml tsconfig.json mikro-orm.config.ts ./
COPY src ./src
RUN pnpm install --frozen-lockfile
RUN pnpm build

# Stage 2: Install production dependencies
FROM node:22-alpine AS prod-deps
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile

# Stage 3: Run the application
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/package.json ./
COPY --from=builder /app/mikro-orm.config.ts ./
COPY --from=builder /app/dist ./dist
COPY --from=prod-deps /app/node_modules ./node_modules

EXPOSE 3000
CMD ["node", "dist/src/index.js"]
