FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
COPY apps/api/package.json apps/api/package.json
RUN npm config set fetch-retries 5 && npm config set fetch-retry-mintimeout 2000 && npm config set fetch-retry-maxtimeout 120000 && npm install
COPY . .
RUN rm -f apps/api/*.tsbuildinfo apps/api/dist/*.tsbuildinfo && npm run build -w @gateway/api
WORKDIR /app/apps/api
CMD ["node", "dist/main.js"]
