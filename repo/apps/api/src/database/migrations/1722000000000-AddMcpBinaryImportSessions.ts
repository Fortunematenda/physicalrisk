import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMcpBinaryImportSessions1722000000000 implements MigrationInterface {
  name = 'AddMcpBinaryImportSessions1722000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "mcp_binary_import_sessions_status_enum" AS ENUM (
          'PREPARING','RECEIVING','PAUSED','ASSEMBLING','VALIDATING',
          'AVAILABLE','FAILED','ABORTED','EXPIRED'
        );
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "mcp_binary_import_sessions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "upload_token_hash" character varying NOT NULL,
        "integration_key" character varying(120) NOT NULL,
        "user_id" uuid,
        "project_id" uuid,
        "project_code" character varying,
        "module" character varying,
        "section_key" character varying,
        "document_type" character varying,
        "document_id" uuid,
        "document_code" character varying,
        "mode" character varying NOT NULL DEFAULT 'NEW_DOCUMENT',
        "source" character varying NOT NULL DEFAULT 'CHATGPT',
        "transport_mode" character varying,
        "original_file_name" character varying NOT NULL,
        "expected_file_size" bigint,
        "actual_file_size" bigint,
        "expected_sha256" character varying,
        "actual_sha256" character varying,
        "declared_mime_type" character varying,
        "detected_mime_type" character varying,
        "chunk_size" integer NOT NULL,
        "expected_chunk_count" integer,
        "received_chunk_count" integer NOT NULL DEFAULT 0,
        "received_chunks" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "temp_dir" character varying NOT NULL,
        "host_reference_type" character varying,
        "status" "mcp_binary_import_sessions_status_enum" NOT NULL DEFAULT 'PREPARING',
        "validation_status" character varying,
        "validation_details" jsonb,
        "error_code" character varying,
        "error_message" text,
        "retryable" boolean NOT NULL DEFAULT false,
        "import_job_id" uuid,
        "expires_at" TIMESTAMPTZ NOT NULL,
        "last_activity_at" TIMESTAMPTZ NOT NULL,
        "completed_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_mcp_binary_import_sessions_token_hash"
        ON "mcp_binary_import_sessions" ("upload_token_hash")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_mcp_binary_import_sessions_status_expires"
        ON "mcp_binary_import_sessions" ("status", "expires_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_mcp_binary_import_sessions_status_expires"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_mcp_binary_import_sessions_token_hash"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "mcp_binary_import_sessions"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "mcp_binary_import_sessions_status_enum"`);
  }
}
