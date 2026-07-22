import { Test, TestingModule } from '@nestjs/testing';
import { DashboardController } from './dashboard.controller';
import { DatabaseService } from '../database/database.service';
import { BadRequestException } from '@nestjs/common';

// Mock repository with count/find/createQueryBuilder
function mockRepo() {
  return {
    count: jest.fn().mockResolvedValue(0),
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    createQueryBuilder: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(0),
      getRawMany: jest.fn().mockResolvedValue([]),
      getRawOne: jest.fn().mockResolvedValue({ usedBytes: '0' }),
    })),
  };
}

describe('DashboardController', () => {
  let controller: DashboardController;
  let dbService: any;

  beforeEach(async () => {
    dbService = {
      users: mockRepo(),
      documents: mockRepo(),
      documentVersions: mockRepo(),
      importJobs: mockRepo(),
      auditLogs: mockRepo(),
      projects: mockRepo(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DashboardController],
      providers: [{ provide: DatabaseService, useValue: dbService }],
    }).compile();

    controller = module.get<DashboardController>(DashboardController);
  });

  describe('health', () => {
    it('returns ok status', () => {
      const result = controller.health();
      expect(result.status).toBe('ok');
      expect(result.service).toBe('repository-import-gateway');
      expect(result.timestamp).toBeDefined();
    });
  });

  describe('dashboard', () => {
    const mockReq = { user: { id: 'user-1', email: 'admin@test.com', role: 'admin' } };

    it('resolves user from database by req.user.id', async () => {
      dbService.users.findOne.mockResolvedValue({
        id: 'user-1',
        name: 'Wayne Test',
        email: 'wayne@test.com',
      });

      const result = await controller.dashboard(mockReq);

      expect(dbService.users.findOne).toHaveBeenCalledWith({ where: { id: 'user-1' } });
      expect(result.user.displayName).toBe('Wayne Test');
      expect(result.user.firstName).toBe('Wayne');
      expect(result.user.email).toBe('wayne@test.com');
    });

    it('falls back to "User" when user not found in DB', async () => {
      dbService.users.findOne.mockResolvedValue(null);

      const result = await controller.dashboard(mockReq);

      expect(result.user.displayName).toBe('User');
      expect(result.user.firstName).toBe('User');
    });

    it('validates date range - rejects invalid dates', async () => {
      await expect(
        controller.dashboard(mockReq, 'not-a-date', '2024-01-01'),
      ).rejects.toThrow(BadRequestException);
    });

    it('validates date range - rejects from > to', async () => {
      await expect(
        controller.dashboard(mockReq, '2024-06-01', '2024-01-01'),
      ).rejects.toThrow(BadRequestException);
    });

    it('accepts valid custom date range', async () => {
      const result = await controller.dashboard(mockReq, '2024-01-01', '2024-06-30');

      expect(result.dateRange.label).toBe('Custom range');
      expect(new Date(result.dateRange.from).getFullYear()).toBe(2024);
    });

    it('defaults to last 30 days when no date params', async () => {
      const result = await controller.dashboard(mockReq);

      expect(result.dateRange.label).toBe('Last 30 days');
      const from = new Date(result.dateRange.from);
      const to = new Date(result.dateRange.to);
      const daysDiff = Math.round((to.getTime() - from.getTime()) / 86400000);
      expect(daysDiff).toBeGreaterThanOrEqual(29);
      expect(daysDiff).toBeLessThanOrEqual(31);
    });

    it('compliance returns NOT_ASSESSED with null percentage when no data', async () => {
      // All version counts return 0 (default mock)
      const result = await controller.dashboard(mockReq);

      expect(result.compliance.status).toBe('NOT_ASSESSED');
      expect(result.compliance.percentage).toBeNull();
      expect(result.compliance.assessed).toBe(0);
    });

    it('compliance returns ASSESSED with correct percentage when data exists', async () => {
      // Use mockImplementation to return different values based on query args
      dbService.documentVersions.count.mockImplementation((options?: any) => {
        if (!options?.where) return Promise.resolve(0);
        const where = options.where;
        if (where.approvalStatus === 'APPROVED') return Promise.resolve(8);
        if (where.approvalStatus === 'PENDING_REVIEW') return Promise.resolve(1);
        if (where.approvalStatus === 'REJECTED') return Promise.resolve(1);
        return Promise.resolve(0);
      });

      const result = await controller.dashboard(mockReq);

      expect(result.compliance.status).toBe('ASSESSED');
      expect(result.compliance.percentage).toBe(80);
      expect(result.compliance.compliant).toBe(8);
      expect(result.compliance.atRisk).toBe(1);
      expect(result.compliance.nonCompliant).toBe(1);
    });

    it('does not return pendingApprovals field', async () => {
      const result = await controller.dashboard(mockReq);

      expect((result as any).pendingApprovals).toBeUndefined();
      expect(result.documentsRequiringAttention).toBeDefined();
      expect(Array.isArray(result.documentsRequiringAttention)).toBe(true);
    });

    it('returns all expected response sections', async () => {
      const result = await controller.dashboard(mockReq);

      expect(result.user).toBeDefined();
      expect(result.generatedAt).toBeDefined();
      expect(result.dateRange).toBeDefined();
      expect(result.metrics).toBeDefined();
      expect(result.metrics.totalDocuments).toBeDefined();
      expect(result.metrics.currentVersions).toBeDefined();
      expect(result.metrics.importedInPeriod).toBeDefined();
      expect(result.metrics.requiresAttention).toBeDefined();
      expect(result.metrics.failedImports).toBeDefined();
      expect(result.documentsOverTime).toBeDefined();
      expect(result.statusDistribution).toBeDefined();
      expect(result.recentDocuments).toBeDefined();
      expect(result.documentsRequiringAttention).toBeDefined();
      expect(result.documentTypes).toBeDefined();
      expect(result.projectDistribution).toBeDefined();
      expect(result.compliance).toBeDefined();
      expect(result.storage).toBeDefined();
      expect(result.recentActivity).toBeDefined();
    });

    it('does not contain dummy data or hardcoded values', async () => {
      const result = await controller.dashboard(mockReq);

      // All metrics should be 0 when DB is empty
      expect(result.metrics.totalDocuments.value).toBe(0);
      expect(result.metrics.currentVersions.value).toBe(0);
      expect(result.metrics.importedInPeriod.value).toBe(0);
      expect(result.metrics.requiresAttention.value).toBe(0);
      expect(result.metrics.failedImports.value).toBe(0);
      expect(result.storage.usedBytes).toBe(0);
    });

    it('storage reads actual sum from documentVersions', async () => {
      // Override createQueryBuilder to return 50GB for the storage query
      const qb = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(0),
        getRawMany: jest.fn().mockResolvedValue([]),
        getRawOne: jest.fn().mockResolvedValue({ usedBytes: '53687091200' }),
      };
      dbService.documentVersions.createQueryBuilder.mockReturnValue(qb);

      const result = await controller.dashboard(mockReq);

      expect(result.storage.usedBytes).toBe(53687091200);
      expect(result.storage.percentageUsed).toBe(50);
    });
  });
});
