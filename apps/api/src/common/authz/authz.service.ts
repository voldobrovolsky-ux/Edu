import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { syncAuthzCatalog } from './catalog';

export interface ResolvedAccess {
  cabinet: string; // какой кабинет открыть (CabinetKey)
  permissions: string[]; // коды доступных действий
}

/**
 * Резолвер доступа (§5.1): кабинет и права берутся ИЗ КАТАЛОГА (БД), не из кода.
 * Единственный код-шим — маппинг (florusRole, subRole) → ключ пакета; всё остальное —
 * данные. На старте идемпотентно засевает каталог (boot-sync), чтобы он был в любой среде.
 */
@Injectable()
export class AuthzService implements OnModuleInit {
  private readonly log = new Logger('Authz');

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    await syncAuthzCatalog(this.prisma);
    this.log.log('каталог прав синхронизирован (boot-sync)');
  }

  /** Тонкий шим: роль/суб-роль → ключ пакета. staff → суб-роль (дефолт methodist). */
  packageKey(role: string, subRole?: string | null): string {
    return role === 'staff' ? subRole ?? 'methodist' : role;
  }

  async resolveAccess(role: string, subRole?: string | null): Promise<ResolvedAccess> {
    const key = this.packageKey(role, subRole);
    const pkg = await this.prisma.rolePackage.findUnique({
      where: { key },
      include: { permissions: { include: { permission: true } } },
    });
    // нет пакета в каталоге → пустой доступ; кабинет = ключ (безопасный fallback)
    if (!pkg) return { cabinet: key, permissions: [] };
    return { cabinet: pkg.cabinet, permissions: pkg.permissions.map((rp) => rp.permission.code) };
  }
}
