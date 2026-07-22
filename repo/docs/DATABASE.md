# Database Structure

## Configuration tables

- `directory_templates`: reusable repository-directory definitions.
- `directory_template_sections`: ordered sections in a template.
- `projects`: Project Registry record, relative VPS root path and storage configuration.
- `project_sections`: effective per-project directory and relative folder path.
- `routing_rules`: configurable conditions that resolve a document to a project section.
- `source_systems`: ChatGPT, Claude, Gemini, Word, local folders, website workflows and future sources.
- `file_types`: allowed extension, MIME types, size limit and extraction permission.
- `metadata_fields`: mandatory and optional metadata controls.
- `system_settings`: persisted gateway settings.

## Repository tables

- `documents`: stable document identity and current version number.
- `document_versions`: immutable version, approval evidence, SHA-256 checksum and relative VPS path.
- `document_relationships`: typed relationships that survive directory reconfiguration.
- `import_jobs`: every received file and its validation, routing and VPS-storage outcome.
- `audit_logs`: append-only operational and configuration history.

## Security table

- `users`: administrator, importer, reviewer or viewer account.

## Key invariants

1. A document code is unique inside a project.
2. A version number is unique inside a document.
3. Only one version is marked current for a document.
4. Exact duplicate file checksums are rejected within the same project.
5. Non-empty sections are deactivated rather than deleting their document history.
6. Routing uses stable `sectionKey` values, not hard-coded Linux paths.
7. Project and section paths are relative to the configured VPS storage root.
8. Every successful import updates the database registers and their CSV/JSON repository exports.
