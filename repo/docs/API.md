# API Summary

Swagger is available at `/api/docs`.

## Authentication

- `POST /api/auth/login`
- `GET /api/auth/me`

## Dashboard and health

- `GET /api/health`
- `GET /api/dashboard`

## Imports

- `POST /api/imports/upload` — multipart approved-document upload.
- `GET /api/imports`
- `GET /api/imports/:id`
- `POST /api/imports/:id/retry`

## Repository

- `GET /api/documents`
- `GET /api/documents/:id`
- `GET /api/version-register`
- `GET /api/versions/:id/download`
- `GET /api/relationships`
- `POST /api/relationships`
- `DELETE /api/relationships/:id`
- `GET /api/audit-logs`

## VPS storage

- `GET /api/storage/health`
- `GET /api/storage/projects/:projectId/tree`
- `POST /api/storage/projects/:projectId/sync`

## Project Registry and configuration

- `GET|POST /api/projects`
- `GET|PATCH /api/projects/:id`
- `POST /api/projects/:id/apply-template/:templateId`
- `POST /api/projects/:id/sections`
- `PATCH|DELETE /api/project-sections/:id`
- `GET|POST /api/directory-templates`
- `GET|POST|PATCH /api/source-systems`
- `GET|POST|PATCH /api/file-types`
- `GET|POST|PATCH /api/metadata-fields`
- `GET|POST|PATCH /api/routing-rules`
- `GET /api/settings`
- `POST /api/settings/:key`

## Users

- `GET|POST /api/users`
- `PATCH /api/users/:id`
