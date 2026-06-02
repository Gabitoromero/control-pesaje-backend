# Stage 1: Build TypeScript code
FROM node:20-alpine AS builder
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
COPY backend/package.json backend/pnpm-lock.yaml backend/tsconfig.json backend/mikro-orm.config.ts ./
COPY backend/src ./src
# Copiamos la carpeta shared real encima del symlink roto
COPY shared ./src/shared
RUN pnpm install --frozen-lockfile
RUN pnpm build

# Stage 2: Install production dependencies
FROM node:20-alpine AS prod-deps
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
COPY backend/package.json backend/pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile

# Stage 3: Run the application
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/package.json ./
COPY --from=builder /app/mikro-orm.config.ts ./
COPY --from=builder /app/dist ./dist
COPY --from=prod-deps /app/node_modules ./node_modules

EXPOSE 3000
CMD ["node", "dist/src/index.js"]
