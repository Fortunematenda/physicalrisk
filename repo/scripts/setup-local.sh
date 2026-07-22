#!/usr/bin/env sh
set -eu
[ -f .env ] || cp .env.example .env
npm install
docker compose up -d postgres
npm run db:generate
npm run db:migrate
npm run db:seed
echo "Setup complete. Run: npm run dev"
