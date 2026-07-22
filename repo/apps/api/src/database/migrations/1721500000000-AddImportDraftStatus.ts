import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddImportDraftStatus1721500000000 implements MigrationInterface {
  name = 'AddImportDraftStatus1721500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TYPE "import_jobs_status_enum" ADD VALUE IF NOT EXISTS 'DRAFT'`);
  }

  public async down(): Promise<void> {
    // PostgreSQL cannot easily remove enum values safely.
  }
}
