# Physical Risk Repository Import Gateway MVP — VPS Edition

A lightweight, multi-project middleware application built for **RFP-001 v1.1**. It receives approved documents, validates mandatory metadata, resolves the destination project and configured directory, routes the file into the Physical Risk VPS repository, updates the Master Document Index and Version Register, creates document relationships and writes a complete audit trail.

## Scope

This MVP is intentionally limited to Wayne's requested gateway function:

- Receive approved documents from ChatGPT, Claude, Gemini, Microsoft Word, local folders, website publishing workflows and future API sources.
- Reject documents that are not marked `APPROVED`.
- Validate mandatory metadata and permitted file types.
- Read each project's repository directory from the Project Registry.
- Route documents using configurable rules rather than hard-coded project paths.
- Preserve all versions and identify the current version.
- Maintain the Master Document Index, Version Register, relationships and audit logs.
- Store approved files and generated register exports on the VPS filesystem.

It is **not** a document authoring suite, CMS, DMS or enterprise knowledge-management platform.

## Technology

- Frontend: Next.js + TypeScript
- Backend: NestJS + TypeScript
- Database: PostgreSQL + TypeORM
- Repository storage: mounted Ubuntu VPS filesystem
- Reverse proxy: Nginx
- Deployment: Docker Compose

## Quick start

```bash
cp .env.example .env
# Change the passwords and JWT secret in .env
docker compose up --build -d
```

Open:

- Application: `http://YOUR_SERVER_IP:8080`
- Swagger API: `http://YOUR_SERVER_IP:8080/api/docs`
- API health: `http://YOUR_SERVER_IP:8080/api/health`

Default seeded administrator:

```text
Email: admin@physicalrisk.com
Password: CHANGE_ME_DEMO_PASSWORD
```

Change the seeded password before production use.

## VPS storage configuration

The host folder is configured in `.env`:

```env
VPS_REPOSITORY_PATH=/opt/physical-risk/repository-gateway-data
```

Docker mounts that host folder at `/app/storage` inside the API container. The gateway creates:

```text
repository-gateway-data/
├── incoming/
└── repository/
    ├── MOSS/
    │   ├── Product Architecture/
    │   ├── Enterprise Architecture/
    │   ├── Functional Specifications/
    │   ├── Technical Specifications/
    │   ├── API Specifications/
    │   ├── Data Models/
    │   ├── Business Rules/
    │   ├── Governance Standards/
    │   ├── Operating Procedures/
    │   ├── Developer Packs/
    │   ├── Research Library/
    │   ├── Marketing Assets/
    │   ├── Articles/
    │   ├── Templates/
    │   ├── Decisions/
    │   ├── Meeting Records/
    │   ├── Release Notes/
    │   ├── Version Register/
    │   │   ├── version-register.csv
    │   │   └── version-register.json
    │   └── Master Document Index/
    │       ├── master-document-index.csv
    │       └── master-document-index.json
    └── OTHER-PROJECT/
```

A stored document version uses this pattern:

```text
repository/<project-root>/<configured-section>/<document-code>/v<version>/<file>
```

Only relative project and section paths are stored in the Project Registry. Absolute server paths are never embedded in project-specific application logic.

## Import workflow

1. Upload a document exported from an approved source.
2. Select the project and provide or confirm metadata.
3. The API verifies `APPROVED` status.
4. File type, size and mandatory metadata are validated.
5. The Project Registry supplies the project's configured repository directory.
6. A routing rule selects an active repository section.
7. Duplicate checksum and version rules are checked.
8. The approved file is copied into the VPS repository.
9. PostgreSQL records the stable document identity, immutable version, relationships and import outcome.
10. CSV and JSON copies of the Master Document Index and Version Register are regenerated in the project's repository.
11. A complete audit event is recorded.

## Main pages

- Dashboard
- Import Document
- Import Queue
- Import Logs
- VPS Repository Explorer
- Master Document Index
- Version Register
- Document Relationships
- Project Registry
- Directory Templates
- Repository Sections
- Routing Rules
- Source Systems
- File Types
- Metadata Fields
- Users and Roles
- System Settings and VPS storage health

## Local development

```bash
cp .env.example .env
npm install
docker compose up -d postgres
npm run dev
```

For non-Docker local development, set `NEXT_PUBLIC_API_URL=http://localhost:4000/api` and keep `STORAGE_ROOT=../../storage`.

## Production notes

- Set strong values for `POSTGRES_PASSWORD`, `JWT_SECRET` and `DEFAULT_ADMIN_PASSWORD`.
- Set `VPS_REPOSITORY_PATH` to a persistent host directory.
- Back up both the PostgreSQL database and the repository storage directory.
- Put TLS in front of port 8080 using the server's main Nginx, Caddy or other approved reverse proxy.
- After adopting controlled migrations, set `DB_SYNCHRONIZE=false`.

See `docs/VPS-DEPLOYMENT.md`, `docs/ARCHITECTURE.md`, `docs/DATABASE.md`, `docs/schema.sql`, `docs/API.md` and `docs/ACCEPTANCE-CHECKLIST.md`.
