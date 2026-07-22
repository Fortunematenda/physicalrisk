import { ConfigurationService } from './configuration.service';

describe('ConfigurationService create-from-import', () => {
  const audit = { record: jest.fn() };
  const storage = { ensureProjectStructure: jest.fn() };
  const projects = {
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(),
    save: jest.fn(),
  };
  const projectSections = {
    findOne: jest.fn(),
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => ({ id: 'section-1', ...value })),
    count: jest.fn(async () => 2),
    createQueryBuilder: jest.fn(),
  };
  const sourceSystems = {
    findOne: jest.fn(),
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => ({ id: 'source-1', ...value, createdAt: new Date(), updatedAt: new Date() })),
    createQueryBuilder: jest.fn(),
  };
  const documentTypes = {
    findOne: jest.fn(),
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => ({ id: 'type-1', ...value, createdAt: new Date(), updatedAt: new Date() })),
    createQueryBuilder: jest.fn(),
  };
  const directoryTemplates = {
    findOne: jest.fn(),
  };
  const dataSource = {
    transaction: jest.fn(async (callback: any) => callback({
      getRepository: () => ({
        create: (value: unknown) => value,
        save: async (value: any) => Array.isArray(value) ? value : { id: 'project-1', ...value },
      }),
    })),
  };

  const service = new ConfigurationService(
    {
      projects,
      projectSections,
      sourceSystems,
      documentTypes,
      directoryTemplates,
      dataSource,
      documents: { count: jest.fn() },
      importJobs: { count: jest.fn() },
    } as any,
    audit as any,
    storage as any,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    const emptyQb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null),
    };
    projects.createQueryBuilder.mockReturnValue(emptyQb);
    projectSections.createQueryBuilder.mockReturnValue(emptyQb);
    sourceSystems.createQueryBuilder.mockReturnValue(emptyQb);
    documentTypes.createQueryBuilder.mockReturnValue(emptyQb);
    projects.findOne.mockResolvedValue(null);
    projectSections.findOne.mockResolvedValue(null);
    sourceSystems.findOne.mockResolvedValue(null);
    documentTypes.findOne.mockResolvedValue(null);
    directoryTemplates.findOne.mockResolvedValue({
      id: 'template-1',
      sections: [],
    });
    (service as any).getProject = jest.fn(async (id: string) => ({ id, code: 'ABC', name: 'Alpha', sections: [] }));
  });

  it('creates a document type and writes import audit action', async () => {
    const created = await service.createDocumentType({
      name: '  Security Architecture  ',
      origin: 'IMPORT_DOCUMENT',
    }, 'user-1');

    expect(created.name).toBe('Security Architecture');
    expect(created.code).toBe('SECURITY_ARCHITECTURE');
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({
      action: 'DOCUMENT_TYPE_CREATED_FROM_IMPORT',
      entityType: 'DocumentType',
      userId: 'user-1',
    }));
  });

  it('rejects duplicate document type names case-insensitively', async () => {
    documentTypes.createQueryBuilder.mockReturnValue({
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue({ id: 'existing', name: 'Technical Specification', code: 'TS' }),
    });

    await expect(service.createDocumentType({ name: 'technical specification' }))
      .rejects.toMatchObject({ response: { code: 'DOCUMENT_TYPE_ALREADY_EXISTS' } });
  });

  it('creates a source system with trimmed values and audit', async () => {
    const created = await service.createSource({
      name: '  Future Portal  ',
      type: 'API_WORKFLOW',
      origin: 'IMPORT_DOCUMENT',
    }, 'user-1');

    expect(created.name).toBe('Future Portal');
    expect(created.code).toBe('FUTURE_PORTAL');
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({
      action: 'SOURCE_SYSTEM_CREATED_FROM_IMPORT',
      entityType: 'SourceSystem',
    }));
  });

  it('rejects duplicate source system names', async () => {
    sourceSystems.createQueryBuilder.mockReturnValue({
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue({ id: 'existing', name: 'ChatGPT', code: 'CHATGPT' }),
    });

    await expect(service.createSource({ name: 'chatgpt' }))
      .rejects.toMatchObject({ response: { code: 'SOURCE_SYSTEM_ALREADY_EXISTS' } });
  });

  it('creates a project through the registry and provisions storage', async () => {
    const created = await service.createProject({
      code: 'abc',
      name: 'Alpha Project',
      origin: 'IMPORT_DOCUMENT',
    }, 'user-1');

    expect(created.id).toBe('project-1');
    expect(storage.ensureProjectStructure).toHaveBeenCalledWith('project-1');
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({
      action: 'PROJECT_CREATED_FROM_IMPORT',
      entityType: 'Project',
    }));
  });

  it('rejects duplicate project codes', async () => {
    projects.findOne.mockResolvedValue({ id: 'existing', code: 'ABC', name: 'Existing' });
    await expect(service.createProject({ code: 'ABC', name: 'New' }))
      .rejects.toMatchObject({ response: { code: 'PROJECT_ALREADY_EXISTS' } });
  });

  it('creates a repository section scoped to the selected project', async () => {
    projects.findOne.mockResolvedValue({ id: 'project-1', code: 'ABC', name: 'Alpha' });
    const created = await service.createProjectSection('project-1', {
      name: 'Security Architecture',
      origin: 'IMPORT_DOCUMENT',
    }, 'user-1');

    expect(created.sectionKey).toBe('SECURITY_ARCHITECTURE');
    expect(created.relativePath).toBe('Security Architecture');
    expect(storage.ensureProjectStructure).toHaveBeenCalledWith('project-1');
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({
      action: 'REPOSITORY_SECTION_CREATED_FROM_IMPORT',
      entityType: 'ProjectSection',
    }));
  });

  it('requires a project when creating a repository section', async () => {
    await expect(service.createProjectSection('', { name: 'Anything' }))
      .rejects.toMatchObject({ response: { code: 'PROJECT_REQUIRED' } });
  });

  it('rejects duplicate repository section names within a project', async () => {
    projects.findOne.mockResolvedValue({ id: 'project-1' });
    projectSections.createQueryBuilder.mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue({ id: 'existing', name: 'Security Architecture', code: 'SA' }),
    });

    await expect(service.createProjectSection('project-1', { name: 'security architecture' }))
      .rejects.toMatchObject({ response: { code: 'REPOSITORY_MODULE_ALREADY_EXISTS' } });
  });
});
