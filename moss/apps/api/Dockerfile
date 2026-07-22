FROM node:20-alpine AS base
RUN apk add --no-cache openssl libc6-compat && corepack enable
WORKDIR /app
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/api/package.json apps/api/package.json
RUN pnpm install --filter @moss/api... --frozen-lockfile=false
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @moss/shared build && pnpm --filter @moss/api prisma:generate && pnpm --filter @moss/api build

FROM node:20-alpine AS runner
RUN apk add --no-cache openssl libc6-compat && corepack enable
WORKDIR /app
ENV NODE_ENV=production
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/packages/shared ./packages/shared
COPY --from=base /app/apps/api ./apps/api
COPY --from=base /app/package.json /app/pnpm-workspace.yaml ./
WORKDIR /app/apps/api
EXPOSE 4000
CMD ["sh", "-c", "pnpm prisma:migrate && pnpm prisma:seed && node dist/main.js"]
