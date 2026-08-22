import { DataSource } from 'typeorm';
import { ENTITIES } from './entities';
import { AddDocumentVersioningConstraints1721337600000 } from './migrations/1721337600000-AddDocumentVersioningConstraints';
import { CreateDocumentTypes1721400000000 } from './migrations/1721400000000-CreateDocumentTypes';
import { AddImportDraftStatus1721500000000 } from './migrations/1721500000000-AddImportDraftStatus';
import { AddConnectorInfrastructure1721600000000 } from './migrations/1721600000000-AddConnectorInfrastructure';
import { AddFolderMappingReviewFields1721600000001 } from './migrations/1721600000001-AddFolderMappingReviewFields';
import { AddRepositoryWorkspaces1721700000000 } from './migrations/1721700000000-AddRepositoryWorkspaces';
import { AddConnectorSessionsAndImportJobs1721800000000 } from './migrations/1721800000000-AddConnectorSessionsAndImportJobs';
import { AddDocumentRecycleBin1721900000000 } from './migrations/1721900000000-AddDocumentRecycleBin';

export default new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL || 'postgres://gateway:gateway@localhost:5432/gateway',
  entities: ENTITIES,
  migrations: [
    AddDocumentVersioningConstraints1721337600000,
    CreateDocumentTypes1721400000000,
    AddImportDraftStatus1721500000000,
    AddConnectorInfrastructure1721600000000,
    AddFolderMappingReviewFields1721600000001,
    AddRepositoryWorkspaces1721700000000,
    AddConnectorSessionsAndImportJobs1721800000000,
    AddDocumentRecycleBin1721900000000,
  ],
  migrationsRun: false,
  synchronize: false,
  logging: false,
});
