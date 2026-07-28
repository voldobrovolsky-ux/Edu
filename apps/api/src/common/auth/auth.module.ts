import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { FlorService } from './flor.service';
import { FlorController } from './flor.controller';

// Identity-слой (ADR-0005). Глобальный — FlorService доступен APP_GUARD'у.
@Global()
@Module({
  imports: [PrismaModule],
  controllers: [FlorController],
  providers: [FlorService],
  exports: [FlorService],
})
export class AuthModule {}
