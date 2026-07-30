import { BadRequestException, Injectable, NotFoundException, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import AdmZip = require('adm-zip');
import { access, copyFile, mkdir, readFile, readdir, rename, rm, stat, statfs, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { DatabaseService } from '../database/database.service';
import { Project, ProjectStatus } from '../database/entities';

export type ZipMember = {
  /** Sanitised path relative to the pack root (posix separators). */
  relativePath: string;
  fileName: string;
  data: Buffer;
  size: number;
};

export interface TreeEntry {
  name: string;
  path: string;
  type: 'directory' | 'file';
  nodeType?: 'root' | 'module' | 'folder' | 'document' | 'version' | 'file' | 'register';
  childCount?: number;
  documentId?: string;
  sectionId?: string;
  versionId?: string;
  documentCode?: string;
  versionNo?: string;
  status?: string;
  mimeType?: string;
  size?: number;
  modifiedAt?: Date;
  children?: TreeEntry[];
}

const csvCell = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;

@Injectable()
export class VpsStorageService implements OnApplicationBootstrap {
  readonly storageRoot: string;
  readonly repositoryRoot: string;
  readonly incomingRoot: string;
  readonly stagingRoot: string;

  constructor(private readonly config: ConfigService, private readonly db: DatabaseService) {
    this.storageRoot = resolve(this.config.get<string>('STORAGE_ROOT') ?? '../../storage');
    this.repositoryRoot = join(this.storageRoot, 'repository');
    this.incomingRoot = join(this.storageRoot, 'incoming');
    this.stagingRoot = join(this.storageRoot, 'staging', 'external-imports');
  }

  async onApplicationBootstrap() {
    await mkdir(this.repositoryRoot, { recursive: true });
    await mkdir(this.incomingRoot, { recursive: true });
    await mkdir(this.stagingRoot, { recursive: true });
    const projects = await this.db.projects.find({ where: { status: ProjectStatus.ACTIVE } });
    for (const project of projects) await this.ensureProjectStructure(project.id);
  }

  normaliseRelativePath(value: string) {
    const input = String(value ?? '').trim().replace(/\\/g, '/');
    if (!input || isAbsolute(input) || input.startsWith('/')) throw new BadRequestException('Repository path must be a non-empty relative VPS path');
    const segments = input.split('/').filter(Boolean).map((segment) => {
      if (segment === '.' || segment === '..') throw new BadRequestException('Repository path traversal is not allowed');
      const cleaned = segment.replace(/[<>:"|?*\u0000-\u001F]/g, '-').replace(/[. ]+$/g, '').trim();
      if (!cleaned) throw new BadRequestException('Repository path contains an invalid folder name');
      return cleaned;
    });
    return segments.join('/');
  }

  resolveStoragePath(relativePath: string) {
    const normalised = this.normaliseRelativePath(relativePath);
    const absolute = resolve(this.storageRoot, normalised);
    const boundary = `${this.storageRoot}${sep}`;
    if (absolute !== this.storageRoot && !absolute.startsWith(boundary)) throw new BadRequestException('Resolved path is outside the configured VPS storage root');
    return absolute;
  }

  projectRelativeRoot(project: Project) {
    return join('repository', this.normaliseRelativePath(project.repositoryRootPath));
  }

  versionRelativePath(project: Project, sectionRelativePath: string, documentCode: string, versionNo: string, fileName: string) {
    const segments = [
      this.projectRelativeRoot(project),
      this.normaliseRelativePath(sectionRelativePath),
      this.safeSegment(documentCode),
      `v${this.safeSegment(versionNo)}`,
      this.safeSegment(fileName),
    ];
    return segments.join('/').replace(/\\/g, '/');
  }

  /**
   * Pack folder for an extracted ZIP under a project section:
   * repository/{root}/{section}/{packFolder}/{memberRelativePath}
   */
  packMemberRelativePath(
    project: Project,
    sectionRelativePath: string,
    packFolder: string,
    memberRelativePath: string,
  ) {
    const member = this.normaliseRelativePath(memberRelativePath);
    if (!member || member.includes('..')) {
      throw new BadRequestException('ZIP entry path is invalid');
    }
    return [
      this.projectRelativeRoot(project),
      this.normaliseRelativePath(sectionRelativePath),
      this.safeSegment(packFolder),
      member,
    ].join('/').replace(/\\/g, '/');
  }

  /**
   * Read file entries from a ZIP on the storage volume (or absolute path).
   * Skips directories and junk (__MACOSX, .DS_Store); rejects path traversal.
   */
  listZipMembers(relativeOrAbsoluteZipPath: string): ZipMember[] {
    const absolute = isAbsolute(relativeOrAbsoluteZipPath)
      ? relativeOrAbsoluteZipPath
      : this.resolveStoragePath(relativeOrAbsoluteZipPath);
    let zip: AdmZip;
    try {
      zip = new AdmZip(absolute);
    } catch {
      throw new BadRequestException('Unable to read ZIP archive');
    }

    const members: ZipMember[] = [];
    const seen = new Set<string>();
    for (const entry of zip.getEntries()) {
      if (entry.isDirectory) continue;
      const raw = String(entry.entryName || '').replace(/\\/g, '/');
      if (!raw || raw.endsWith('/')) continue;
      const parts = raw.split('/').filter(Boolean);
      if (!parts.length) continue;
      if (parts.some((part) => part === '..' || part === '.' || part.includes('\0'))) {
        throw new BadRequestException(`ZIP contains an unsafe path: ${raw}`);
      }
      if (parts[0] === '__MACOSX' || parts.some((part) => part.startsWith('._'))) continue;
      const fileName = parts[parts.length - 1];
      if (!fileName || fileName === '.DS_Store' || fileName.toLowerCase() === 'thumbs.db') continue;

      const relativePath = parts.map((part) => this.safeSegment(part)).join('/');
      if (!relativePath || seen.has(relativePath)) continue;
      seen.add(relativePath);

      const data = entry.getData();
      if (!data?.length) continue;
      members.push({
        relativePath,
        fileName: basename(relativePath),
        data,
        size: data.length,
      });
    }

    if (!members.length) {
      throw new BadRequestException('ZIP archive has no extractable files');
    }
    return members;
  }

  async stageIncoming(fileName: string, data: Buffer) {
    const relativePath = join('incoming', `${Date.now()}-${this.safeSegment(fileName)}`).replace(/\\/g, '/');
    const absolutePath = this.resolveStoragePath(relativePath);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, data);
    return { relativePath, absolutePath };
  }

  async stageExternalImport(originalFileName: string, data: Buffer) {
    const safeName = this.safeSegment(originalFileName);
    const relativePath = join('staging', 'external-imports', `${Date.now()}-${safeName}`).replace(/\\/g, '/');
    const absolutePath = this.resolveStoragePath(relativePath);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, data);
    return { relativePath, absolutePath };
  }

  async cleanupStaging(relativePath: string) {
    if (!relativePath.replace(/\\/g, '/').startsWith('staging/external-imports/')) {
      throw new BadRequestException('Staging cleanup is limited to external-import staging paths');
    }
    await this.remove(relativePath);
  }

  /**
   * Deletes abandoned external-import staging files older than `maxAgeMs`
   * that are not present in `protectedRelativePaths`.
   */
  async cleanupAbandonedExternalStaging(protectedRelativePaths: Set<string>, maxAgeMs: number) {
    await mkdir(this.stagingRoot, { recursive: true });
    const entries = await readdir(this.stagingRoot, { withFileTypes: true });
    const cutoff = Date.now() - maxAgeMs;
    let removed = 0;
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const relativePath = join('staging', 'external-imports', entry.name).replace(/\\/g, '/');
      if (protectedRelativePaths.has(relativePath)) continue;
      const absolute = join(this.stagingRoot, entry.name);
      const info = await stat(absolute).catch(() => null);
      if (!info || info.mtimeMs > cutoff) continue;
      await unlink(absolute).catch(() => undefined);
      removed += 1;
    }
    return { removed };
  }

  sanitizeFileName(fileName: string) {
    return this.safeSegment(fileName);
  }

  async copyToRepository(incomingPath: string, repositoryRelativePath: string) {
    const source = isAbsolute(incomingPath) ? incomingPath : this.resolveStoragePath(incomingPath);
    const destination = this.resolveStoragePath(repositoryRelativePath);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(source, destination);
    return destination;
  }

  async remove(relativeOrAbsolutePath: string) {
    const target = isAbsolute(relativeOrAbsolutePath) ? relativeOrAbsolutePath : this.resolveStoragePath(relativeOrAbsolutePath);
    await unlink(target).catch(() => undefined);
  }

  async exists(relativeOrAbsolutePath: string) {
    const target = isAbsolute(relativeOrAbsolutePath)
      ? relativeOrAbsolutePath
      : this.resolveStoragePath(relativeOrAbsolutePath);
    try {
      await access(target);
      return true;
    } catch {
      return false;
    }
  }

  /** Remove empty parent directories up to (but not including) stopAtRelativePath. */
  async removeEmptyParents(fileRelativePath: string, stopAtRelativePath: string) {
    const stop = this.normaliseRelativePath(stopAtRelativePath).replace(/\/+$/, '');
    let current = dirname(fileRelativePath.replace(/\\/g, '/')).replace(/\\/g, '/');
    while (current && current !== '.' && current !== stop) {
      const normalised = current.replace(/\/+$/, '');
      if (!normalised.startsWith(`${stop}/`) && normalised !== stop) break;
      if (normalised === stop) break;
      if (!(await this.isDirectoryEmpty(normalised))) break;
      await this.removeDirectory(normalised);
      current = dirname(normalised).replace(/\\/g, '/');
    }
  }

  async moveRepositoryFile(fromRelative: string, toRelative: string) {
    const from = this.resolveStoragePath(fromRelative);
    const to = this.resolveStoragePath(toRelative);
    await mkdir(dirname(to), { recursive: true });
    if (from !== to) {
      await copyFile(from, to);
      await unlink(from).catch(() => undefined);
    }
    return to;
  }

  async writeRepositoryFile(repositoryRelativePath: string, data: Buffer) {
    const destination = this.resolveStoragePath(repositoryRelativePath);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, data);
    return destination;
  }

  async removeDirectory(relativeOrAbsolutePath: string) {
    const target = isAbsolute(relativeOrAbsolutePath) ? relativeOrAbsolutePath : this.resolveStoragePath(relativeOrAbsolutePath);
    await rm(target, { recursive: true, force: true }).catch(() => undefined);
  }

  async isDirectoryEmpty(relativePath: string) {
    const absolute = this.resolveStoragePath(relativePath);
    try {
      const entries = await readdir(absolute);
      return entries.filter((name) => !name.startsWith('.gateway-')).length === 0;
    } catch {
      return true;
    }
  }

  async renameDirectory(fromRelative: string, toRelative: string) {
    const from = this.resolveStoragePath(fromRelative);
    const to = this.resolveStoragePath(toRelative);
    if (from === to) return to;
    await mkdir(dirname(to), { recursive: true });
    await rename(from, to);
    return to;
  }

  async ensureProjectStructure(projectId: string) {
    const project = await this.db.projects.findOne({ where: { id: projectId }, relations: { sections: true } });
    if (!project) throw new NotFoundException('Project not found');
    const rootRelative = this.projectRelativeRoot(project);
    await mkdir(this.resolveStoragePath(rootRelative), { recursive: true });
    for (const section of (project.sections ?? []).filter((item) => item.active)) {
      const path = join(rootRelative, this.normaliseRelativePath(section.relativePath)).replace(/\\/g, '/');
      await mkdir(this.resolveStoragePath(path), { recursive: true });
    }
    await this.refreshRegisters(projectId);
    const lastSynchronisedAt = await this.touchSyncMarker(rootRelative);
    return {
      projectId,
      rootPath: rootRelative,
      sectionsCreated: (project.sections ?? []).filter((item) => item.active).length,
      lastSynchronisedAt,
    };
  }

  async refreshRegisters(projectId: string) {
    const project = await this.db.projects.findOne({ where: { id: projectId }, relations: { sections: true } });
    if (!project) throw new NotFoundException('Project not found');
    const [documents, versions] = await Promise.all([
      this.db.documents.find({ where: { project: { id: projectId } }, relations: { section: true }, order: { code: 'ASC' } }),
      this.db.documentVersions.createQueryBuilder('version')
        .leftJoinAndSelect('version.document', 'document')
        .leftJoinAndSelect('document.section', 'section')
        .leftJoin('document.project', 'project')
        .where('project.id = :projectId', { projectId })
        .orderBy('document.code', 'ASC').addOrderBy('version.createdAt', 'DESC').getMany(),
    ]);
    const masterSection = project.sections?.find((item) => item.sectionKey === 'MASTER_DOCUMENT_INDEX');
    const versionSection = project.sections?.find((item) => item.sectionKey === 'VERSION_REGISTER');
    const root = this.projectRelativeRoot(project);

    if (masterSection) {
      const rows = documents.map((document) => ({
        documentCode: document.code,
        title: document.title,
        project: project.code,
        repositorySection: document.section.name,
        documentType: document.documentType,
        currentVersion: document.currentVersionNo,
        status: document.status,
        owner: document.owner,
        updatedAt: document.updatedAt,
      }));
      const base = join(root, this.normaliseRelativePath(masterSection.relativePath)).replace(/\\/g, '/');
      await this.writeJsonAndCsv(base, 'master-document-index', rows, ['documentCode', 'title', 'project', 'repositorySection', 'documentType', 'currentVersion', 'status', 'owner', 'updatedAt']);
    }

    if (versionSection) {
      const rows = versions.map((version) => ({
        documentCode: version.document.code,
        title: version.document.title,
        version: version.versionNo,
        lifecycle: version.isCurrent ? 'CURRENT' : 'SUPERSEDED',
        approvedBy: version.approvedBy,
        approvalDate: version.approvalDate,
        originalFileName: version.originalFileName,
        checksumSha256: version.checksum,
        repositoryPath: version.storagePath,
        importedAt: version.createdAt,
      }));
      const base = join(root, this.normaliseRelativePath(versionSection.relativePath)).replace(/\\/g, '/');
      await this.writeJsonAndCsv(base, 'version-register', rows, ['documentCode', 'title', 'version', 'lifecycle', 'approvedBy', 'approvalDate', 'originalFileName', 'checksumSha256', 'repositoryPath', 'importedAt']);
    }
    return { documents: documents.length, versions: versions.length };
  }

  async tree(projectId: string) {
    const project = await this.db.projects.findOne({ where: { id: projectId }, relations: { sections: true } });
    if (!project) throw new NotFoundException('Project not found');
    const rootRelative = this.projectRelativeRoot(project);
    const rootAbsolute = this.resolveStoragePath(rootRelative);
    await mkdir(rootAbsolute, { recursive: true });
    const lastSynchronisedAt = await this.readSyncMarker(rootRelative);

    const versions = await this.db.documentVersions.createQueryBuilder('version')
      .leftJoinAndSelect('version.document', 'document')
      .leftJoinAndSelect('document.section', 'section')
      .leftJoin('document.project', 'project')
      .where('project.id = :projectId', { projectId })
      .getMany();
    const versionsByPath = new Map(versions.map((version) => [version.storagePath.replace(/\\/g, '/'), version]));
    const documentsByDirectory = new Map<string, typeof versions[number]['document']>();
    for (const version of versions) {
      const storagePath = version.storagePath.replace(/\\/g, '/');
      // ZIP pack members live under a shared pack folder (no /vX/ segment). Mapping those
      // parents as "document" collapses the pack into one node and hides sibling files.
      const meta = version.metadata as Record<string, unknown> | null | undefined;
      if (meta?.zipPack === true || meta?.zipEntry) continue;
      const documentDirectory = dirname(storagePath).replace(/\/v[^/]+$/, '');
      documentsByDirectory.set(documentDirectory, version.document);
    }
    const modulePaths = new Map((project.sections ?? []).map((section) => [
      join(rootRelative, this.normaliseRelativePath(section.relativePath)).replace(/\\/g, '/'),
      section,
    ]));

    return {
      project: { id: project.id, code: project.code, name: project.name, repositoryRootPath: project.repositoryRootPath },
      rootPath: rootRelative,
      lastSynchronisedAt,
      entries: await this.readTree(rootAbsolute, rootRelative, 0, { versionsByPath, documentsByDirectory, modulePaths, rootPath: rootRelative }),
    };
  }

  async health() {
    await mkdir(this.storageRoot, { recursive: true });
    const probe = join(this.storageRoot, `.gateway-write-test-${process.pid}`);
    await writeFile(probe, 'ok');
    await access(probe);
    await unlink(probe);
    const fs = await statfs(this.storageRoot);
    const totalBytes = Number(fs.blocks) * Number(fs.bsize);
    const availableBytes = Number(fs.bavail) * Number(fs.bsize);
    return {
      status: 'ok',
      mode: 'VPS_LOCAL_FILESYSTEM',
      storageRoot: this.storageRoot,
      repositoryRoot: this.repositoryRoot,
      writable: true,
      totalBytes,
      availableBytes,
      usedBytes: totalBytes - availableBytes,
    };
  }

  private async touchSyncMarker(rootRelative: string) {
    const markerRelative = join(rootRelative, '.gateway-last-sync').replace(/\\/g, '/');
    const markerAbsolute = this.resolveStoragePath(markerRelative);
    const stamp = new Date().toISOString();
    await writeFile(markerAbsolute, `${stamp}\n`, 'utf8');
    return stamp;
  }

  private async readSyncMarker(rootRelative: string) {
    const markerRelative = join(rootRelative, '.gateway-last-sync').replace(/\\/g, '/');
    const markerAbsolute = this.resolveStoragePath(markerRelative);
    try {
      const raw = (await readFile(markerAbsolute, 'utf8')).trim();
      if (raw && !Number.isNaN(Date.parse(raw))) return raw;
    } catch {
      // fall through to directory mtime
    }
    try {
      return (await stat(this.resolveStoragePath(rootRelative))).mtime.toISOString();
    } catch {
      return null;
    }
  }

  private safeSegment(value: string) {
    const cleaned = String(value ?? '').trim().replace(/[<>:"/\\|?*\u0000-\u001F]+/g, '-').replace(/[. ]+$/g, '').replace(/^-+|-+$/g, '');
    return cleaned || 'document';
  }

  private async writeJsonAndCsv(directoryRelative: string, fileBase: string, rows: Record<string, unknown>[], columns: string[]) {
    const directory = this.resolveStoragePath(directoryRelative);
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, `${fileBase}.json`), JSON.stringify({ generatedAt: new Date().toISOString(), rows }, null, 2));
    const csv = [columns.map(csvCell).join(','), ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(','))].join('\n');
    await writeFile(join(directory, `${fileBase}.csv`), `${csv}\n`);
  }

  private async readTree(
    absoluteDir: string,
    relativeDir: string,
    depth: number,
    mappings: {
      versionsByPath: Map<string, import('../database/entities').DocumentVersion>;
      documentsByDirectory: Map<string, import('../database/entities').Document>;
      modulePaths: Map<string, Project['sections'][number]>;
      rootPath: string;
    },
  ): Promise<TreeEntry[]> {
    if (depth > 14) return [];
    const entries = await readdir(absoluteDir, { withFileTypes: true });
    const output: TreeEntry[] = [];
    for (const entry of entries.sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name))) {
      const absolutePath = join(absoluteDir, entry.name);
      const relativePath = join(relativeDir, entry.name).replace(/\\/g, '/');
      if (entry.isDirectory()) {
        // Hide pack version history and internal gateway folders from the explorer.
        if (entry.name === '_history' || entry.name.startsWith('.gateway-')) continue;
        const children = await this.readTree(absolutePath, relativePath, depth + 1, mappings);
        const document = mappings.documentsByDirectory.get(relativePath);
        const section = mappings.modulePaths.get(relativePath);
        const isVersion = /\/v[^/]+$/.test(relativePath);
        // Keep configured modules/registers even when empty; hide empty orphan folders.
        if (!section && children.length === 0) continue;
        output.push({
          name: entry.name,
          path: relativePath,
          type: 'directory',
          nodeType: section ? (section.sectionKey === 'MASTER_DOCUMENT_INDEX' || section.sectionKey === 'VERSION_REGISTER' ? 'register' : 'module') : document ? 'document' : isVersion ? 'version' : 'folder',
          documentId: document?.id,
          sectionId: section?.id,
          documentCode: document?.code,
          status: document?.status,
          versionNo: isVersion ? entry.name.replace(/^v/i, '') : undefined,
          childCount: children.length,
          children,
        });
      } else if (entry.isFile()) {
        if (entry.name.startsWith('.gateway-')) continue;
        const version = mappings.versionsByPath.get(relativePath);
        // Production tree only exposes files mapped to imported document versions.
        if (!version?.document?.id) continue;
        const info = await stat(absolutePath);
        output.push({
          name: entry.name,
          path: relativePath,
          type: 'file',
          nodeType: 'file',
          documentId: version.document.id,
          versionId: version.id,
          documentCode: version.document.code,
          versionNo: version.versionNo,
          status: version.isCurrent ? 'CURRENT' : 'SUPERSEDED',
          mimeType: version.mimeType,
          size: info.size,
          modifiedAt: info.mtime,
        });
      }
    }
    return output;
  }
}
