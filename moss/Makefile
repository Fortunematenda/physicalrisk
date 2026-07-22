install:
	corepack enable && pnpm install

dev:
	pnpm dev

build:
	pnpm build

up:
	docker compose up -d --build

down:
	docker compose down

logs:
	docker compose logs -f --tail=200

seed:
	docker compose exec api pnpm prisma:seed
