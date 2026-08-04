import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddConnectorSessionsAndImportJobs1721800000000 implements MigrationInterface {
  name = 'AddConnectorSessionsAndImportJobs1721800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "connector_import_job_status_enum" AS ENUM (
          'QUEUED','PROCESSING','COMPLETED','PARTIALLY_COMPLETED','FAILED','CANCELLED'
        );
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "connector_sessions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "session_id" character varying NOT NULL UNIQUE,
        "user_id" character varying NOT NULL,
        "access_token_encrypted" text,
        "refresh_token_encrypted" text,
        "access_token_expires_at" TIMESTAMPTZ,
        "refresh_token_expires_at" TIMESTAMPTZ,
        "last_successful_request_at" TIMESTAMPTZ,
        "last_used_at" TIMESTAMPTZ,
        "revoked_at" TIMESTAMPTZ,
        "keycloak_sub" text,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_connector_sessions_user_id" ON "connector_sessions" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_connector_sessions_last_used" ON "connector_sessions" ("last_used_at")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "connector_idempotency_keys" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "idempotency_key" character varying NOT NULL UNIQUE,
        "user_id" text,
        "operation" character varying NOT NULL,
        "request_hash" text,
        "response_json" jsonb NOT NULL,
        "http_status" integer NOT NULL DEFAULT 200,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "connector_import_jobs" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "job_code" character varying NOT NULL UNIQUE,
        "status" "connector_import_job_status_enum" NOT NULL DEFAULT 'QUEUED',
        "workspace_code" text,
        "user_id" text,
        "total_documents" integer NOT NULL DEFAULT 0,
        "completed_documents" integer NOT NULL DEFAULT 0,
        "failed_documents" integer NOT NULL DEFAULT 0,
        "import_job_ids" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "error_message" text,
        "metadata" jsonb,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_connector_import_jobs_workspace" ON "connector_import_jobs" ("workspace_code")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_connector_import_jobs_status" ON "connector_import_jobs" ("status")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "connector_import_jobs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "connector_idempotency_keys"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "connector_sessions"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "connector_import_job_status_enum"`);
  }
}
