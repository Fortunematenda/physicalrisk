import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SiteStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import type { AuthUser } from '../../common/current-user.decorator';
import { INTERNAL_ROLES } from '../../common/roles';

@Injectable()
export class MossSitesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async requireOrgAccess(organisationId: string, user: AuthUser) {
    const org = await this.prisma.organisation.findUnique({ where: { id: organisationId }, select: { id: true } });
    if (!org) throw new NotFoundException('Organisation not found.');
    if (INTERNAL_ROLES.has(user.role)) return;
    const membership = await this.prisma.membership.findUnique({
      where: { userId_organisationId: { userId: user.id, organisationId } },
    });
    if (!membership) throw new BadRequestException('You do not have access to this organisation.');
  }

  list(organisationId: string, user: AuthUser) {
    return this.requireOrgAccess(organisationId, user).then(() =>
      this.prisma.site.findMany({
        where: { organisationId },
        orderBy: [{ status: 'asc' }, { name: 'asc' }],
      }),
    );
  }

  async create(
    organisationId: string,
    data: { name: string; siteCode: string; address?: string; region?: string; description?: string },
    user: AuthUser,
  ) {
    await this.requireOrgAccess(organisationId, user);
    const siteCode = data.siteCode.trim().toUpperCase();
    if (!siteCode) throw new BadRequestException('siteCode is required.');
    if (!data.name?.trim()) throw new BadRequestException('name is required.');
    try {
      const site = await this.prisma.site.create({
        data: {
          organisationId,
          name: data.name.trim(),
          siteCode,
          address: data.address?.trim() || null,
          region: data.region?.trim() || null,
          description: data.description?.trim() || null,
          status: SiteStatus.ACTIVE,
        },
      });
      await this.audit.record({
        userId: user.id,
        action: 'MOSS_SITE_CREATED',
        entityType: 'Site',
        entityId: site.id,
        organisationId,
        metadata: { siteCode: site.siteCode },
      });
      return site;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new BadRequestException('A site with this siteCode already exists for the organisation.');
      }
      throw error;
    }
  }

  async get(id: string, user: AuthUser) {
    const site = await this.prisma.site.findUnique({ where: { id } });
    if (!site) throw new NotFoundException('Site not found.');
    await this.requireOrgAccess(site.organisationId, user);
    return site;
  }

  async update(
    id: string,
    data: { name?: string; address?: string | null; region?: string | null; description?: string | null; status?: 'ACTIVE' | 'INACTIVE' },
    user: AuthUser,
  ) {
    const site = await this.get(id, user);
    return this.prisma.site.update({
      where: { id: site.id },
      data: {
        ...(data.name !== undefined ? { name: data.name.trim() } : {}),
        ...(data.address !== undefined ? { address: data.address } : {}),
        ...(data.region !== undefined ? { region: data.region } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.status !== undefined ? { status: data.status as SiteStatus } : {}),
      },
    });
  }
}
