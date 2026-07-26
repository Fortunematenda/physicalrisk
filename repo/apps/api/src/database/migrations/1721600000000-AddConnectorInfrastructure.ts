import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddConnectorInfrastructure1721600000000 implements MigrationInterface {
  name = 'AddConnectorInfrastructure1721600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "connector_provider_enum" AS ENUM (
          'GOOGLE_DRIVE', 'CHATGPT_MCP', 'MANUAL_UPLOAD', 'SHAREPOINT',
          'ONEDRIVE', 'DROPBOX', 'SFTP', 'LOCAL_FOLDER'
        );
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "source_connection_status_enum" AS ENUM (
          'PENDING', 'CONNECTED', 'ERROR', 'DISABLED', 'DISCONNECTED'
        );
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "folder_import_mode_enum" AS ENUM ('NEW_ONLY', 'NEW_AND_CHANGED');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "sync_trigger_type_enum" AS ENUM ('MANUAL', 'SCHEDULED', 'WEBHOOK');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "sync_run_status_enum" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "sync_schedule_enum" AS ENUM ('MANUAL', 'EVERY_15_MINUTES', 'HOURLY', 'DAILY');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "external_import_status_enum" AS ENUM (
          'DETECTED', 'DOWNLOADING', 'STAGED', 'PENDING_METADATA', 'READY_FOR_REVIEW',
          'DUPLICATE_REVIEW', 'VERSION_REVIEW', 'READY_TO_IMPORT', 'IMPORTING',
          'IMPORTED', 'REJECTED', 'FAILED'
        );
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "mcp_integration_status_enum" AS ENUM ('ACTIVE', 'DISABLED');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    await queryRunner.query(`ALTER TYPE "import_jobs_status_enum" ADD VALUE IF NOT EXISTS 'READY_FOR_REVIEW'`);
    await queryRunner.query(`ALTER TYPE "import_jobs_status_enum" ADD VALUE IF NOT EXISTS 'DUPLICATE_REVIEW'`);
    await queryRunner.query(`ALTER TYPE "import_jobs_status_enum" ADD VALUE IF NOT EXISTS 'VERSION_REVIEW'`);
    await queryRunner.query(`ALTER TYPE "import_jobs_status_enum" ADD VALUE IF NOT EXISTS 'REJECTED'`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "source_connections" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "provider" "connector_provider_enum" NOT NULL,
        "name" character varying NOT NULL,
        "status" "source_connection_status_enum" NOT NULL DEFAULT 'PENDING',
        "credentials_encrypted" text,
        "settings" jsonb NOT NULL DEFAULT '{}',
        "sync_schedule" "sync_schedule_enum" NOT NULL DEFAULT 'MANUAL',
        "external_account_id" text,
        "external_account_label" text,
        "root_external_folder_id" text,
        "root_external_folder_name" text,
        "last_sync_at" TIMESTAMPTZ,
        "last_sync_error" text,
        "created_by_id" uuid,
        "default_project_id" uuid,
        "default_section_id" uuid,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_source_connections" PRIMARY KEY ("id"),
        CONSTRAINT "FK_source_connections_created_by" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_source_connections_default_project" FOREIGN KEY ("default_project_id") REFERENCES "projects"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_source_connections_default_section" FOREIGN KEY ("default_section_id") REFERENCES "project_sections"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "source_folder_mappings" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "connection_id" uuid NOT NULL,
        "external_folder_id" character varying NOT NULL,
        "external_folder_name" character varying NOT NULL,
        "external_folder_path" text,
        "project_id" uuid,
        "section_id" uuid,
        "import_mode" "folder_import_mode_enum" NOT NULL DEFAULT 'NEW_AND_CHANGED',
        "enabled" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_source_folder_mappings" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_source_folder_mappings_connection_folder" UNIQUE ("connection_id", "external_folder_id"),
        CONSTRAINT "FK_source_folder_mappings_connection" FOREIGN KEY ("connection_id") REFERENCES "source_connections"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_source_folder_mappings_project" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_source_folder_mappings_section" FOREIGN KEY ("section_id") REFERENCES "project_sections"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "connector_sync_runs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "connection_id" uuid NOT NULL,
        "trigger_type" "sync_trigger_type_enum" NOT NULL,
        "status" "sync_run_status_enum" NOT NULL DEFAULT 'RUNNING',
        "files_detected" integer NOT NULL DEFAULT 0,
        "files_queued" integer NOT NULL DEFAULT 0,
        "files_skipped" integer NOT NULL DEFAULT 0,
        "files_failed" integer NOT NULL DEFAULT 0,
        "error_message" text,
        "metadata" jsonb,
        "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "completed_at" TIMESTAMPTZ,
        CONSTRAINT "PK_connector_sync_runs" PRIMARY KEY ("id"),
        CONSTRAINT "FK_connector_sync_runs_connection" FOREIGN KEY ("connection_id") REFERENCES "source_connections"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "external_import_references" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "provider" "connector_provider_enum" NOT NULL,
        "external_file_id" character varying NOT NULL,
        "external_revision_id" character varying NOT NULL DEFAULT '',
        "external_file_name" character varying NOT NULL,
        "checksum" character varying NOT NULL,
        "external_modified_at" TIMESTAMPTZ,
        "source_connection_id" uuid,
        "import_job_id" uuid,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_external_import_references" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_external_import_references_provider_file_revision" UNIQUE ("provider", "external_file_id", "external_revision_id"),
        CONSTRAINT "FK_external_import_references_connection" FOREIGN KEY ("source_connection_id") REFERENCES "source_connections"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_external_import_references_import_job" FOREIGN KEY ("import_job_id") REFERENCES "import_jobs"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "mcp_integrations" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying NOT NULL,
        "status" "mcp_integration_status_enum" NOT NULL DEFAULT 'ACTIVE',
        "api_key_hash" character varying NOT NULL,
        "api_key_prefix" character varying NOT NULL,
        "allowed_project_ids" jsonb NOT NULL DEFAULT '[]',
        "allowed_tools" jsonb NOT NULL DEFAULT '[]',
        "expires_at" TIMESTAMPTZ,
        "last_used_at" TIMESTAMPTZ,
        "created_by_id" uuid,
        "rotated_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_mcp_integrations" PRIMARY KEY ("id"),
        CONSTRAINT "FK_mcp_integrations_created_by" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "import_jobs"
      ADD COLUMN IF NOT EXISTS "provider" "connector_provider_enum",
      ADD COLUMN IF NOT EXISTS "external_import_status" "external_import_status_enum",
      ADD COLUMN IF NOT EXISTS "source_connection_id" uuid
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "import_jobs"
        ADD CONSTRAINT "FK_import_jobs_source_connection"
        FOREIGN KEY ("source_connection_id") REFERENCES "source_connections"("id") ON DELETE SET NULL;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
  }

  public async down(): Promise<void> {
    // Non-destructive migration — down is intentionally omitted.
  }
}
