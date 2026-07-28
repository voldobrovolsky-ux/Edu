import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { EngineService } from './engine.service';
import { EngineController } from './engine.controller';
import { EngineHandlers } from './engine.handlers';
import { IomService } from './iom.service';
import { IomHandlers } from './iom.handlers';
import { AssessmentService } from './assessment.service';
import { JournalService } from './journal.service';
import { AnalyticsService } from './analytics.service';

// Образовательный движок (Phase 1) целиком: планирование (КТП/Timetable/КПП Solver + Lesson FSM)
// + ИОМ-аккумулятор + петля летучки + журнал (grade.posted) + персонализация (Архстандарт §7/§8).
// Шина/outbox — из глобального EventsModule.
@Module({
  imports: [PrismaModule],
  controllers: [EngineController],
  providers: [EngineService, EngineHandlers, IomService, IomHandlers, AssessmentService, JournalService, AnalyticsService],
})
export class EngineModule {}
