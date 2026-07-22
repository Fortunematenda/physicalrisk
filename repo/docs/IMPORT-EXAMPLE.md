# Example Import

Input document:

```text
Title: MOSS System Architecture
Project: MOSS
Document type: Technical Specifications
Version: 1.2
Approval status: APPROVED
Approved by: Wayne
Approval date: 2026-07-17
```

Processing:

1. The file is staged in `incoming/`.
2. Mandatory metadata and configured file rules are validated.
3. The MOSS record is loaded from the Project Registry.
4. The routing rule resolves `TECHNICAL_SPECIFICATIONS`.
5. The system verifies that version 1.2 is newer and the checksum is not duplicated.
6. The approved file is stored at a relative path such as:

```text
repository/MOSS/Technical Specifications/MOSS-TS-001/v1.2/MOSS-System-Architecture.docx
```

7. The previous current version is retained and marked superseded.
8. Master Document Index and Version Register database records are updated.
9. `master-document-index.csv/json` and `version-register.csv/json` are regenerated on the VPS.
10. Relationships and a complete audit event are recorded.
