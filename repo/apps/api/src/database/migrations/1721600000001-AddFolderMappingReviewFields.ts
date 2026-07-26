import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFolderMappingReviewFields1721600000001 implements MigrationInterface {
  name = 'AddFolderMappingReviewFields1721600000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "source_folder_mappings"
      ADD COLUMN IF NOT EXISTS "require_manual_review" boolean NOT NULL DEFAULT true
    `);
    await queryRunner.query(`
      ALTER TABLE "source_folder_mappings"
      ADD COLUMN IF NOT EXISTS "default_document_type" text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "source_folder_mappings"
      DROP COLUMN IF EXISTS "default_document_type"
    `);
    await queryRunner.query(`
      ALTER TABLE "source_folder_mappings"
      DROP COLUMN IF EXISTS "require_manual_review"
    `);
  }
}
