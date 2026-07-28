import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditService } from './audit.service';
import { AuditController } from './audit.controller';

// Audit-леджер (§4.8). EventBus/Inbox — из глобального EventsModule.
@Module({
  imports: [PrismaModule],
  controllers: [AuditController],
  providers: [AuditService],
})
export class AuditModule {}
