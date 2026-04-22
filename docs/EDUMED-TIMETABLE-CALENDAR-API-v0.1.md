# EDUMED v0.1 — Timetable & Calendar API

Цель: расписание является **источником правды** для журнала/дневника (GENERAL DESCRIPTION §3.2–§3.4).
Календарные события **не создают отдельного “учебного расписания”**, а временно “выбивают” уроки из отображения расписания и из списка уроков для журнала.

Ограничение v0.1: только **одиночные события по дате** (без сложной повторяемости).

## 1) Timetable (расписание)

Базовые сущности:

- **Config**: `defaultLessonMinutes` (“время 1 урока = X минут” для всей сетки) + `dayStartTime` (нужно, чтобы корректно накладывать события по времени).
- **Slots**: список слотов уроков с локальным `durationMinutesOverride`.
- **Lessons**: “урок” как атомарный элемент расписания, который однозначно связывает:
  - `date` (YYYY-MM-DD)
  - `slotIndex` (номер слота)
  - `grade` (класс)
  - `groupNumber` (null = весь класс; number = конкретная группа)
  - `disciplineCode` (например `MATEM5`)
  - `teacherUserId`

### 1.1. Config

- `GET /api/timetable/config` → `{ config }`
- `PATCH /api/timetable/config` (только `head_teacher`)
  - body: `{ defaultLessonMinutes?: number, dayStartTime?: "HH:MM" }`

### 1.2. Slots

- `GET /api/timetable/slots` → `{ slots, computed }`
  - `computed` — вычисленные интервалы времени слотов (`startTime/endTime`) для UI и наложения событий.
- `PUT /api/timetable/slots/:index` (только `head_teacher`)
  - body: `{ durationMinutesOverride?: number | null }`
  - создаёт или обновляет слот с номером `index`.
- `DELETE /api/timetable/slots/:index` (только `head_teacher`)

### 1.3. Lessons (база расписания)

- `GET /api/timetable/lessons?date=YYYY-MM-DD` → `{ lessons }`
- `GET /api/timetable/lessons?from=YYYY-MM-DD&to=YYYY-MM-DD` → `{ lessons }`
- `POST /api/timetable/lessons` (только `head_teacher`)
  - body:
    ```json
    {
      "date": "2026-03-18",
      "slotIndex": 1,
      "grade": 5,
      "groupNumber": 1,
      "disciplineCode": "MATEM5",
      "teacherUserId": "..."
    }
    ```
  - валидации:
    - `disciplineCode` должен существовать и иметь `grade`, совпадающий с `grade`
    - у учителя должна быть нагрузка `TeacherLoad(teacherUserId, disciplineCode)`
    - в одной ячейке `date+grade+slotIndex`:
      - либо **1** урок для всего класса (`groupNumber = null`)
      - либо до **2** уроков для разных групп (`groupNumber = 1/2/...`)
- `DELETE /api/timetable/lessons/:id` (только `head_teacher`)

### 1.4. Day view (отображение расписания с учётом календаря)

- `GET /api/timetable/day-view?date=YYYY-MM-DD&grades=5,6,7`
  - возвращает `computedSlots` + `grid` по каждому классу.
  - если есть активное событие, перекрывающее слот — ячейка возвращается как `kind="event"`, иначе `kind="lesson"`.

### 1.5. Effective lessons (источник правды для журнала/дневника)

- `GET /api/timetable/effective-lessons?from=YYYY-MM-DD&to=YYYY-MM-DD[&grade=5][&disciplineCode=MATEM5][&teacherUserId=...][&groupNumber=1]`
  - возвращает **только уроки**, которые **не перекрыты** событиями календаря со статусом `planned` или `held`.
  - это и есть то, что журнал должен использовать для построения “колонок уроков по датам”.

## 2) Calendar (календарь событий)

Сущность события:

- `date` (YYYY-MM-DD)
- `startTime/endTime` (HH:MM) или null (тогда событие “весь день”)
- участники: `grades[]` (целые классы) и/или `groups[]` (точечные группы)
- `status`: `planned | held | cancelled`

### 2.1. Events CRUD

- `GET /api/calendar/events?date=YYYY-MM-DD` → `{ events }`
- `GET /api/calendar/events?from=YYYY-MM-DD&to=YYYY-MM-DD` → `{ events }`
- `POST /api/calendar/events` (только `head_teacher`)
- `PATCH /api/calendar/events/:id` (только `head_teacher`)
  - важно: перевод статуса в `cancelled` автоматически “возвращает уроки” (потому что `effective-lessons` перестаёт их выбивать)
- `DELETE /api/calendar/events/:id` (только `head_teacher`)

### 2.2. Month grid (визуальные состояния дней)

- `GET /api/calendar/month?month=YYYY-MM` → `{ month, days[] }`
  - `visualState`:
    - `workday`
    - `weekend_or_vacation` (в v0.1 это выходные; каникулы можно добавить отдельной конфигурацией позже)
    - `has_event` (есть активное событие)

## 3) Как фронту вызывать API (минимальный контракт)

### 3.1. Экран “Расписание”

- На загрузке:
  - `GET /api/timetable/config`
  - `GET /api/timetable/slots`
  - (для выбранной даты/набора классов) `GET /api/timetable/day-view?date=...&grades=...`
- Редактирование сетки:
  - `PATCH /api/timetable/config`
  - `PUT /api/timetable/slots/:index`
- Заполнение уроков:
  - `POST /api/timetable/lessons`
  - (удаление) `DELETE /api/timetable/lessons/:id`

### 3.2. Экран “Календарь”

- Сетка месяца:
  - `GET /api/calendar/month?month=YYYY-MM`
- События для дня/диапазона:
  - `GET /api/calendar/events?date=...` или `?from&to`
- Создание/изменение статуса:
  - `POST /api/calendar/events`
  - `PATCH /api/calendar/events/:id` (в т.ч. `status="cancelled"`)

### 3.3. Будущая интеграция журнала (важно)

Журнал **не хранит “своё расписание”** и не строит колонки сам.
Для получения списка уроков (колонок) журнал должен вызывать:

- `GET /api/timetable/effective-lessons?from=...&to=...&grade=...&disciplineCode=...`

и строить колонки по `(date, slotIndex)` в порядке `date → slotIndex`.

