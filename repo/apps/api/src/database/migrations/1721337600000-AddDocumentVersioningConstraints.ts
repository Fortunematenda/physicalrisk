import { MigrationInterface, QueryRunner, TableColumn, TableForeignKey, TableUnique } from 'typeorm';

export class AddDocumentVersioningConstraints1721337600000 implements MigrationInterface {
  name = 'AddDocumentVersioningConstraints1721337600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'documents'
        ) AND NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'documents' AND column_name = 'current_version_id'
        ) THEN
          ALTER TABLE documents ADD COLUMN current_version_id UUID NULL;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'documents'
        ) AND EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'document_versions'
        ) AND NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE table_name = 'documents' AND constraint_name = 'FK_documents_current_version_id'
        ) THEN
          ALTER TABLE documents
            ADD CONSTRAINT FK_documents_current_version_id
            FOREIGN KEY (current_version_id) REFERENCES document_versions(id) ON DELETE SET NULL;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'document_versions'
        ) AND NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE table_name = 'document_versions' AND constraint_name = 'UQ_document_versions_document_version'
        ) THEN
          ALTER TABLE document_versions
            ADD CONSTRAINT UQ_document_versions_document_version UNIQUE (document_id, version_no);
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'document_versions'
        ) AND NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE table_name = 'document_versions' AND constraint_name = 'UQ_document_versions_document_checksum'
        ) THEN
          ALTER TABLE document_versions
            ADD CONSTRAINT UQ_document_versions_document_checksum UNIQUE (document_id, checksum);
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'document_versions'
        ) AND EXISTS (
          SELECT 1 FROM pg_indexes
          WHERE indexname = 'IDX_7a74f5b8e8b7b8c8d8e8f8a8b8c8' AND tablename = 'document_versions'
        ) THEN
          DROP INDEX "IDX_7a74f5b8e8b7b8c8d8e8f8a8b8c8";
        END IF;
      END $$;
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE document_versions DROP CONSTRAINT IF EXISTS UQ_document_versions_document_checksum;
    `);
    await queryRunner.query(`
      ALTER TABLE document_versions DROP CONSTRAINT IF EXISTS UQ_document_versions_document_version;
    `);
    await queryRunner.query(`
      ALTER TABLE documents DROP CONSTRAINT IF EXISTS FK_documents_current_version_id;
    `);
    await queryRunner.query(`
      ALTER TABLE documents DROP COLUMN IF EXISTS current_version_id;
    `);
  }
}
