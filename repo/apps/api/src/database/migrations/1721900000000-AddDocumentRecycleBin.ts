import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDocumentRecycleBin1721900000000 implements MigrationInterface {
  name = 'AddDocumentRecycleBin1721900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "documents"
        ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS "deleted_by_id" uuid,
        ADD COLUMN IF NOT EXISTS "purge_after" TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS "bin_original_code" character varying
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "documents"
          ADD CONSTRAINT "FK_documents_deleted_by"
          FOREIGN KEY ("deleted_by_id") REFERENCES "users"("id")
          ON DELETE SET NULL;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_documents_deleted_at"
        ON "documents" ("deleted_at")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_documents_purge_after"
        ON "documents" ("purge_after")
        WHERE "deleted_at" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_documents_purge_after"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_documents_deleted_at"`);
    await queryRunner.query(`
      ALTER TABLE "documents" DROP CONSTRAINT IF EXISTS "FK_documents_deleted_by"
    `);
    await queryRunner.query(`
      ALTER TABLE "documents"
        DROP COLUMN IF EXISTS "bin_original_code",
        DROP COLUMN IF EXISTS "purge_after",
        DROP COLUMN IF EXISTS "deleted_by_id",
        DROP COLUMN IF EXISTS "deleted_at"
    `);
  }
}
