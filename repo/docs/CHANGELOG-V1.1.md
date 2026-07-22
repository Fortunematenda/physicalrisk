# Version 1.1 — VPS Repository Edition

This release replaces the external repository connector with repository storage hosted directly on the Physical Risk VPS.

## Changed

- The VPS filesystem is now the authoritative document repository.
- Project Registry records now store a configurable repository root path.
- Project sections now store configurable relative folder paths.
- The import service writes approved files to the mounted VPS storage volume.
- The Master Document Index and Version Register are regenerated as CSV and JSON files inside each project repository.
- Document downloads are streamed securely from VPS storage using stored relative paths.
- A VPS Repository Explorer page and storage health page were added.
- The Docker stack now includes an Nginx reverse proxy and a persistent host filesystem mount.
- Deployment, architecture, database, API and acceptance documentation were updated for VPS hosting.

## Preserved RFP behaviour

- Approved-only imports.
- Mandatory metadata validation.
- Configuration-driven project and section routing.
- Immutable version history.
- Master Document Index and Version Register updates.
- Document relationships.
- Complete import and audit logging.
- Configurable source systems, file types, metadata fields and routing rules.
