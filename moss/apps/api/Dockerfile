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
COPY --from=base /app/package.json /app/pnpm-workspace.yaml /app/tsconfig.base.json ./
WORKDIR /app/apps/api
EXPOSE 4000
CMD ["sh", "-c", "pnpm prisma:migrate || (echo 'migrate deploy failed — attempting non-destructive db push bootstrap for empty/legacy DBs'; pnpm prisma:db-push && pnpm exec prisma migrate resolve --applied 20260720_espocrm_integration && pnpm exec prisma migrate resolve --applied 20260720_smtp_system_settings && pnpm exec prisma migrate resolve --applied 20260809180000_moss_m1_data_foundation && pnpm exec prisma migrate resolve --applied 20260809193000_moss_remaining_framework); pnpm prisma:seed && node dist/main.js"]