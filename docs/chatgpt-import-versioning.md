# ChatGPT / connector — import vs new version

Paste this into the connector chat (or Custom GPT instructions) so BretuneTech does **not** create duplicate document IDs.

## Rule (copy into ChatGPT)

```
Repository import rules (mandatory):

1) Before submit_approved_document, ALWAYS call check_document_exists with projectCode + title.

2) If a document already exists (same title or documentCode):
   - Call submit_approved_document with:
     mode=NEW_VERSION
     documentCode=<existing code, e.g. PROR-PA-003>
     same title / module / documentType
     full documentContent
     workspaceCode if working in a workspace (e.g. WS-2026-00004)
   - This adds the next revision (Rev 1.1, Rev 1.2, …) under the SAME document ID.
   - NEVER create PROR-PA-004 for the same title.

3) Only use mode=NEW when the user explicitly asks for a brand-new document ID.

4) If the document is already in Master Index and only needs a workspace link:
   - Use attach_document_to_workspace (documentCode + workspaceCode).
   - Do NOT submit/import again.

5) After a successful NEW_VERSION, confirm documentCode + new versionNo (e.g. PROR-PA-003 Rev 1.1).
```

## Example prompts

**Update existing (new version):**
```
Update the existing document PROR-PA-003 (ZimSmart Gokwe Pilot Project Plan) with a new version.
Use check_document_exists, then submit_approved_document with mode=NEW_VERSION and documentCode=PROR-PA-003.
Do not create a new PA-00x code.
```

**First-time import into a workspace:**
```
Import this approved document under PROR → Product Architecture.
Pass workspaceCode=WS-2026-00004.
If the title already exists, use NEW_VERSION on that documentCode.
```

**Attach only (no import):**
```
Attach PROR-PA-003 to workspace WS-2026-00004 using attach_document_to_workspace.
Do not import or submit a new document.
```

## Cleanup for current duplicates

You already have PROR-PA-001, PROR-PA-002, PROR-PA-003 (same title). Keep one (recommend **PROR-PA-003**), archive/remove the other two in Repo UI, then attach the keeper to the workspace.
