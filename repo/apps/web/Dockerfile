FROM node:22-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json* ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm config set fetch-retries 5 && npm config set fetch-retry-mintimeout 2000 && npm config set fetch-retry-maxtimeout 120000 && npm install

FROM dependencies AS builder
ARG NEXT_PUBLIC_API_URL=/api/gw
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_PORTAL_URL=https://apps.physicalrisk.com
ENV NEXT_PUBLIC_PORTAL_URL=$NEXT_PUBLIC_PORTAL_URL
ARG KEYCLOAK_CLIENT_ID=physicalrisk-repo
ARG KEYCLOAK_CLIENT_SECRET=build-time-placeholder
ENV KEYCLOAK_CLIENT_ID=$KEYCLOAK_CLIENT_ID
ENV KEYCLOAK_CLIENT_SECRET=$KEYCLOAK_CLIENT_SECRET
COPY . .
RUN npm install --no-save nanoid && \
  for i in 1 2 3 4 5; do \
    npm run build -w @gateway/web -- --webpack && break || sleep 10; \
  done

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
