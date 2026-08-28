import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserSessionTracking1722100000000 implements MigrationInterface {
  name = 'AddUserSessionTracking1722100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "last_login_at" TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS "last_seen_at" TIMESTAMPTZ
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN IF EXISTS "last_seen_at",
      DROP COLUMN IF EXISTS "last_login_at"
    `);
  }
}
