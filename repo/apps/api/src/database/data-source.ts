import { DataSource } from 'typeorm';
import { ENTITIES } from './entities';
import { AddDocumentVersioningConstraints1721337600000 } from './migrations/1721337600000-AddDocumentVersioningConstraints';
import { CreateDocumentTypes1721400000000 } from './migrations/1721400000000-CreateDocumentTypes';
import { AddImportDraftStatus1721500000000 } from './migrations/1721500000000-AddImportDraftStatus';

export default new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL || 'postgres://gateway:gateway@localhost:5432/gateway',
  entities: ENTITIES,
  migrations: [
    AddDocumentVersioningConstraints1721337600000,
    CreateDocumentTypes1721400000000,
    AddImportDraftStatus1721500000000,
  ],
  migrationsRun: false,
  synchronize: false,
  logging: false,
});
