import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import {
  ConnectorImportJob,
  ConnectorImportJobStatus,
  ImportStatus,
  WorkspaceActivitySource,
  WorkspaceDocumentStatus,
} from '../database/entities';
import { ImportsService } from '../imports/imports.service';
import { WorkspacesService } from '../workspaces/workspaces.service';

@Injectable()
export class ConnectorImportJobService {
  private readonly logger = new Logger(ConnectorImportJobService.name);
  private readonly inFlight = new Set<string>();

  constructor(
    private readonly db: DatabaseService,
    private readonly imports: ImportsService,
    private readonly workspaces: WorkspacesService,
  ) {}

  async createJob(input: {
    workspaceCode?: string | null;
    userId?: string | null;
    totalDocuments?: number;
    importJobIds?: string[];
    metadata?: Record<string, unknown>;
  }): Promise<ConnectorImportJob> {
    const year = new Date().getUTCFullYear();
    const jobCode = await this.nextJobCode(year);
    const job = this.db.connectorImportJobs.create({
      jobCode,
      status: ConnectorImportJobStatus.QUEUED,
      workspaceCode: input.workspaceCode?.trim() || null,
      userId: input.userId ?? null,
      totalDocuments: input.totalDocuments ?? (input.importJobIds?.length ?? 0),
      completedDocuments: 0,
      failedDocuments: 0,
      importJobIds: input.importJobIds ?? [],
      errorMessage: null,
      metadata: input.metadata ?? null,
    });
    const saved = await this.db.connectorImportJobs.save(job);
    this.scheduleProcess(saved.id);
    return saved;
  }

  async getByCodeOrId(jobId: string): Promise<ConnectorImportJob> {
    const job = await this.db.connectorImportJobs.findOne({
      where: [{ jobCode: jobId }, { id: jobId }],
    });
    if (!job) throw new NotFoundException(`Import job ${jobId} not found`);
    return job;
  }

  toView(job: ConnectorImportJob) {
    return {
      jobId: job.jobCode,
      id: job.id,
      status: job.status,
      workspaceCode: job.workspaceCode,
      totalDocuments: job.totalDocuments,
      completedDocuments: job.completedDocuments,
      failedDocuments: job.failedDocuments,
      importJobIds: job.importJobIds,
      errorMessage: job.errorMessage,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
    };
  }

  async retry(jobId: string): Promise<ConnectorImportJob> {
    const job = await this.getByCodeOrId(jobId);
    job.status = ConnectorImportJobStatus.QUEUED;
    job.errorMessage = null;
    await this.db.connectorImportJobs.save(job);
    this.scheduleProcess(job.id);
    return job;
  }

  /** Queue background processing for a single MCP import job (does not block the HTTP response). */
  enqueueSingleImport(importJobId: string, opts?: {
    workspaceCode?: string | null;
    userId?: string | null;
    batchJobId?: string | null;
  }): void {
    setImmediate(() => {
      void this.processSingleImport(importJobId, opts).catch((error) => {
        this.logger.error(
          `Background MCP import failed for ${importJobId}: ${error instanceof Error ? error.message : error}`,
        );
      });
    });
  }

  /**
   * Await processing for a staged MCP job (READY_FOR_REVIEW / READY / RECEIVED).
   * Used after FILE_PRESERVE finalize and when get_import_status recovers a stuck queue item.
   */
  async processReadyImport(importJobId: string, opts?: {
    workspaceCode?: string | null;
    userId?: string | null;
    batchJobId?: string | null;
  }): Promise<void> {
    await this.processSingleImport(importJobId, opts);
  }

  private scheduleProcess(batchId: string): void {
    setImmediate(() => {
      void this.processBatch(batchId).catch((error) => {
        this.logger.error(
          `Background connector import batch failed for ${batchId}: ${error instanceof Error ? error.message : error}`,
        );
      });
    });
  }

  private async processBatch(batchId: string): Promise<void> {
    if (this.inFlight.has(batchId)) return;
    this.inFlight.add(batchId);
    try {
      const job = await this.db.connectorImportJobs.findOne({ where: { id: batchId } });
      if (!job) return;
      job.status = ConnectorImportJobStatus.PROCESSING;
      await this.db.connectorImportJobs.save(job);

      let completed = 0;
      let failed = 0;
      for (const importJobId of job.importJobIds) {
        try {
          await this.processSingleImport(importJobId, {
            workspaceCode: job.workspaceCode,
            userId: job.userId,
            batchJobId: job.id,
          });
          const updated = await this.db.importJobs.findOne({ where: { id: importJobId } });
          if (updated?.status === ImportStatus.IMPORTED) completed += 1;
          else failed += 1;
        } catch {
          failed += 1;
        }
      }

      job.completedDocuments = completed;
      job.failedDocuments = failed;
      if (failed === 0 && completed >= job.totalDocuments) {
        job.status = ConnectorImportJobStatus.COMPLETED;
      } else if (completed > 0) {
        job.status = ConnectorImportJobStatus.PARTIALLY_COMPLETED;
      } else {
        job.status = ConnectorImportJobStatus.FAILED;
        job.errorMessage = 'All documents failed to import';
      }
      await this.db.connectorImportJobs.save(job);
    } finally {
      this.inFlight.delete(batchId);
    }
  }

  private async processSingleImport(
    importJobId: string,
    opts?: { workspaceCode?: string | null; userId?: string | null; batchJobId?: string | null },
  ): Promise<void> {
    const before = await this.db.importJobs.findOne({ where: { id: importJobId } });
    if (!before) return;
    if (before.status === ImportStatus.IMPORTED) return;
    if (
      before.status !== ImportStatus.READY_FOR_REVIEW
      && before.status !== ImportStatus.READY
      && before.status !== ImportStatus.RECEIVED
    ) {
      return;
    }

    try {
      const completed = await this.imports.process(importJobId);
      if (opts?.workspaceCode && opts.userId) {
        try {
          await this.workspaces.attachImportJob({
            workspaceCode: opts.workspaceCode,
            importJobId,
            userId: opts.userId,
            source: WorkspaceActivitySource.CHATGPT_MCP,
            members: [{
              fileName: completed.fileName,
              mimeType: completed.mimeType || undefined,
              checksum: completed.checksum || undefined,
              documentId: completed.document?.id,
              status: completed.status === ImportStatus.IMPORTED
                ? WorkspaceDocumentStatus.IMPORTED
                : WorkspaceDocumentStatus.IMPORTING,
            }],
          });
        } catch (attachError) {
          this.logger.warn(
            `Attach after import failed for ${importJobId}: ${attachError instanceof Error ? attachError.message : attachError}`,
          );
        }
      }
    } catch (error) {
      const failed = await this.db.importJobs.findOne({ where: { id: importJobId } });
      if (failed && failed.status === ImportStatus.FAILED) {
        failed.status = ImportStatus.READY_FOR_REVIEW;
        failed.errorMessage = error instanceof Error ? error.message : 'Auto-import failed';
        await this.db.importJobs.save(failed);
      }
      throw error;
    }
  }

  private async nextJobCode(year: number): Promise<string> {
    const name = 'connector_import_job';
    return this.db.dataSource.transaction(async (manager) => {
      const rows = await manager.query(
        `SELECT id, next_value FROM sequence_counters WHERE name = $1 AND year = $2 FOR UPDATE`,
        [name, year],
      );
      let nextValue = 1;
      if (rows[0]) {
        nextValue = Number(rows[0].next_value);
        await manager.query(
          `UPDATE sequence_counters SET next_value = $1, updated_at = now() WHERE id = $2`,
          [nextValue + 1, rows[0].id],
        );
      } else {
        await manager.query(
          `INSERT INTO sequence_counters (id, name, year, next_value, updated_at)
           VALUES (gen_random_uuid(), $1, $2, 2, now())`,
          [name, year],
        );
      }
      return `IMP-${year}-${String(nextValue).padStart(5, '0')}`;
    });
  }
}
