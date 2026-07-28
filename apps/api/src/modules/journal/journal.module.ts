import { Module } from '@nestjs/common';
import { JournalController } from './journal.controller';
import { JournalService } from './journal.service';

/** Модуль «журнал»: CRUD оценок, сводка класса. */
@Module({
  controllers: [JournalController],
  providers: [JournalService],
  exports: [JournalService],
})
export class JournalModule {}
