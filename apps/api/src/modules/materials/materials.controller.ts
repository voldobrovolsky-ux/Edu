import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import type { LessonMaterial } from '@edustore/shared';
import { MaterialsService } from './materials.service';
import { RequireEntitlement } from '../../common/entitlements/require-entitlement.decorator';

/** Тело /generate/* — указываем урок, для которого делаем материал. */
interface GenerateBody {
  lessonId: string;
}

// §5.2: модуль материалов/генерации — за активным entitlement lms.core (гейт загрузки).
@RequireEntitlement('lms.core')
@Controller()
export class MaterialsController {
  constructor(private readonly materialsService: MaterialsService) {}

  /** GET /api/materials/:lessonId — материалы урока. */
  @Get('materials/:lessonId')
  list(@Param('lessonId') lessonId: string): Promise<LessonMaterial[]> {
    return this.materialsService.listForLesson(lessonId);
  }

  /** POST /api/generate/lesson-plan — заглушка генерации плана-конспекта. */
  @Post('generate/lesson-plan')
  lessonPlan(@Body() body: GenerateBody): Promise<LessonMaterial> {
    return this.materialsService.generate('lesson-plan', body.lessonId);
  }

  /** POST /api/generate/presentation — заглушка генерации презентации. */
  @Post('generate/presentation')
  presentation(@Body() body: GenerateBody): Promise<LessonMaterial> {
    return this.materialsService.generate('presentation', body.lessonId);
  }

  /** POST /api/generate/brief-test — заглушка генерации краткого теста. */
  @Post('generate/brief-test')
  briefTest(@Body() body: GenerateBody): Promise<LessonMaterial> {
    return this.materialsService.generate('brief-test', body.lessonId);
  }

  /** POST /api/generate/control-work — заглушка генерации контрольной. */
  @Post('generate/control-work')
  controlWork(@Body() body: GenerateBody): Promise<LessonMaterial> {
    return this.materialsService.generate('control-work', body.lessonId);
  }

  /** POST /api/generate/exam — заглушка генерации экзаменационной работы. */
  @Post('generate/exam')
  exam(@Body() body: GenerateBody): Promise<LessonMaterial> {
    return this.materialsService.generate('exam', body.lessonId);
  }
}
