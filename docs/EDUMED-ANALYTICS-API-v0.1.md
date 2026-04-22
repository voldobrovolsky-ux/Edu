# EDUMED Analytics API v0.1

Базовая аналитика “on-the-fly” (без отдельных таблиц средних/итоговых). Источники данных:

- **Уроки**: `TimetableLesson`, отфильтрованные как “эффективные” (учитывая перекрытия календаря) — логика аналогична `/api/timetable/effective-lessons`.
- **Оценки и отсутствия**: только из `journalStore` (`JournalLessonStudentMark`, привязка `timetableLessonId`).
- **Диапазоны итоговых оценок**: `Discipline.gradeRanges`, расчёт итоговой — через `computeFinalMark`.
- **Нагрузка учителя**: `TeacherLoad` (какие `disciplineCode` доступны учителю).
- **Ученики/класс**: `StudentProfile` + `studentCode` (grade/group) + `User` для ФИО.

## Общие правила доступа

- **director / head_teacher**: имеют доступ к `overview` и `classes` по всей школе.
- **teacher**: имеет доступ к `overview` (только по своим урокам) и `teacher` (детализация по своим дисциплинам/классам).
- **parent / student**: доступа к аналитике нет (403).

## Формат периода

Во всех эндпоинтах используются query-параметры:

- `from`: `YYYY-MM-DD`
- `to`: `YYYY-MM-DD`

Пресеты “неделя/месяц/четверть” на фронте можно пока реализовать просто как подбор `from/to`.

## 1) GET `/api/analytics/overview?from=&to=&minAverage=&minAttendancePercent=`

Обзор по школе (director/head_teacher) или по собственным урокам (teacher).

### Query

- `from` (required)
- `to` (required)
- `minAverage` (optional, default `3`) — порог “зоны риска” по среднему баллу (только director/head_teacher)
- `minAttendancePercent` (optional, default `90`) — порог “зоны риска” по посещаемости (только director/head_teacher)

### Response (пример)

```json
{
  "from": "2026-03-01",
  "to": "2026-03-31",
  "scope": { "role": "director" },
  "overview": { "averageMark": 3.76, "attendancePercent": 92.1 },
  "byGrade": [
    { "grade": 5, "averageMark": 3.62, "attendancePercent": 90.4 }
  ],
  "byDiscipline": [
    { "disciplineCode": "MATEM5", "disciplineName": "Математика", "averageMark": 3.55, "attendancePercent": 91.2 }
  ],
  "byGradeDiscipline": [
    { "grade": 5, "disciplineCode": "MATEM5", "disciplineName": "Математика", "averageMark": 3.55, "attendancePercent": 91.2 }
  ],
  "riskZones": {
    "thresholds": { "minAverage": 3, "minAttendancePercent": 90 },
    "lowAverage": { "grades": [], "disciplines": [] },
    "lowAttendance": { "grades": [], "disciplines": [] }
  },
  "teacher": null
}
```

Примечания:

- `averageMark` считается по всем **существующим** оценкам (1..5) в журнале внутри периода.
- `attendancePercent` считается по “ячейкам присутствия” (урок × применимый ученик): absent=true → пропуск, иначе присутствие. Если отметки нет — считается как присутствие (по умолчанию absent=false в журнале).

## 2) GET `/api/analytics/classes?from=&to=&grade=&disciplineCode=`

Срез по классу/параллели (в текущей модели EDUMED класс = `grade`; группы учитываются при применимости урока).

### Доступ

Только `director` / `head_teacher`.

### Query

- `from` (required)
- `to` (required)
- `grade` (optional) — если задан, агрегаты будут только для этого grade
- `disciplineCode` (optional) — если задан, агрегаты будут только для дисциплины

### Response (пример)

```json
{
  "from": "2026-03-01",
  "to": "2026-03-31",
  "scope": { "role": "head_teacher" },
  "filter": { "grade": 5, "disciplineCode": null },
  "overview": { "averageMark": 3.62, "attendancePercent": 90.4 },
  "byGrade": [
    { "grade": 5, "averageMark": 3.62, "attendancePercent": 90.4 }
  ],
  "byDiscipline": [
    { "disciplineCode": "MATEM5", "disciplineName": "Математика", "averageMark": 3.55, "attendancePercent": 91.2 }
  ],
  "byGradeDiscipline": [
    { "grade": 5, "disciplineCode": "MATEM5", "disciplineName": "Математика", "averageMark": 3.55, "attendancePercent": 91.2 }
  ]
}
```

## 3) GET `/api/analytics/teacher?from=&to=`

Детальная аналитика учителя: только его дисциплины/классы (на основе `TeacherLoad` + уроков `TimetableLesson.teacherUserId` + журнал).

### Доступ

Только `teacher`.

### Response (пример)

```json
{
  "from": "2026-03-01",
  "to": "2026-03-31",
  "scope": { "role": "teacher", "teacherUserId": "..." },
  "panels": [
    {
      "grade": 5,
      "disciplineCode": "MATEM5",
      "disciplineName": "Математика",
      "averageMark": 3.55,
      "attendancePercent": 91.2,
      "students": [
        {
          "studentUserId": "...",
          "fio": "Иванов Иван Иванович",
          "groupNumber": 1,
          "average": 3.8,
          "finalMark": 4,
          "attendancePercent": 95.0
        }
      ]
    }
  ]
}
```

Примечания:

- `finalMark` вычисляется по `Discipline.gradeRanges` конкретной дисциплины и среднему за период.
- В `students[].attendancePercent` знаменатель — количество применимых уроков (учитывая `groupNumber` урока и ученика).

