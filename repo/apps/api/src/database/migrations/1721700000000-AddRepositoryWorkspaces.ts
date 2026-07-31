import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRepositoryWorkspaces1721700000000 implements MigrationInterface {
  name = 'AddRepositoryWorkspaces1721700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "workspace_status_enum" AS ENUM (
          'DRAFT','UPLOADING','METADATA_REVIEW','VALIDATION_REQUIRED','READY_TO_IMPORT',
          'IMPORTING','COMPLETED','PARTIALLY_COMPLETED','PAUSED','CANCELLED','ARCHIVED'
        );
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "workspace_step_enum" AS ENUM (
          'UPLOAD','EXTRACTION','METADATA','APPROVAL','VALIDATION','ROUTING','IMPORT','COMPLETE'
        );
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "workspace_document_status_enum" AS ENUM (
          'PENDING','EXTRACTED','METADATA_REQUIRED','VALIDATION_FAILED','READY',
          'IMPORTING','IMPORTED','FAILED','REMOVED'
        );
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "workspace_activity_source_enum" AS ENUM (
          'WEB','API','CHATGPT_ACTION','CHATGPT_MCP','SYSTEM'
        );
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "sequence_counters" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "name" character varying NOT NULL,
        "year" integer NOT NULL,
        "next_value" integer NOT NULL DEFAULT 1,
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_sequence_counters_name_year" UNIQUE ("name", "year")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "repository_workspaces" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "workspace_code" character varying NOT NULL UNIQUE,
        "name" character varying NOT NULL,
        "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
        "created_by_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "status" "workspace_status_enum" NOT NULL DEFAULT 'DRAFT',
        "current_step" "workspace_step_enum" NOT NULL DEFAULT 'UPLOAD',
        "total_documents" integer NOT NULL DEFAULT 0,
        "completed_documents" integer NOT NULL DEFAULT 0,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_repository_workspaces_project" ON "repository_workspaces" ("project_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_repository_workspaces_created_by" ON "repository_workspaces" ("created_by_user_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_repository_workspaces_status" ON "repository_workspaces" ("status")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "workspace_documents" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "workspace_id" uuid NOT NULL REFERENCES "repository_workspaces"("id") ON DELETE CASCADE,
        "document_id" uuid REFERENCES "documents"("id") ON DELETE SET NULL,
        "import_job_id" uuid REFERENCES "import_jobs"("id") ON DELETE SET NULL,
        "file_name" character varying NOT NULL,
        "original_file_name" text,
        "relative_path" text,
        "storage_reference" text,
        "mime_type" text,
        "file_extension" text,
        "checksum" text,
        "status" "workspace_document_status_enum" NOT NULL DEFAULT 'PENDING',
        "metadata_json" jsonb,
        "validation_json" jsonb,
        "routing_json" jsonb,
        "error_json" jsonb,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_workspace_documents_workspace" ON "workspace_documents" ("workspace_id")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "workspace_activities" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "workspace_id" uuid NOT NULL REFERENCES "repository_workspaces"("id") ON DELETE CASCADE,
        "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "action" character varying NOT NULL,
        "source" "workspace_activity_source_enum" NOT NULL DEFAULT 'SYSTEM',
        "details_json" jsonb,
        "correlation_id" text,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_workspace_activities_workspace_created"
      ON "workspace_activities" ("workspace_id", "created_at")
    `);

    await queryRunner.query(`
      ALTER TABLE "import_jobs"
      ADD COLUMN IF NOT EXISTS "workspace_id" uuid REFERENCES "repository_workspaces"("id") ON DELETE SET NULL
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_import_jobs_workspace" ON "import_jobs" ("workspace_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "import_jobs" DROP COLUMN IF EXISTS "workspace_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "workspace_activities"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "workspace_documents"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "repository_workspaces"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "sequence_counters"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "workspace_activity_source_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "workspace_document_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "workspace_step_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "workspace_status_enum"`);
  }
}
