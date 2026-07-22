import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatabaseService } from './database.service';
import { ENTITIES } from './entities';
import { SeedService } from './seed.service';
import { AddDocumentVersioningConstraints1721337600000 } from './migrations/1721337600000-AddDocumentVersioningConstraints';
import { CreateDocumentTypes1721400000000 } from './migrations/1721400000000-CreateDocumentTypes';
import { AddImportDraftStatus1721500000000 } from './migrations/1721500000000-AddImportDraftStatus';

@Global()
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const synchronize = config.get<string>('DB_SYNCHRONIZE', 'false') === 'true';
        return {
          type: 'postgres' as const,
          url: config.get<string>('DATABASE_URL'),
          entities: ENTITIES,
          migrations: [
            AddDocumentVersioningConstraints1721337600000,
            CreateDocumentTypes1721400000000,
            AddImportDraftStatus1721500000000,
          ],
          migrationsRun: !synchronize,
          synchronize,
          logging: false,
        };
      },
    }),
    TypeOrmModule.forFeature(ENTITIES),
  ],
  providers: [DatabaseService, SeedService],
  exports: [DatabaseService, TypeOrmModule],
})
export class DatabaseModule {}
