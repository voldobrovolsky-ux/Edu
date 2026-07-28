import { Injectable, NotFoundException } from '@nestjs/common';
import { GradeSource } from '@prisma/client';
import { TenantContext } from '../../common/tenant/tenant-context';
import type {
  GradeValue,
  JournalColumn,
  JournalData,
  JournalRow,
} from '@edustore/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  cellToGradeData,
  formatDay,
  gradeToCell,
  rowAverage,
  ruWeekday,
} from '../../common/grade.util';
import { SetGradeDto, UpdateGradeDto } from './dto/set-grade.dto';

/** Домен «журнал»: сетка оценок класса×предмета, сводка, CRUD оценок. */
@Injectable()
export class JournalService {
  constructor(private readonly prisma: PrismaService) {}

  /** Полная сетка журнала: колонки-уроки, строки-ученики, сводка. */
  async getJournal(classId: string, subjectId?: string): Promise<JournalData> {
    const klass = await this.prisma.class.findUnique({
      where: { id: classId },
    });
    if (!klass) {
      throw new NotFoundException(`Класс ${classId} не найден`);
    }

    // Если предмет не задан — берём первый предмет, по которому есть уроки.
    const effectiveSubjectId =
      subjectId ?? (await this.firstSubjectId(classId));

    const subject = effectiveSubjectId
      ? await this.prisma.subject.findUnique({ where: { id: effectiveSubjectId } })
      : null;

    const lessons = await this.prisma.lesson.findMany({
      where: {
        classId,
        ...(effectiveSubjectId ? { subjectId: effectiveSubjectId } : {}),
      },
      orderBy: { date: 'asc' },
    });

    const students = await this.prisma.student.findMany({
      where: { classId },
      orderBy: { number: 'asc' },
    });

    const lessonIds = lessons.map((l) => l.id);
    const grades = lessonIds.length
      ? await this.prisma.grade.findMany({
          where: { lessonId: { in: lessonIds } },
        })
      : [];

    // Быстрый доступ: studentId → lessonId → запись.
    const byStudent = new Map<
      string,
      Map<string, { value: number | null; absent: boolean }>
    >();
    for (const g of grades) {
      let row = byStudent.get(g.studentId);
      if (!row) {
        row = new Map();
        byStudent.set(g.studentId, row);
      }
      row.set(g.lessonId, { value: g.value, absent: g.absent });
    }

    const columns: JournalColumn[] = lessons.map((l) => ({
      lessonId: l.id,
      day: formatDay(l.date),
      wd: ruWeekday(l.date),
    }));

    const rows: JournalRow[] = students.map((s) =>
      this.buildRow(s, lessons.map((l) => l.id), byStudent.get(s.id)),
    );

    // Сводка: средний по выставленным баллам, посещаемость, число учеников.
    const allCells = rows.flatMap((r) => r.grades);
    const summaryAvg = rowAverage(allCells);
    const marked = allCells.filter((c) => c !== '');
    const present = marked.filter((c) => c !== 'н').length;
    const attendance = marked.length
      ? Math.round((present / marked.length) * 100)
      : 0;

    return {
      classLabel: klass.label,
      subject: subject?.name ?? '',
      columns,
      rows,
      summary: { avg: summaryAvg, attendance, count: students.length },
    };
  }

  /** Upsert/снятие оценки в ячейке. Возвращает обновлённую строку ученика. */
  async setGrade(dto: SetGradeDto, teacherId: string): Promise<JournalRow> {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: dto.lessonId },
      select: { classId: true, subjectId: true },
    });
    if (!lesson) {
      throw new NotFoundException(`Урок ${dto.lessonId} не найден`);
    }

    const data = cellToGradeData(dto.value);
    const source = (dto.source as GradeSource) ?? GradeSource.MANUAL;

    if (data === null) {
      // Пустое значение — удаляем оценку, если она была.
      await this.prisma.grade.deleteMany({
        where: { studentId: dto.studentId, lessonId: dto.lessonId },
      });
    } else {
      await this.prisma.grade.upsert({
        where: {
          studentId_lessonId: {
            studentId: dto.studentId,
            lessonId: dto.lessonId,
          },
        },
        create: {
          workspaceId: TenantContext.require(), // тенант = школа урока (активный контекст)
          studentId: dto.studentId,
          lessonId: dto.lessonId,
          value: data.value,
          absent: data.absent,
          comment: dto.comment ?? null,
          createdBy: teacherId,
          source,
        },
        update: {
          value: data.value,
          absent: data.absent,
          ...(dto.comment !== undefined ? { comment: dto.comment } : {}),
          source,
        },
      });
    }

    return this.studentRow(dto.studentId, lesson.classId, lesson.subjectId);
  }

  /** Правка существующей оценки по её id. Возвращает строку ученика. */
  async updateGrade(gradeId: string, dto: UpdateGradeDto): Promise<JournalRow> {
    const grade = await this.prisma.grade.findUnique({
      where: { id: gradeId },
      include: { lesson: { select: { classId: true, subjectId: true } } },
    });
    if (!grade) {
      throw new NotFoundException(`Оценка ${gradeId} не найдена`);
    }

    const data = cellToGradeData(dto.value);
    if (data === null) {
      await this.prisma.grade.delete({ where: { id: gradeId } });
    } else {
      await this.prisma.grade.update({
        where: { id: gradeId },
        data: {
          value: data.value,
          absent: data.absent,
          ...(dto.comment !== undefined ? { comment: dto.comment } : {}),
          ...(dto.source ? { source: dto.source as GradeSource } : {}),
        },
      });
    }

    return this.studentRow(
      grade.studentId,
      grade.lesson.classId,
      grade.lesson.subjectId,
    );
  }

  /** Строит JournalRow ученика для заданного набора уроков (по порядку). */
  private buildRow(
    student: { id: string; number: number; displayName: string },
    lessonIds: string[],
    studentGrades?: Map<string, { value: number | null; absent: boolean }>,
  ): JournalRow {
    const grades: GradeValue[] = lessonIds.map((lessonId) =>
      gradeToCell(studentGrades?.get(lessonId)),
    );
    return {
      studentId: student.id,
      number: student.number,
      name: student.displayName,
      grades,
      avg: rowAverage(grades),
    };
  }

  /** Перестраивает строку одного ученика по уроку класса×предмета. */
  private async studentRow(
    studentId: string,
    classId: string,
    subjectId: string,
  ): Promise<JournalRow> {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
    });
    if (!student) {
      throw new NotFoundException(`Ученик ${studentId} не найден`);
    }

    const lessons = await this.prisma.lesson.findMany({
      where: { classId, subjectId },
      orderBy: { date: 'asc' },
      select: { id: true },
    });
    const lessonIds = lessons.map((l) => l.id);

    const grades = lessonIds.length
      ? await this.prisma.grade.findMany({
          where: { studentId, lessonId: { in: lessonIds } },
        })
      : [];
    const byLesson = new Map(
      grades.map((g) => [g.lessonId, { value: g.value, absent: g.absent }]),
    );

    return this.buildRow(student, lessonIds, byLesson);
  }

  /** Первый предмет, по которому у класса есть уроки (для журнала без subjectId). */
  private async firstSubjectId(classId: string): Promise<string | undefined> {
    const lesson = await this.prisma.lesson.findFirst({
      where: { classId },
      orderBy: { date: 'asc' },
      select: { subjectId: true },
    });
    return lesson?.subjectId;
  }
}
