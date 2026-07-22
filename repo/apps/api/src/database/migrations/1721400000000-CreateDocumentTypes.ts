import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDocumentTypes1721400000000 implements MigrationInterface {
  name = 'CreateDocumentTypes1721400000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS document_types (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR NOT NULL,
        code VARCHAR NOT NULL,
        description TEXT NULL,
        active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_indexes WHERE indexname = 'UQ_document_types_code'
        ) THEN
          CREATE UNIQUE INDEX "UQ_document_types_code" ON document_types (code);
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_indexes WHERE indexname = 'UQ_document_types_lower_name'
        ) THEN
          CREATE UNIQUE INDEX "UQ_document_types_lower_name" ON document_types (LOWER(name));
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_indexes WHERE indexname = 'UQ_source_systems_lower_name'
        ) THEN
          CREATE UNIQUE INDEX "UQ_source_systems_lower_name" ON source_systems (LOWER(name));
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_indexes WHERE indexname = 'UQ_projects_lower_name'
        ) THEN
          CREATE UNIQUE INDEX "UQ_projects_lower_name" ON projects (LOWER(name));
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_indexes WHERE indexname = 'UQ_project_sections_project_lower_name'
        ) THEN
          CREATE UNIQUE INDEX "UQ_project_sections_project_lower_name"
            ON project_sections (project_id, LOWER(name));
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_indexes WHERE indexname = 'UQ_project_sections_project_relative_path'
        ) THEN
          CREATE UNIQUE INDEX "UQ_project_sections_project_relative_path"
            ON project_sections (project_id, relative_path);
        END IF;
      END $$;
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_project_sections_project_relative_path"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_project_sections_project_lower_name"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_projects_lower_name"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_source_systems_lower_name"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_document_types_lower_name"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_document_types_code"`);
    await queryRunner.query(`DROP TABLE IF EXISTS document_types`);
  }
}
