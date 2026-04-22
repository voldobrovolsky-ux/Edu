# EDUMED v0.1 — целостное описание экосистемы (по коду)

Документ описывает **все основные блоки** EDUMED: фронт, бэкенд, “БД” (JSON-хранилища) и инфраструктуру запуска/интеграции. Везде, где детали не удаётся строго подтвердить по коду в рамках текущего прохода, формулировка помечается как `ГИПОТЕЗА`.

---

## 2.1. Общий обзор системы

EDUMED — это школьная экосистема с единым контуром данных и ролей:

1. **Фронтенд (SPA)** на React + TypeScript + Tailwind + `react-router-dom`.
2. **Бэкенд (API)** на Node.js + Express (REST, без WebSocket).
3. **Данные**: файловое JSON-хранилище в `apps/api/data/*.json` + файловые директории под документы/вложения/аватары.
4. **Файлы** раздаются Express-static’ом:
   - `/files` (документы)
   - `/messenger-files` (вложения чатов)
   - `/profile-files` (аватары профиля)

**Точка интеграции фронт ↔ бэкенд**: фронт ходит в REST-контракты под префиксом `/api`, а статику — по абсолютным путям `/files/...`, `/messenger-files/...`, `/profile-files/...`.

### Высокоуровневая архитектура

- **Монолит** (один Node-процесс бэкенда + один SPA-фронт).
- Основные “модули” бэкенда реализованы как:
  - `src/routes/*` (HTTP-контракты)
  - `src/store/*` (чтение/запись JSON/файлов)
  - `src/services/*` (бизнес-логика/материализация/вычисления)
  - `src/auth/*` и `src/middleware/*` (JWT и middleware)
  - `src/utils/*` (валидации/время/коды)

**Направления данных** (каноническая связь по коду):

- `timetable (slots/lessons)` является базой для `journal` и `diary`.
- `calendar (events)` временно “выбивает” уроки из отображения расписания и списка уроков для журнала/дневника (через `effective-lessons` в сервисе `effectiveLessons`).
- `journal` хранит метаданные урока в журнале и оценки/отсутствия, с привязкой к `TimetableLesson.id`.
- `documents` и `methospace` используют единое файловое хранилище документов и связи “документ ↔ дисциплина/урок/тип”.
- `chats` используют отдельное `messenger.json` и вложения в `/messenger-files`.
- `analytics` — расчёт “on-the-fly” из `timetable/effective-lessons` и `journal`.

---

## 2.2. Роли и пользователи

### Типы ролей (подтверждено кодом)

Основные роли (`PrimaryRole`):

| Роль | Значение |
|---|---|
| `director` | директор |
| `head_teacher` | завуч |
| `teacher` | преподаватель |
| `parent` | родитель |
| `student` | ученик |
| `bot` | системный бот (сообщения от имени ассистента; интерфейс не предназначен) |

Добавочные роли (`SecondaryRole`): только `teacher` и `parent`.

### Кабинеты (разделы интерфейса по ролям)

Сервер отдаёт конфиг кабинетов:
`GET /api/config/office` → `officeConfig`.

Согласно `apps/api/src/config/office.ts`:

| Источник | primary roles | доступные секции |
|---|---|---|
| База сотрудников | `director`, `head_teacher`, `teacher` | `main`, `analytics`, `document_archive`, `journal`, `timetable`, `methospace`, `chats` |
| База клиентов | `parent`, `student` | `main`, `diary`, `chats` |
| Добавочные роли | `parent` (secondary) | `diary` |
| Добавочные роли | `teacher` (secondary) | `journal`, `methospace`, `analytics` |
| Доп. primary (технические секции) | `head_teacher` | `users_admin` |

### Цели ролей и затрагиваемые модули

| Роль | Цели | Основные модули/экранные зоны (подтверждено роутингом/UI) |
|---|---|---|
| `director` | контроль школы, аналитика, ревизии документации/журнала | `analytics` (overview/classes), `analytics/revision/*`, просмотр `timetable`/`journal` (как “staff”) |
| `head_teacher` | управление учебным процессом и контентом школы | всё из staff + `users_admin`, управление `timetable` и `calendar/events`, `documents`/`methospace` |
| `teacher` | ведение своего участка: нагрузка, журнал, метод. материалы | `journal` (table), `methospace` (свои дисциплины), `analytics` (teacher), `timetable` в режиме просмотра сетки |
| `parent` | дневник и коммуникации | `diary` (panels/view/final-grades), `chats` |
| `student` | дневник и коммуникации | `diary` (view/final-grades из API доступной логики), `chats` |
| `bot` | ассистент/замены уроков (системная роль) | не логинится в UI (`/api/auth/login` запрещает `bot`), но участвует в `chats` и “replacement” сценариях |

---

## 2.3. Доменная модель

Ниже доменные области выделены **по сущностям/хранилищам и по роутам**. Таблицы покрывают как “реальные” JSON-хранилища (`apps/api/data/*.json`), так и вычисляемые view-model’и (явно помечены).

### 2.3.1. Пользователи, размещение ученика и связь “родитель ↔ ученик”

| Сущность | Поля (тип/пример) | Назначение | Связи |
|---|---|---|---|
| `StoredUser` (`users.json`) | `id:string`; `lastName/firstName/patronymic:string`; `username:string`; `passwordHash:string`; `primaryRole:PrimaryRole`; `secondaryRoles:SecondaryRole[]`; `avatarFileName?:string|null`; `email?:string`; `phone?:string`; `locale?:"ru"|"en"`; `timezone?:string`; `profilePrefs?:Partial<UserProfilePrefs>`; `createdAt:string` | идентичность и роли/авторизация | `StudentProfile.userId`, `TeacherLoad.teacherUserId`, `TimetableLesson.teacherUserId`, `JournalLessonStudentMark.studentUserId`, `MessengerState` по `*UserId` |
| `PublicUser` (view-model для API) | `id,lastName,firstName,patronymic,username,primaryRole,secondaryRoles`; `classes:[]`; `children:[]`; `avatarUrl:string|null` (`/profile-files/...`); `email/phone:null|string`; `locale:"ru"|"en"`; `timezone:string`; `profilePrefs:UserProfilePrefs` | публичное представление пользователя без пароля | используется во всех API, где отдаётся пользователь (чаты, админ, профиль) |
| `StudentProfile` (`students.json`) | `userId:string`; `studentCode:string` (шаблон `student<username><grade><group>`); `grade?:number`; `groupNumber?:number`; `classGroupId?:string|null`; `createdAt:string` | размещение ученика в школе | дневник/аналитика резолвят placement через `resolveStudentPlacement()` |
| `ParentChildLink` (`parent-children.json`) | `id:string`; `parentUserId:string`; `studentUserId:string`; `createdAt:string` | связь родитель ↔ ученик | `diary/panels` и `diary/view` (проверка доступа) |

ГИПОТЕЗА: `PublicUser.classes` и `PublicUser.children` сейчас всегда отдаются пустыми массивами (`toPublicUser()`).

### 2.3.2. Школа: классы, группы, дисциплины, нагрузка учителей

| Сущность | Поля (тип/пример) | Назначение | Связи |
|---|---|---|---|
| `SchoolClass` (`classes.json`) | `id:string`; `grade:number` (например `5`); `createdAt:string` | класс как номер | `TimetableLesson.grade` и фильтры |
| `ClassGroup` (`classGroups.json`) | `id:string`; `grade:number`; `groupNumber:number`; `createdAt:string` | группа внутри класса | `TimetableLesson.groupNumber/classGroupId` |
| `Discipline` (`disciplines.json`) | `id`; `code:string` (например `MATEM5`); `baseCode:string` (например `MATEM`); `name:string`; `grade:number`; `documents:DocumentRef[]`; `documentFolderId?:string|null`; `rootFolderId?:string|null`; `classFolderId?:string|null`; `gradeRanges:GradeRanges`; `createdAt` | предмет + диапазоны итоговой оценки | `TimetableLesson.disciplineCode`; `JournalLessonMeta.attachedDocumentIds`; дневник/финальные оценки; архив документов (папки дисциплины) |
| `TeacherLoad` (`teacherLoads.json`) | `id`; `teacherUserId:string`; `disciplineCode:string`; `grade:number`; `groupNumber?:number|null`; `classGroupId?:string|null`; `createdAt` | определяет право вести уроки | `routes/journal.ts` и `routes/timetable.ts` используют `teacherLoadStore` и дают `TEACHER_LOAD_REQUIRED`/`FORBIDDEN` |
| `DocumentRef` | `id`; `name`; `url` | справочная “карточка документа” на уровне дисциплины | используется только как часть дисциплины (не journal-архив) |

### 2.3.3. Расписание: слоты, паттерны, уроки, визуальные блоки

| Сущность | Поля (тип/пример) | Назначение | Связи |
|---|---|---|---|
| `TimetableConfig` (`timetableConfig.json`) | `id:"timetable-config"`; `defaultLessonMinutes:number`; `dayStartTime:"HH:MM"`; `lessonTimesBySlotIndex?:{...}`; `workdayStartTime?/workdayEndTime?/lunchTime?`; `updatedAt` | глобальные параметры сетки | UI + `services/effectiveLessons.ts` |
| `TimetableSlot` (`timetableSlots.json` как “слоты”) | `id`; `index:number`; `durationMinutesOverride?:number|null`; `createdAt` | номер урока в дне + длительность | используется при вычислении `TimetableComputedSlot` |
| `TimetableSlotPattern` (`timetableSlots.json` как “паттерны”) | `id`; `dayOfWeek:1..5`; `weekStart?:string|null`; `slotIndexStart/slotIndexEnd`; `kind:"lesson"|"service"`; `serviceType?`; `serviceDescription?`; `blockLabel?`; `blockColorIndex?`; `isActive?`; `createdAt/updatedAt` | паттерн для UI/таймингов | перекладывается в `TimetableComputedSlot` и через `slotPatternId` в уроках |
| `TimetableLesson` (`timetableLessons.json`) | `id`; `date:"YYYY-MM-DD"`; `slotIndex:number`; `slotPatternId?:string|null`; `grade:number`; `groupNumber?:number|null`; `classGroupId?:string|null`; `disciplineCode:string`; `teacherUserId:string`; `teacherLoadId?:string|null`; `createdAt` | атомарный урок расписания | базовый ключ для `journal` и `diary` (`TimetableLesson.id`) |
| `TimetableComputedSlot` (view-model) | `slotPatternId?`; `dayOfWeek?`; `slotIndex`; `slotIndexEnd?`; `kind?`; `serviceType?`; `startTime/endTime`; `durationMinutes` | вычисленная временная развертка слота | применяется при наложении календарных событий |
| `TimetableVisualBlock` (`timetableVisualBlocks.json`) | `id`; `weekStart`; `dayOfWeek:1..5`; `grade`; `gradeEnd`; `slotIndexStart/slotIndexEnd`; `label`; `colorIndex`; `kind:"service"|"blocked"`; `serviceType`; `serviceDescription?`; `createdAt/updatedAt` | UI-блоки/накладки на неделе | отображение и контроль перекрытий |

### 2.3.4. Календарь и “эффективные уроки”

| Сущность | Поля (тип/пример) | Назначение | Связи |
|---|---|---|---|
| `CalendarEvent` (`calendarEvents.json`) | `id`; `title`; `description?`; `date`; `startTime?/endTime?`; `grades:number[]`; `groups:{grade,groupNumber}[]`; `kind?`; `serviceType?`; `status:"planned"|"held"|"cancelled"`; `createdAt/updatedAt` | события, перекрывающие уроки | влияет на `effective-lessons` |
| `EffectiveLesson` (view-model) | совпадает с `TimetableLesson` | уроки, которые не перекрыты событиями календаря `planned/held` | `services/effectiveLessons.ts:listEffectiveLessons()` |

### 2.3.5. Журнал

| Сущность | Поля (тип/пример) | Назначение | Связи |
|---|---|---|---|
| `JournalLessonMeta` (`journalLessonMeta.json`) | `id`; `timetableLessonId`; `topic`; `attachedDocumentIds[]`; `journalLessonTypeId?:string|null`; `createdAt/updatedAt` | тема урока + прикрепления + тип | привязка к `TimetableLesson.id` |
| `JournalLessonStudentMark` (`journalLessonMarks.json`) | `id`; `timetableLessonId`; `studentUserId`; `mark:number|null` (1..5); `absent:boolean`; `createdAt/updatedAt` | отметка/отсутствие | дневник/аналитика агрегируют по `studentUserId` |
| `JournalLessonType` (`journalLessonTypes.json`) | `id`; `name`; `description`; `disciplineCodes:string[]`; `standardDocumentId:string|null`; `colorKey`; `createdAt/updatedAt` | тип урока в журнале | определяет `standardDocument` и фильтр по дисциплинам |
| `JournalDocumentType` (`journalDocumentTypes.json`) | `id`; `name`; `description`; `requiredForLessonTypeIds?:string[]` | справочник “типов документов журнала” | используется в загрузке документов и в `documentation`-ревизиях |

### 2.3.6. Дневник (diary): агрегированные view-model’и

Дневник агрегирует:
- `effective-lessons` (расписание минус календарные перекрытия),
- `journalLessonMarks`,
- `disciplineStore` (название предмета).

| Сущность (view-model) | Поля | Назначение |
|---|---|---|
| `DiaryPanelsItem` | `studentUserId`; `fio`; `grade`; `groupNumber` | выбор ребёнка (`diary/panels`) |
| `DiaryLessonRow` | `timetableLessonId`; `date`; `slotIndex`; `disciplineCode`; `disciplineName`; `mark:number|null`; `absent:boolean` | строки дневника (`diary/view`) |
| `DaySlotCell` (опционально) | `slotIndex/slotIndexEnd`; `timetableLessonId|null`; `disciplineCode|null`; `mark`; `absent` | детализация одного дня (`from===to`) |
| `DiaryFinalSubject` | `disciplineCode`; `disciplineName`; `average:number|null`; `finalMark:number|null` | итоговый предмет (`diary/final-grades`) |

### 2.3.7. Документы: архив, секции, папки и теги

| Сущность | Поля (тип/пример) | Назначение | Связи/инварианты |
|---|---|---|---|
| `StoredDocument` (`documents.json`) | `id`; `originalName`; `mimeType`; `sizeBytes`; `storageRelPath`; `tags:DocumentTagSet`; `folder:DocumentFolder`; `sectionId?`; `folderId?`; `disciplineId?`; `isStandardizing`; `createdByUserId`; `createdAt` | метаданные файла + теги | `storageRelPath` раздаётся через `/files/...` |
| `DocumentTagSet` | `disciplineCodes[]`; `grades[]`; `roles[]`; `periods[]`; `journalTrace?` | универсальные фильтры и ревизионные следы | главная бизнес-связь через `tags.periods` |
| `DocumentSection` (`documentSections.json`) | `id`; `name`; `createdAt` | верхний уровень дерева | `documents/tree` |
| `DocumentTreeFolder` (`documentFoldersTree.json`) | `id`; `name`; `sectionId`; `parentFolderId`; `disciplineId?`; `createdAt` | узлы иерархии папок | ограничения размещения документов |
| `journal link token` (в `tags.periods`) | `jl:<timetableLessonId>:<journalDocumentTypeId>:g<all|<groupNumber>>` | привязка документа к конкретному уроку и типу документа журнала | вычисляется `buildJournalLessonLinkToken()` |
| `lesson-type standard token` (в `tags.periods`) | `jlt:<journalLessonTypeId>` | привязка “стандартного документа типа урока” | создаётся в `methospace` загрузке файла типа урока |

### 2.3.8. Методическое пространство (methospace) и связки discipline→method pack→standard docs

| Сущность | Поля (тип/пример) | Назначение | Связи |
|---|---|---|---|
| `QuarterPeriod` (`quarters.json`) | `index:1..4`; `startDate`; `endDate` | периоды четвертей | `methospace/quarters` |
| `MethodPack` (`methodPacks.json`) | `id`; `disciplineCode`; `classGrades[]`; `lessonBindings[]:{date,slotIndex,grade?,groupNumber?}`; `theme/goals/lessonPlan/materialDocumentIds/homework/gradingCriteria`; `createdByUserId`; `createdAt/updatedAt` | методические пакеты | применимость по `classGrades`/`lessonBindings` |
| `JournalLessonType` (`journalLessonTypes.json`) | `id`; `name`; `description`; `disciplineCodes[]`; `standardDocumentId`; `colorKey` | “тип урока” и стандартный документ | `standardDocumentId` указывает на `StoredDocument.id`, помеченный `tags.periods=["jlt:<id>"]` |
| `JournalDocumentType` (`journalDocumentTypes.json`) | `id,name,description,requiredForLessonTypeIds?` | типы документов журнала | `documentation`-ревизия + прикрепление в журнал |

### 2.3.9. Аналитика (analytics): computed view-model’и

Аналитика строится “на лету”:
- усреднение из `journalLessonMarks`,
- посещаемость по `absent`,
- уроки берутся из `effective-lessons`.

| Сущность (view-model) | Поля | Назначение |
|---|---|---|
| `AnalyticsSchoolOverview` | `averageMark`; `attendancePercent` | `analytics/overview` |
| `AnalyticsByGrade` | `grade`; `averageMark`; `attendancePercent` | `analytics/classes` |
| `AnalyticsByDiscipline` | `disciplineCode`; `disciplineName`; `averageMark`; `attendancePercent` | `analytics/classes` |
| `AnalyticsRiskZones` | `thresholds`; `lowAverage`; `lowAttendance` | director/head_teacher scope (`overview`) |
| `AnalyticsTeacherPanel` | `grade, disciplineCode, disciplineName, averageMark, attendancePercent, students[]` | `analytics/teacher` |

### 2.3.10. Чаты и мессенджер (chats/messenger) + bot-замены уроков

| Сущность | Поля | Назначение |
|---|---|---|
| `MessengerStateV1` (`messenger.json`) | `directMessages[]`, `groups[]`, `groupMembers[]`, `topics[]`, `groupMessages[]`, `userChatPrefs`, `presence` | state чатов |
| `DirectMessage` | `id`; `fromUserId`; `toUserId`; `text`; `createdAt`; `kind`; `isRead/readAt`; `attachments?`; `poll?`; `reactions?`; `pinned?`; `replyToMessageId?` | 1:1 сообщения |
| `ChatGroup` / `GroupTopic` / `GroupMessage` | `groupId/topicId`, роли участников `owner/admin/member`, архив тем, системные sender’ы | групповые комнаты |
| `Bot replacement state` (`botReplacementSessions.json`) | `sessions[]`, `prompts[]` | замены уроков через bot |

#### Состояние bot replacement

| Сущность | Поля | Связи |
|---|---|---|
| `ReplacementSession` | `id`; `sickTeacherUserId`; `date`; `candidateUserIds[]`; `slots[]`; `status` | `slots[].lessonIds` ↔ `TimetableLesson.id` |
| `ReplacementSlot` | `slotIndex`; `lessonIds[]`; `coveredByUserId`; `escalatedAt` | закрывается после подтверждения кандидатом |
| `CandidatePrompt` | `id`; `sessionId`; `candidateUserId`; `messageId`; `confirmMessageId`; `availableSlotIndexes[]`; `selectedSlotIndexes[]`; `state` | `messageId/confirmMessageId` ↔ `DirectMessage.id` |

### 2.3.11. Фоновые ревизии (revision jobs)

| Сущность | Поля | Назначение | Артефакты |
|---|---|---|---|
| `RevisionJob` (`revisionJobs.json`) | `id`; `kind:"documentation"|"journal"`; `status:"pending"|"processing"|"done"|"failed"`; `createdAt`; `scheduledAt`; `createdByUserId`; `payload`; `errorMessage?`; `finishedAt?` | планирование и статус фоновой ревизии | scheduler меняет status/finishedAt |
| `DocumentationRevisionPayload` | `includedSlots[]:{grade,disciplineCode,teacherUserId}`; `journalDocumentTypeIds[]`; `lessonDateFrom`; `lessonDateTo` | ревизия загруженности документации | `documentationRevisionRun` шлёт direct-сообщения бота в `messenger.json` |
| `JournalRevisionPayload` | `includedSlots[]`; `lessonDateFrom/to`; `checks:{lessons,topics,marks}` | ревизия журнала | `journalRevisionRun` шлёт direct-сообщения бота в `messenger.json` |

---

## 2.4. Модель данных (БД)

В EDUMED v0.1 **нет ORM и DDL**: “БД” реализована как файловое JSON-хранилище.

### Набор коллекций/файлов

| Коллекция (JSON файл) | Назначение | Основные поля | Связи |
|---|---|---|---|
| `users.json` | пользователи | см. `StoredUser` | `students.userId`, `teacherLoads.teacherUserId`, `timetableLessons.teacherUserId`, `journalLessonMarks.studentUserId`, `messenger.*UserId` |
| `classes.json` | классы | `id, grade, createdAt` | `timetableLessons.grade` |
| `classGroups.json` | группы | `id, grade, groupNumber` | `timetableLessons.classGroupId`, `students.classGroupId` |
| `students.json` | размещение учеников | `userId, studentCode, grade?, groupNumber?, classGroupId?` | `diary`/`analytics` |
| `parent-children.json` | связки родитель↔ученик | `parentUserId, studentUserId` | `diary/panels`, `diary/view` |
| `disciplines.json` | дисциплины | `code, baseCode, grade, gradeRanges, documents[]` | `timetableLessons.disciplineCode`, `journal` мета, `documents` tags |
| `teacherLoads.json` | нагрузка | `teacherUserId, disciplineCode, grade, groupNumber?` | проверки доступности уроков/журнала |
| `timetableConfig.json` | глобальная настройка сетки | `defaultLessonMinutes, dayStartTime, workday*, lunchTime` | влияет на UI и расчёты |
| `timetableSlots.json` | паттерны сетки | `dayOfWeek, weekStart?, slotIndexStart/End, kind, ...` | `slotPatternId` в уроках |
| `timetableLessons.json` | уроки расписания | `date, slotIndex, grade, groupNumber?, disciplineCode, teacherUserId` | `journalLessonMeta/Marks.timetableLessonId`, `effective-lessons` |
| `timetableTeacherColors.json` | цвета учителей | `teacherUserId -> index(0..9)` | UI раскраска |
| `timetableVisualBlocks.json` | блоки UI | `weekStart, dayOfWeek, grade range, slot range, label, colorIndex, kind` | UI накладки |
| `calendarEvents.json` | события календаря | `date, startTime/endTime?, grades[], groups[], status, kind/serviceType` | влияет на `effective-lessons` и представление расписания |
| `journalLessonMeta.json` | метаданные урока в журнале | `timetableLessonId, topic, attachedDocumentIds[], journalLessonTypeId?` | привязка к уроку расписания |
| `journalLessonMarks.json` | оценки/отсутствия | `timetableLessonId, studentUserId, mark|null, absent` | расчёты в журнале/дневнике/аналитике |
| `journalLessonTypes.json` | типы уроков | `disciplineCodes[], standardDocumentId, colorKey` | журнал |
| `journalDocumentTypes.json` | типы документов журнала | `requiredForLessonTypeIds?` | журнал |
| `methodPacks.json` | методические пакеты | `disciplineCode, lessonBindings[], materialDocumentIds[]` | методпространство |
| `documentSections.json` | секции дерева документов | `id, name` | `documents/tree` |
| `documentFoldersTree.json` | узлы дерева документов | `id, name, sectionId, parentFolderId, disciplineId?` | ограничения “папки внутри корня дисциплины” |
| `documents.json` | метаданные документов | `storageRelPath, tags, folder, sectionId/folderId/disciplineId, createdByUserId` | `documents` → `/files` |
| `quarters.json` | четверти | `index, startDate, endDate` | дневник/итоги |
| `revisionJobs.json` | фоновые “ревизии” | `kind, status, scheduledAt, payload` | аналитика |
| `botReplacementSessions.json` | замены уроков | `sessions[], prompts[]` | чат-боты |
| `messenger.json` | мессенджер | `directMessages, groups, groupMembers, topics, groupMessages, userChatPrefs, presence` | чаты |
| `chats.json` | legacy direct сообщений | очищается при reset | совместимость (мягкая миграция) |

### Ключи/индексы

- Первичные ключи — `id` (UUID или строковый идентификатор).
- В JSON-слое **индексы как в СУБД отсутствуют**; фильтрация делается в памяти (массивы + `.filter()`), что видно по реализации `store`-классов (например `readJsonArrayFile` → `map/filter/sort`).

---

## 2.5. API (контракты между фронтом и бэкендом)

Общий формат:
- Авторизация: заголовок `Authorization: Bearer <JWT>`.
- Ошибки (основной паттерн): `{ "error": "<CODE>" }`.

### Аутентификация и профиль

| Метод | URL | Назначение | Auth |
|---|---|---|---|
| `POST` | `/api/auth/register` | саморегистрация (разрешены `teacher/parent/student`), создание user + (для student) запись `students.json` | `public` |
| `POST` | `/api/auth/login` | логин по `username/password` (запрещён `bot`) → JWT | `public` |
| `GET` | `/api/auth/me` | текущий пользователь | `Bearer` |
| `PATCH` | `/api/auth/profile` | патч профиля (ФИО, email/phone/locale/timezone/profilePrefs) | `Bearer`, bot запрещён |
| `POST` | `/api/auth/profile/avatar` | загрузка аватара (`multipart/form-data`, поле `avatar`) | `Bearer`, bot запрещён |
| `POST` | `/api/auth/change-password` | смена пароля (`currentPassword/newPassword`) | `Bearer`, bot запрещён |

### Конфигурация кабинетов

| Метод | URL | Назначение | Auth |
|---|---|---|---|
| `GET` | `/api/config/office` | отдаёт `officeConfig` (кабинеты/секции/locks) | `public` |

### Школа (классы/группы/коды учеников)

| Метод | URL | Назначение |
|---|---|---|
| `GET` | `/api/school/classes` | классы с группами |
| `GET` | `/api/school/teachers` | список учителей (director/head_teacher/teacher) |
| `POST` | `/api/school/classes` | создание класса (только `head_teacher`) |
| `GET` | `/api/school/classes/:grade/groups` | группы для класса |
| `POST` | `/api/school/classes/:grade/groups` | создание группы (только `head_teacher`) |
| `GET` | `/api/school/students/resolve?code=...` | резолвинг studentCode → grade/group (используется в регистрации/валидации) |
| `GET` | `/api/school/students/by-code/:studentCode` | возвращает `student` профиль |

### Нагрузка учителей

| Метод | URL | Назначение | Роли (из кода) |
|---|---|---|---|
| `GET` | `/api/teacher-loads/options?grade=` | дисциплины конкретного класса | любой auth |
| `POST` | `/api/teacher-loads` | создать/обновить нагрузку | только `head_teacher` |
| `GET` | `/api/teacher-loads/me` | панели нагрузок текущего учителя | `teacher`-сценарий по UI |
| `GET` | `/api/teacher-loads/:teacherUserId` | панели нагрузок по учителю | `head_teacher` |

### Расписание (timetable)

| Метод | URL | Назначение | Роль |
|---|---|---|---|
| `GET` | `/api/timetable/config` | `TimetableConfig` | `Bearer` |
| `PATCH` | `/api/timetable/config` | обновление глобальных параметров | `head_teacher/director/admin` |
| `GET` | `/api/timetable/slots` | список слотов и вычисленная сетка | `Bearer` |
| `PUT` | `/api/timetable/slots/:id` | обновление слота (duration override/service/visual свойства) | `head_teacher/director/admin` |
| `POST` | `/api/timetable/slots` | создать новый slot | `head_teacher/director/admin` |
| `DELETE` | `/api/timetable/slots/:id` | удалить слот | `head_teacher/director/admin` |
| `POST` | `/api/timetable/slot-rows/reset` | reset строки слотов недели | `head_teacher/director/admin` |
| `POST` | `/api/timetable/slot-rows/delete` | delete строк по паттернам недели | `head_teacher/director/admin` |
| `PUT` | `/api/timetable/slots/:id/merge` | merge слотов | `head_teacher/director/admin` |
| `PUT` | `/api/timetable/slots/:id/merge-range` | merge range | `head_teacher/director/admin` |
| `PUT` | `/api/timetable/slots/:id/split` | split merged slot | `head_teacher/director/admin` |
| `GET` | `/api/timetable/lesson-options?...` | варианты дисциплина/учитель/группы для заполнения урока | `Bearer` (ограничение на управление применимо к редактированию) |
| `GET` | `/api/timetable/lessons?...` | список уроков расписания (по date/from/to) | `Bearer` |
| `POST` | `/api/timetable/lessons` | создание урока (валидации по нагрузке и ограничениям ячейки) | `head_teacher/director/admin` |
| `PATCH` | `/api/timetable/lessons/:id` | частичное обновление урока (дисциплина/учитель/teacherLoadId/slotPatternId) | `head_teacher/director/admin` |
| `DELETE` | `/api/timetable/lessons/:id` | удалить урок | `head_teacher/director/admin` |
| `GET` | `/api/timetable/day-view?date=&grades=` | представление дня (grid + computedSlots с учётом календаря) | `Bearer` |
| `GET` | `/api/timetable/week-view?weekStart=&grades=` | представление недели | `Bearer` |
| `POST` | `/api/timetable/copy-week` | копирование недели (из источника в target) | `head_teacher/director/admin` |
| `POST` | `/api/timetable/week/clear` | очистка недели (по grades, если указаны) | `head_teacher/director/admin` |
| `POST` | `/api/timetable/week/duplicate-previous` | дублировать предыдущую неделю | `head_teacher/director/admin` |
| `GET` | `/api/timetable/teacher-colors` | map teacherUserId→colorIndex | `Bearer` |
| `PATCH` | `/api/timetable/teacher-colors` | обновить палитру | `head_teacher/director/admin` |
| `POST` | `/api/timetable/visual-blocks` | создать визуальный блок | `head_teacher/director/admin` |
| `PATCH` | `/api/timetable/visual-blocks/:id` | изменить визуальный блок | `head_teacher/director/admin` |
| `DELETE` | `/api/timetable/visual-blocks/:id` | удалить визуальный блок | `head_teacher/director/admin` |
| `GET` | `/api/timetable/effective-lessons?from=&to=...` | **уроки “эффективные”** (исключая уроки, перекрытые календарными событиями `planned/held`) | `Bearer` |

### Календарь (calendar)

| Метод | URL | Назначение | Роль |
|---|---|---|---|
| `GET` | `/api/calendar/events?date=` | события за день | `Bearer` |
| `GET` | `/api/calendar/events?from=&to=` | события диапазона | `Bearer` |
| `POST` | `/api/calendar/events` | создать событие | только `head_teacher` |
| `PATCH` | `/api/calendar/events/:id` | обновить событие (в т.ч. статус) | только `head_teacher` |
| `DELETE` | `/api/calendar/events/:id` | удалить событие | только `head_teacher` |
| `GET` | `/api/calendar/month?month=YYYY-MM` | визуальный month-grid | `Bearer` |

### Журнал (journal)

| Метод | URL | Назначение | Роль |
|---|---|---|---|
| `GET` | `/api/journal/table?from=&to=&grade=&disciplineCode=` | “сводный журнал” (grid по эффективным урокам) | `head_teacher/director/teacher/admin` (требуется `teacherLoad` для teacher) |
| `PUT` | `/api/journal/marks` | upsert оценки/отсутствия | teacher — через владение уроком (`teacherUserId`) |
| `PUT` | `/api/journal/lesson-meta` | upsert метаданных урока в журнале (topic/documents/type) | teacher — через владение уроком; staff — как в коде |
| `POST` | `/api/journal/lesson-documents` | загрузить/прикрепить документ к уроку в журнале | `Bearer`, поле `file` |
| `DELETE` | `/api/journal/lesson-documents/:documentId?timetableLessonId=` | detach документа от урока | `Bearer` |

### Дневник (diary)

| Метод | URL | Назначение | Роль |
|---|---|---|---|
| `GET` | `/api/diary/panels` | панели выбора ребёнка (для родителя) | только `parent` |
| `POST` | `/api/diary/links` | временная привязка ребёнка к родителю (демо) | только `head_teacher` |
| `GET` | `/api/diary/view?from=&to=&studentUserId?=` | дневник: агрегированные строки по дням/слотам | студент (сам) или parent (linked) |
| `GET` | `/api/diary/final-grades?from=&to=&studentUserId?=` | итоговые средние/финальные оценки за период | студент/parent по доступу (canAccessStudent) |

### Аналитика (analytics)

| Метод | URL | Назначение | Роль |
|---|---|---|---|
| `GET` | `/api/analytics/overview?from=&to=&minAverage=&minAttendancePercent=` | обзор школы | `director/head_teacher` |
| `GET` | `/api/analytics/classes?from=&to=&grade=&disciplineCode=` | агрегаты по классу | `director/head_teacher` |
| `GET` | `/api/analytics/teacher?from=&to=` | аналитика учителя | `teacher` |
| `GET` | `/api/analytics/revision/classes` | выбор классов для ревизии | `director/head_teacher` |
| `GET` | `/api/analytics/revision/journal-document-types` | выбор типов документов для ревизии | `director/head_teacher` |
| `POST` | `/api/analytics/revision/documentation` | старт фоновой ревизии документации | `director/head_teacher` |
| `POST` | `/api/analytics/revision/journal` | старт фоновой ревизии журнала | `director/head_teacher` |

### Админка пользователей (admin)

| Метод | URL | Назначение | Роль |
|---|---|---|---|
| `GET` | `/api/admin/users` | список всех пользователей | только `head_teacher` |
| `GET` | `/api/admin/users/:id/details` | детали пользователя + нагрузка + дети | только `head_teacher` |
| `POST` | `/api/admin/users` | создать пользователя | только `head_teacher` |
| `PATCH` | `/api/admin/users/:id/roles` | смена primary/secondary ролей | только `head_teacher` |
| `PATCH` | `/api/admin/users/:id` | частичный апдейт пользователя | только `head_teacher` |
| `DELETE` | `/api/admin/users/:id` | удалить пользователя | только `head_teacher` (с confirmPhrase) |
| `DELETE` | `/api/admin/parents/:parentUserId/children/:studentUserId` | unlink ребёнка | только `head_teacher` |
| `POST` | `/api/admin/clear-database` | очистка данных (leave bootstrap admin) | `director/head_teacher/admin bootstrap` |

### Чаты (chats)

Доступ к эндпоинтам определяется кабинетом `chats` через `requireChatsAccess()` (см. `officeConfig`).

| Метод | URL | Назначение |
|---|---|---|
| `GET` | `/api/chats/unread-count` | суммарно непрочитанные входящие |
| `GET` | `/api/chats/users?q=` | поиск пользователей по ФИО/username |
| `POST` | `/api/chats/users/batch` | батч users по `ids[]` |
| `POST` | `/api/chats/upload` | загрузить вложения (`multipart`, поле `files[]`) |
| `GET` | `/api/chats/inbox` | список диалогов: direct + groups |
| `PATCH` | `/api/chats/prefs` | настройки диалога (`convKey`, флаги) |
| `GET` | `/api/chats/presence/:userId` | presence/lastSeen |
| `POST/GET` | `/api/chats/typing` | typing indicators |
| `GET/POST` | `/api/chats/messages` | чтение/отправка direct сообщений |
| `POST` | `/api/chats/messages/read` | mark read для direct |
| `POST` | `/api/chats/bot/replacement-prompts/...` | выбор слота/запрос подтверждения/подтверждение замены |
| `POST` | `/api/chats/messages/:messageId/*` | delete/reactions/pin/poll-vote/poll-close |
| `GET` | `/api/chats/direct/pinned?peerUserId=` | список закреплённых direct сообщений |
| `POST/GET/PATCH` | `/api/chats/groups...` | CRUD групп и участников |
| `GET/POST` | `/api/chats/groups/:groupId/messages` | чтение/отправка сообщений группы (+ reply/poll/attachments) |
| `POST` | `/api/chats/groups/:groupId/read` | mark read по topic |
| `POST` | `/api/chats/groups/:groupId/messages/:messageId/*` | модификации сообщений |
| `GET` | `/api/chats/groups/:groupId/pinned` | закреплённые сообщения группы |
| `POST` | `/api/chats/join/:token` | вступление в группу по invite token |
| `GET` | `/api/chats/search/messages` | поиск сообщений по query `q` |

### Файловые endoints (статическая раздача)

| URL | Назначение |
|---|---|
| `/files/*` | скачивание документов (`data/files/...`) |
| `/messenger-files/*` | скачивание вложений чатов (`data/messenger-files/...`) |
| `/profile-files/*` | аватары пользователей (`data/profile-files/...`) |

### Подробные API-контракты (request/response/error) по эндпоинтам

Общий формат ошибок: `{ "error": "<CODE>" }`. Аутентификация во всех “staff/client” API: `Authorization: Bearer <JWT>`.

#### Аутентификация и профиль

| Метод | URL | Назначение | Запрос (query/body) | Ответ (ключевые поля) | Типовые ошибки/статусы |
|---|---|---|---|---|---|
| `POST` | `/api/auth/register` | регистрация пользователя | `body:{lastName,firstName,patronymic,username,password,primaryRole,grade?,group?}` | `201:{accessToken,user}` | `400 INVALID_INPUT/USERNAME_TOO_SHORT/INVALID_PRIMARY_ROLE; 403 SELF_SIGNUP_NOT_ALLOWED; 409 USERNAME_TAKEN; 400 STUDENT_GRADE_GROUP_REQUIRED/CLASS_NOT_FOUND` |
| `POST` | `/api/auth/login` | логин → JWT | `body:{username,password}` | `{accessToken,user}` | `400 INVALID_INPUT; 401 INVALID_CREDENTIALS` |
| `GET` | `/api/auth/me` | текущий пользователь | нет | `{user}` | `401 UNAUTHORIZED` |
| `PATCH` | `/api/auth/profile` | патч профиля | `body:{lastName?,firstName?,patronymic?,email?,phone?,locale?,timezone?,profilePrefs?}` | `{user}` | `400 NO_FIELDS; 403 FIELD_LOCKED; 400 INVALID_*; 401 UNAUTHORIZED; 500 UPDATE_FAILED` |
| `POST` | `/api/auth/profile/avatar` | загрузка аватара | `multipart: avatar` | `{user}` | `400 INVALID_AVATAR_TYPE/AVATAR_REQUIRED; 403 FORBIDDEN (bot); 401 UNAUTHORIZED; 500 UPDATE_FAILED` |
| `POST` | `/api/auth/change-password` | смена пароля | `body:{currentPassword,newPassword}` | `{ok:true,user}` | `400 PASSWORD_TOO_SHORT/PASSWORD_TOO_LONG/CURRENT_PASSWORD_WRONG/INVALID_INPUT; 401 UNAUTHORIZED; 403 FORBIDDEN (bot); 500 UPDATE_FAILED` |

#### Конфигурация кабинетов

| Метод | URL | Назначение | Запрос (query/body) | Ответ (ключевые поля) | Типовые ошибки/статусы |
|---|---|---|---|---|---|
| `GET` | `/api/config/office` | `officeConfig` кабинетов/секций | нет | `{office:OfficeConfig}` | (явные коды ошибок в текущем роуте не выделены) |

#### Школа (классы/группы/коды учеников)

| Метод | URL | Назначение | Запрос (query/body) | Ответ (ключевые поля) | Типовые ошибки/статусы |
|---|---|---|---|---|---|
| `GET` | `/api/school/classes` | классы с группами | нет | `{classes:...}` | `401/403` |
| `GET` | `/api/school/teachers` | список учителей | нет | `{teachers:[{id,fio,primaryRole,secondaryRoles}]}` | `403 FORBIDDEN` |
| `POST` | `/api/school/classes` | создать класс | `body:{grade:number}` | `201:{class}` | `403 FORBIDDEN; 400 INVALID_INPUT` |
| `GET` | `/api/school/classes/:grade/groups` | группы класса | `:grade` | `{groups:[...]}` | `400 INVALID_GRADE/CLASS_NOT_FOUND` |
| `POST` | `/api/school/classes/:grade/groups` | создать группу | `body:{groupNumber:number}` | `201:{group}` | `403 FORBIDDEN; 400 INVALID_INPUT/CLASS_NOT_FOUND` |
| `GET` | `/api/school/students/resolve` | резолвинг `studentCode` → placement | `query:{code}` | `{parsed:{username,grade,group}}` | `400 <message из parseStudentCode>` |
| `GET` | `/api/school/students/by-code/:studentCode` | получить профиль ученика | `:studentCode` | `{student}` | `404 NOT_FOUND` |

#### Нагрузка учителей

| Метод | URL | Назначение | Запрос (query/body) | Ответ (ключевые поля) | Типовые ошибки/статусы |
|---|---|---|---|---|---|
| `GET` | `/api/teacher-loads/options` | список дисциплин по `grade` | `query:{grade}` | `{disciplines:[{code,name,grade}]}` | `400 INVALID_GRADE` |
| `POST` | `/api/teacher-loads` | upsert нагрузки учителя | `body:{teacherUserId,disciplineCode}` | `201:{load}` | `403 FORBIDDEN; 400 INVALID_INPUT/TEACHER_NOT_FOUND/DISCIPLINE_NOT_FOUND` |
| `GET` | `/api/teacher-loads/me` | панели нагрузок текущего учителя | нет | `{panels:[{grade,disciplineCode,disciplineName}]}` | `401 UNAUTHORIZED` |
| `GET` | `/api/teacher-loads/:teacherUserId` | панели нагрузок по учителю | `:teacherUserId` | `{panels:[...]}` | `403 FORBIDDEN` |

#### Расписание (timetable)

| Метод | URL | Назначение | Запрос (query/body) | Ответ (ключевые поля) | Типовые ошибки/статусы |
|---|---|---|---|---|---|
| `GET` | `/api/timetable/config` | получить `TimetableConfig` | нет | `{config:{defaultLessonMinutes,dayStartTime,workdayStartTime?,workdayEndTime?,lunchTime?}}` | `401/403` |
| `PATCH` | `/api/timetable/config` | обновить `TimetableConfig` | `body` из `TimetableConfig` | `{config}` | `403 FORBIDDEN; 400 INVALID_DEFAULT_LESSON_MINUTES/INVALID_DAY_START_TIME/INVALID_WORKDAY_START_TIME/INVALID_WORKDAY_END_TIME/INVALID_LUNCH_TIME/INVALID_LESSON_TIMES*` |
| `GET` | `/api/timetable/slots` | вычислить сетку слотов | нет | `{slots:[...],patterns:[...]}` | `401/403` |
| `POST` | `/api/timetable/slots` | создать slot/pattern | `body:{...}` | `{slot}` | `403 FORBIDDEN; 400 INVALID_DAY_OF_WEEK/...` |
| `PUT` | `/api/timetable/slots/:id` | обновить slot/pattern | `:id`, `body:{...}` | `{slot}` | `403 FORBIDDEN; 404 SLOT_PATTERN_NOT_FOUND; 400 SLOT_HAS_LESSONS/SERVICE_SLOT_CANNOT_BE_DELETED/…` |
| `DELETE` | `/api/timetable/slots/:id` | удалить slot/pattern | `:id` | `{ok:true}` | `403 FORBIDDEN; 404 SLOT_PATTERN_NOT_FOUND; 400 SLOT_HAS_LESSONS/SERVICE_SLOT_CANNOT_BE_DELETED/…` |
| `POST` | `/api/timetable/slot-rows/reset` | сброс строк недели | `body:{weekStart,slotPatternIds?,grades?}` | `{ok:true}` | `403 FORBIDDEN; 400 INVALID_WEEK_START/SLOT_PATTERN_IDS_REQUIRED/…` |
| `POST` | `/api/timetable/slot-rows/delete` | удалить строки недели | `body:{weekStart,slotPatternIds,grades?}` | `{ok:true}` | `403 FORBIDDEN; 400 INVALID_WEEK_START/SLOT_PATTERN_IDS_REQUIRED/…` |
| `PUT` | `/api/timetable/slots/:id/merge` | merge слотов | `:id`, `body` с диапазоном | `{slotPattern}` | `403 FORBIDDEN; 400 INVALID_END_SLOT_INDEX/SLOTS_MUST_BE_IN_SAME_DAY/CANNOT_DELETE_LAST_TWO_SLOTS/…` |
| `PUT` | `/api/timetable/slots/:id/merge-range` | merge-range | `:id`, `body:{...}` | `{slotPattern}` | `403 FORBIDDEN; 400 INVALID_*` |
| `PUT` | `/api/timetable/slots/:id/split` | split merged slot | `:id`, `body:{...}` | `{slotPattern}` | `403 FORBIDDEN; 400 INVALID_*` |
| `GET` | `/api/timetable/lesson-options` | варианты урока (предмет/учитель/группа) | query фильтры (`date/from/to/grade/groupNumber/teacherUserId/…`) | `{options:[...]}` | `400 INVALID_*; 403 FORBIDDEN (для manager-операций)` |
| `GET` | `/api/timetable/lessons` | список уроков расписания | query: `from/to/date/grades/...` | `{lessons:[TimetableLesson...]}` | `400 INVALID_DATE/DATE_RANGE_REQUIRED; 401/403` |
| `POST` | `/api/timetable/lessons` | создать урок | `body:{date,slotIndex,grade,groupNumber?,disciplineCode,teacherUserId,teacherLoadId?,slotPatternId?}` | `201:{lesson}` | `403 FORBIDDEN; 400 OUTSIDE_WORKWEEK/INVALID_* /SLOT_NOT_FOUND_OR_NOT_LESSON/…; 400 CELL_HAS_WHOLE_CLASS_LESSON/CELL_HAS_GROUP_LESSON/MAX_2_GROUP_LESSONS_PER_SLOT` |
| `PATCH` | `/api/timetable/lessons/:id` | частично обновить урок | `:id`, `body:{disciplineCode?,teacherUserId?,teacherLoadId?,slotPatternId?}` | `{lesson}` | `403 FORBIDDEN; 404 LESSON_NOT_FOUND; 400 INVALID_*` |
| `DELETE` | `/api/timetable/lessons/:id` | удалить урок | `:id` | `{ok:true}` | `403 FORBIDDEN; 404 LESSON_NOT_FOUND` |
| `GET` | `/api/timetable/day-view` | day-view (grid + effective timeline) | `query:{date:"YYYY-MM-DD",grades?:number[]}` | `{dayView}` | `400 INVALID_DATE/INVALID_DATE_RANGE; 401/403` |
| `GET` | `/api/timetable/week-view` | week-view | `query:{weekStart:"YYYY-MM-DD",grades?:number[]}` | `{weekView}` | `400 INVALID_WEEK_START/GRADES_REQUIRED/OUTSIDE_WORKWEEK; 401/403` |
| `POST` | `/api/timetable/copy-week` | копировать расписание недели | `body:{sourceWeekStart,targetWeekStart,grades?}` | `{ok:true}` | `400 COPY_ONLY_FOR_FUTURE_WEEKS/TARGET_WEEK_ALREADY_EXISTS/SOURCE_WEEK_NOT_FOUND/...; 403 FORBIDDEN` |
| `POST` | `/api/timetable/week/clear` | очистить неделю | `body:{weekStart,grades?}` | `{ok:true}` | `400 INVALID_WEEK_START/GRADES_REQUIRED/OUTSIDE_WORKWEEK; 403 FORBIDDEN` |
| `POST` | `/api/timetable/week/duplicate-previous` | дублировать предыдущую неделю | `body:{targetWeekStart,grades?}` | `{ok:true}` | `400 INVALID_WEEK_START/TARGET_WEEK_ALREADY_EXISTS/...; 403 FORBIDDEN` |
| `GET` | `/api/timetable/teacher-colors` | pallete: `teacherUserId → colorIndex` | нет | `{colors:Record<string,number>}` | `401/403` |
| `PATCH` | `/api/timetable/teacher-colors` | обновить палитру | `body:{colors:{...}}` | `{ok:true}` | `403 FORBIDDEN; 400 INVALID_COLORS` |
| `POST` | `/api/timetable/visual-blocks` | создать visual-block | `body:{weekStart,dayOfWeek,grade,gradeEnd,slotIndexStart,slotIndexEnd,label,colorIndex,kind,serviceType,serviceDescription?}` | `{block}` | `403 FORBIDDEN; 400 LABEL_REQUIRED/VISUAL_BLOCK_OVERLAP/VISUAL_BLOCK_NOT_RECTANGLE/...` |
| `PATCH` | `/api/timetable/visual-blocks/:id` | изменить visual-block | `:id`, `body` | `{block}` | `403 FORBIDDEN; 404 VISUAL_BLOCK_NOT_FOUND` |
| `DELETE` | `/api/timetable/visual-blocks/:id` | удалить visual-block | `:id` | `{ok:true}` | `403 FORBIDDEN; 404 VISUAL_BLOCK_NOT_FOUND` |
| `GET` | `/api/timetable/effective-lessons` | effective-lessons | query `from,to` | `{lessons:[TimetableLesson...]}` | `400 INVALID_DATE_RANGE; 401/403` |

#### Календарь (calendar)

| Метод | URL | Назначение | Запрос (query/body) | Ответ (ключевые поля) | Типовые ошибки/статусы |
|---|---|---|---|---|---|
| `GET` | `/api/calendar/events?date=` | события за день | query `date` | `{events:[CalendarEvent...]}` | `400 INVALID_DATE; 401/403` |
| `GET` | `/api/calendar/events?from=&to=` | события диапазона | query `from,to` | `{events:[CalendarEvent...]}` | `400 DATE_RANGE_REQUIRED; 401/403` |
| `POST` | `/api/calendar/events` | создать событие | `body:{date,title,description?,status,kind,serviceType?,startTime?,endTime?,targets...}` | `{event}` | `403 FORBIDDEN; 400 INVALID_TITLE/INVALID_DATE/INVALID_STATUS/INVALID_KIND/INVALID_SERVICE_TYPE/INVALID_DESCRIPTION/INVALID_START_TIME/INVALID_END_TIME/INVALID_TIME_RANGE/TARGET_REQUIRED/CLASS_NOT_FOUND` |
| `PATCH` | `/api/calendar/events/:id` | обновить событие | `:id`, `body:{...}` | `{event}` | `403 FORBIDDEN; 400 INVALID_*; 404 NOT_FOUND (если предусмотрено)` |
| `DELETE` | `/api/calendar/events/:id` | удалить событие | `:id` | `{ok:true}` | `403 FORBIDDEN` |
| `GET` | `/api/calendar/month` | month-grid | query `month:"YYYY-MM"` | `{monthGrid}` | `400 INVALID_MONTH; 401/403` |

#### Журнал (journal)

| Метод | URL | Назначение | Запрос (query/body) | Ответ (ключевые поля) | Типовые ошибки/статусы |
|---|---|---|---|---|---|
| `GET` | `/api/journal/table` | сводный журнал (grid) | query `from,to,grade?,disciplineCode?` | `{table}` | `400 INVALID_DATE_RANGE/INVALID_GRADE/INVALID_DISCIPLINE; 404 DISCIPLINE_NOT_FOUND; 403 TEACHER_LOAD_REQUIRED; 403 FORBIDDEN` |
| `PUT` | `/api/journal/marks` | upsert оценки/absent | `body:{timetableLessonId,studentUserId,mark?,absent?}` | `{mark}` (upsert-результат) | `400 INVALID_INPUT/INVALID_MARK; 404 LESSON_NOT_FOUND; 403 FORBIDDEN; 403 TEACHER_LOAD_REQUIRED` |
| `PUT` | `/api/journal/lesson-meta` | upsert мета урока | `body:{timetableLessonId,topic?,journalLessonTypeId?}` + docs info | `{meta}` | `400 JOURNAL_LESSON_TYPE_NOT_FOUND/JOURNAL_LESSON_TYPE_DISCIPLINE_MISMATCH/INVALID_DOCS; 403 TEACHER_LOAD_REQUIRED; 403 FORBIDDEN` |
| `POST` | `/api/journal/lesson-documents` | прикрепить/загрузить документ к уроку | `multipart:file` + `body:{timetableLessonId,journalDocumentTypeId,...}` | `{documentId,meta}` | `400 FILE_REQUIRED/INVALID_INPUT; 404 LESSON_NOT_FOUND/DOCUMENT_NOT_FOUND; 403 FORBIDDEN/TEACHER_LOAD_REQUIRED` |
| `DELETE` | `/api/journal/lesson-documents/:documentId` | detach документа | query `timetableLessonId=` | `{ok:true}` | `400 INVALID_INPUT; 404 LESSON_NOT_FOUND/DOCUMENT_NOT_FOUND; 403 FORBIDDEN; 400 DOCUMENT_NOT_ATTACHED_TO_LESSON` |

#### Дневник (diary)

| Метод | URL | Назначение | Запрос (query/body) | Ответ (ключевые поля) | Типовые ошибки/статусы |
|---|---|---|---|---|---|
| `GET` | `/api/diary/panels` | панели выбора ребёнка | нет | `{panels:[{studentUserId,fio,grade,groupNumber}]}` | `401 UNAUTHORIZED; 403 PARENT_ROLE_REQUIRED` |
| `POST` | `/api/diary/links` | демо-привязка ребёнка родителю | `body:{id,parentUserId,studentUserId}` | `201:{link}` | `401 UNAUTHORIZED; 403 FORBIDDEN; 400 INVALID_INPUT/PARENT_NOT_FOUND/STUDENT_NOT_FOUND/STUDENT_PROFILE_NOT_FOUND` |
| `GET` | `/api/diary/view` | diary-view | query `from,to,studentUserId?` | `{student,lessons:[...],daySlots?}` | `401 UNAUTHORIZED; 400 INVALID_DATE_RANGE/STUDENT_REQUIRED/STUDENT_PROFILE_NOT_FOUND; 403 FORBIDDEN` |
| `GET` | `/api/diary/final-grades` | финальные оценки за период | query `from,to,studentUserId?` | `{from,to,studentUserId,subjects:[{disciplineCode,disciplineName,average,finalMark}]}` | `401 UNAUTHORIZED; 400 INVALID_DATE_RANGE/STUDENT_REQUIRED/STUDENT_PROFILE_NOT_FOUND; 403 FORBIDDEN` |

#### Аналитика (analytics)

| Метод | URL | Назначение | Запрос (query/body) | Ответ (ключевые поля) | Типовые ошибки/статусы |
|---|---|---|---|---|---|
| `GET` | `/api/analytics/overview` | обзор школы | query `from,to,minAverage?,minAttendancePercent?` | `{overview,byGrade,byDiscipline,byGradeDiscipline,riskZones?,teacher?}` | `403 FORBIDDEN; 400 INVALID_DATE_RANGE` |
| `GET` | `/api/analytics/classes` | агрегаты по классам | query `from,to,grade?,disciplineCode?` | `{overview,byGrade,byDiscipline,byGradeDiscipline,filter}` | `403 FORBIDDEN; 400 INVALID_DATE_RANGE` |
| `GET` | `/api/analytics/teacher` | панели учителя | query `from,to` | `{panels:[{grade,disciplineCode,students:[...]}]}` | `403 FORBIDDEN; 400 INVALID_DATE_RANGE` |
| `GET` | `/api/analytics/revision/classes` | выбор классов для ревизии | нет | `{classes:[{grade,label,rows:[...] }...]}` | `403 FORBIDDEN` |
| `GET` | `/api/analytics/revision/journal-document-types` | выбор типов документов ревизии | нет | `{types:[JournalDocumentType...]}` | `403 FORBIDDEN` |
| `POST` | `/api/analytics/revision/documentation` | старт ревизии документации | `body:{grades?,excludedKeys?,journalDocumentTypeIds,scheduledAt,lessonDateFrom?,lessonDateTo?}` | `201:{job}` | `403 FORBIDDEN; 400 INVALID_INPUT/INVALID_SCHEDULED_AT/CLASS_NOT_FOUND/JOURNAL_DOC_TYPE_NOT_FOUND/INVALID_DATE_RANGE/REVISION_NOTHING_SELECTED` |
| `POST` | `/api/analytics/revision/journal` | старт ревизии журнала | `body:{grades,excludedKeys?,checks,scheduledAt,lessonDateFrom?,lessonDateTo?}` | `201:{job}` | `403 FORBIDDEN; 400 INVALID_INPUT/INVALID_DATE_RANGE/REVISION_NO_CHECKS_SELECTED/REVISION_NOTHING_SELECTED/CLASS_NOT_FOUND` |

#### Admin: пользователи/роли/родители

| Метод | URL | Назначение | Запрос (query/body) | Ответ (ключевые поля) | Типовые ошибки/статусы |
|---|---|---|---|---|---|
| `GET` | `/api/admin/users` | list users | нет | `{users:[...]}` | `401 UNAUTHORIZED; 403 FORBIDDEN` |
| `GET` | `/api/admin/users/:id/details` | details user | `:id` | `{user,teachingAssignments,childrenUserIds}` | `404 USER_NOT_FOUND; 403 FORBIDDEN` |
| `POST` | `/api/admin/users` | создать пользователя | `body:{...}` | `{user}` | `400 INVALID_INPUT/USERNAME_TOO_SHORT/INVALID_PRIMARY_ROLE/…; 409 USERNAME_TAKEN; 403 FORBIDDEN` |
| `PATCH` | `/api/admin/users/:id/roles` | смена ролей | `body:{primaryRole,secondaryRoles}` | `{user}` | `400 INVALID_PRIMARY_ROLE; 404 USER_NOT_FOUND; 403 SYSTEM_USER_PROTECTED/FORBIDDEN` |
| `PATCH` | `/api/admin/users/:id` | апдейт полей пользователя | `body:{...}` | `{user}` | `400 INVALID_INPUT; 403 FORBIDDEN; 404 USER_NOT_FOUND; 409 USERNAME_TAKEN; 403 SYSTEM_USER_PROTECTED` |
| `DELETE` | `/api/admin/users/:id` | удалить пользователя | `body:{confirmPhrase}` | `{ok:true}` | `400 CONFIRM_PHRASE_REQUIRED; 404 USER_NOT_FOUND; 403 SYSTEM_USER_PROTECTED/FORBIDDEN` |
| `DELETE` | `/api/admin/parents/:parentUserId/children/:studentUserId` | unlink ребёнка | нет | `{ok:true}` | `400 INVALID_USER_ID; 403 FORBIDDEN; 404 USER_NOT_FOUND` |
| `POST` | `/api/admin/clear-database` | очистка данных | `body:{confirmPhrase}` | `{ok,true,message}` | `400 CONFIRM_PHRASE_REQUIRED; 403 FORBIDDEN; 500 CLEAR_DATABASE_FAILED` |

#### Documents (документный архив)

| Метод | URL | Назначение | Запрос (query/body) | Ответ (ключевые поля) | Типовые ошибки/статусы |
|---|---|---|---|---|---|
| `GET` | `/api/documents` | список документов (фильтрация по tags) | `query:{disciplineCode?,officeSection?,grade?,roles?,periods?}` | `{documents:[StoredDocument...]}` | `403 FORBIDDEN; 400 INVALID_GRADE` |
| `GET` | `/api/documents/tree` | секции/папки/документы для дерева | нет | `{sections,folders,documents}` | `403 FORBIDDEN` |
| `POST` | `/api/documents/sections` | создать секцию | `body:{name}` | `201:{section}` | `403 FORBIDDEN; 400 NAME_REQUIRED` |
| `PATCH` | `/api/documents/sections/:sectionId` | переименовать секцию | `:sectionId`, `body:{name}` | `{section}` | `404 NOT_FOUND; 403 FORBIDDEN; 400 <e.message>` |
| `DELETE` | `/api/documents/sections/:sectionId` | удалить секцию (и все связанные папки/документы) | `:sectionId` | `{ok:true}` | `403 FORBIDDEN; 404 NOT_FOUND; 400 DISCIPLINE_SECTION_LOCKED` |
| `PATCH` | `/api/documents/folders/:folderId` | обновить папку | `:folderId`, `body:{name?,sectionId?,parentFolderId?}` | `{folder}` | `403 FORBIDDEN; 404 NOT_FOUND; 400 <e.message>` |
| `DELETE` | `/api/documents/folders/:folderId` | удалить папку (поддерево) | `:folderId` | `{ok:true}` | `403 FORBIDDEN; 404 NOT_FOUND; 400 DISCIPLINE_FOLDER_LOCKED` |
| `POST` | `/api/documents/merge-folders-to-section` | объединить папки в новую секцию | `body:{folderIds[],name}` | `201:{section,folderIds}` | `403 FORBIDDEN; 400 AT_LEAST_TWO_FOLDERS/NAME_REQUIRED/FOLDER_NOT_FOUND/FOLDERS_NOT_SAME_LEVEL` |
| `POST` | `/api/documents/folders` | создать папку | `body:{name,sectionId?,parentFolderId?}` | `201:{folder}` | `403 FORBIDDEN; 400 NAME_REQUIRED/SECTION_NOT_FOUND/PARENT_FOLDER_NOT_FOUND/...` |
| `POST` | `/api/documents/move-documents` | переместить документы | `body:{documentIds[],targetFolderId?}` | `{documents:[...]}` | `403 FORBIDDEN; 400 DOCUMENTS_REQUIRED/FOLDER_NOT_FOUND/DISCIPLINE_DOCUMENT_MUST_STAY_IN_FOLDER` |
| `POST` | `/api/documents/upload` | загрузить файл в архив (с tags/placement) | `multipart:file` + `body:{tags?,folder?,sectionId?,folderId?,disciplineCode?,isStandardizing?}` | `201:{document,url}` (url = `/files/${storageRelPath}`) | `403 FORBIDDEN; 400 FILE_REQUIRED/<e.message>` |
| `PATCH` | `/api/documents/:id` | обновить метаданные документа | `:id`, `body:{tags?,folder?,sectionId?,folderId?,disciplineId?,isStandardizing?}` | `{document}` | `403 FORBIDDEN; 404 NOT_FOUND; 400 <e.message>` |
| `DELETE` | `/api/documents/:id` | удалить документ | `:id` | `{ok:true}` | `403 FORBIDDEN; 404 NOT_FOUND` |
| `POST` | `/api/documents/:id/link` | “линк” документа на дисциплину | `body:{disciplineCode}` | `201:{discipline}` | `403 FORBIDDEN; 404 NOT_FOUND; 400 DISCIPLINE_CODE_REQUIRED/DISCIPLINE_NOT_FOUND` |

#### Methospace (методическое пространство)

| Метод | URL | Назначение | Запрос (query/body) | Ответ (ключевые поля) | Типовые ошибки/статусы |
|---|---|---|---|---|---|
| `GET` | `/api/methospace/disciplines` | список дисциплин | `query:{grade?}` | `{disciplines:[...]}` | `400 INVALID_GRADE; 403 FORBIDDEN (если staff не подходит)` |
| `GET` | `/api/methospace/disciplines/summary` | summary для экрана списка | `query:{mine?}` | `{items:[{baseCode,name,codes,grades,hasMaterials,hasRanges,missingMaterialsCodes,missingRangesCodes}...]}` | `403 FORBIDDEN` |
| `GET` | `/api/methospace/disciplines/by-base/:baseCode` | карточка дисциплины | `:baseCode` | `{discipline,documents,lessonTypes,methodPacks,...}` | `400 BASE_CODE_REQUIRED; 404 NOT_FOUND; 403 FORBIDDEN` |
| `POST` | `/api/methospace/disciplines` | создать дисциплину | `body:{...}` | `{discipline}` | `403 FORBIDDEN; 400 DISCIPLINE_NOT_FOUND/INVALID_INPUT/...` |
| `PATCH` | `/api/methospace/disciplines/:code` | обновить дисциплину | `:code`, `body:{...}` | `{discipline}` | `403 FORBIDDEN; 404 NOT_FOUND` |
| `DELETE` | `/api/methospace/disciplines/:code` | удалить дисциплину | нет | `{ok:true}` | `403 FORBIDDEN; 404 NOT_FOUND; 400 DISCIPLINE_HAS_TEACHER_LOADS/ DISCIPLINE_HAS_LESSONS` |
| `GET` | `/api/methospace/method-packs` | список method packs | (зависит от фильтров) | `{packs:[MethodPack...]}` | `403 FORBIDDEN` |
| `POST` | `/api/methospace/method-packs` | создать method pack | `body:{disciplineCode,theme,goals,lessonPlan,materialDocumentIds,homework,gradingCriteria,classGrades?,lessonBindings?}` | `{pack}` | `403 FORBIDDEN; 400 <e.message>` |
| `PATCH` | `/api/methospace/method-packs/:id` | обновить method pack | `:id`, `body:{...}` | `{pack}` | `403 FORBIDDEN; 404 NOT_FOUND` |
| `DELETE` | `/api/methospace/method-packs/:id` | удалить method pack | `:id` | `{ok:true}` | `403 FORBIDDEN; 404 NOT_FOUND` |
| `GET` | `/api/methospace/classes` | справочник классов | нет | `{classes:[...]}` | `403 FORBIDDEN` |
| `GET` | `/api/methospace/classes/:grade/students` | ученики класса | `:grade` | `{students:[...]}` | `400 INVALID_GRADE; 403 FORBIDDEN` |
| `GET` | `/api/methospace/journal-document-types` | список типов документов журнала | нет | `{types:[JournalDocumentType...]}` | `403 FORBIDDEN` |
| `POST` | `/api/methospace/journal-document-types` | создать тип документа | `body:{name,description?,requiredForLessonTypeIds?}` | `{type}` | `403 FORBIDDEN; 400 INVALID_INPUT/NAME_REQUIRED/...` |
| `PATCH` | `/api/methospace/journal-document-types/:id` | update типа документа | `:id`, `body:{...}` | `{type}` | `403 FORBIDDEN; 404 NOT_FOUND` |
| `DELETE` | `/api/methospace/journal-document-types/:id` | удалить тип документа | `:id` | `{ok:true}` | `403 FORBIDDEN; 404 NOT_FOUND` |
| `GET` | `/api/methospace/journal-lesson-types` | список типов уроков | нет | `{types:[JournalLessonType...]}` | `403 FORBIDDEN` |
| `POST` | `/api/methospace/journal-lesson-types` | создать тип урока | `body:{name,description?,disciplineCodes?,colorKey,standardDocumentId?}` | `{type}` | `403 FORBIDDEN; 400 INVALID_INPUT/NAME_REQUIRED` |
| `PATCH` | `/api/methospace/journal-lesson-types/:id` | update типа урока | `:id`, `body:{...}` | `{type}` | `403 FORBIDDEN; 404 NOT_FOUND; 400 NAME_REQUIRED` |
| `DELETE` | `/api/methospace/journal-lesson-types/:id` | удалить тип урока | `:id` | `{ok:true}` | `403 FORBIDDEN; 404 NOT_FOUND` |
| `POST` | `/api/methospace/journal-lesson-types/:id/standard-document` | загрузить/перезаписать стандартный документ типа урока | `multipart:file` + `body:{disciplineCode}` | `201:{type:updated,documentId}` | `403 FORBIDDEN; 400 INVALID_INPUT/DISCIPLINE_NOT_FOUND/DISCIPLINE_CLASS_FOLDER_MISSING/NOT_FOUND` |
| `GET` | `/api/methospace/quarters` | четверти + vacations | нет | `{quarters:[{index,startDate,endDate}], vacations:[...]}` | `403 FORBIDDEN` |
| `PUT` | `/api/methospace/quarters` | сохранить четверти | `body:{quarters:[{index,startDate,endDate}*4]}` | `{quarters,vacations}` | `403 FORBIDDEN; 400 INVALID_INPUT/<e.message>` |

#### Чаты (chats)

Доступ к эндпоинтам определяется кабинетом `chats` через `requireChatsAccess()`, поэтому почти все ошибки — `403 FORBIDDEN`.

| Метод | URL | Назначение | Запрос (query/body) | Ответ (ключевые поля) | Типовые ошибки/статусы |
|---|---|---|---|---|---|
| `GET` | `/api/chats/unread-count` | суммарно непрочитанные | нет | `{total:number}` | `403 FORBIDDEN` |
| `GET` | `/api/chats/users` | поиск пользователей | `query:{q}` | `{users:[{id,fio,username,role,avatarUrl:null|string}]}` | `403 FORBIDDEN` |
| `POST` | `/api/chats/users/batch` | батч users | `body:{ids:string[]}` | `{users:[{id,fio,username,avatarUrl}...]}` | `403 FORBIDDEN` |
| `POST` | `/api/chats/upload` | загрузка вложений | `multipart:files[]` | `{attachments:[{id,fileName,mime,url,size}...]}` | `400 FILES_REQUIRED; 403 FORBIDDEN` |
| `GET` | `/api/chats/inbox` | список диалогов (direct+groups) | нет | `{items:[{kind:"direct"|"group",...unread,lastMessagePreview,lastMessageAt,important,muted}...]}` | `403 FORBIDDEN` |
| `PATCH` | `/api/chats/prefs` | настройки диалога | `body:{convKey, muted?, important?, showDeletedMod?}` | `{prefs}` | `400 CONV_KEY_REQUIRED; 403 FORBIDDEN` |
| `GET` | `/api/chats/presence/:userId` | presence | `:userId` | `{lastSeenAt,online,presenceHidden?}` | `403 FORBIDDEN` |
| `POST` | `/api/chats/typing` | typing (установить) | `body:{channel,peerUserId?,groupId?,active}` | `{ok:true}` | `400 INVALID_TYPING; 403 FORBIDDEN` |
| `GET` | `/api/chats/typing` | typing (получить) | `query:{peerUserId?,groupId?}` | `{userIds:string[]}` | `403 FORBIDDEN` |
| `GET` | `/api/chats/messages` | прямой диалог: чтение | `query:{userId}` | `{messages:ChatApiMessage[]}` | `403 FORBIDDEN` |
| `POST` | `/api/chats/messages` | прямой диалог: отправка | `body:{toUserId,text?,attachments?,poll?,mentionUserIds?,replyToMessageId?}` | `201:{message}` | `400 TO_USER_ID_REQUIRED/TEXT_REQUIRED/TEXT_TOO_LONG/INVALID_REPLY/REPLY_MESSAGE_NOT_FOUND/POLL_INVALID/POLL_INVALID/...; 403 FORBIDDEN` |
| `POST` | `/api/chats/messages/read` | mark read direct | `body:{userId}` | `{updatedCount,messages}` | `400 USER_ID_REQUIRED; 403 FORBIDDEN` |
| `GET` | `/api/chats/direct/pinned` | список закреплённых direct | `query:{peerUserId}` | `{messages:ChatApiMessage[]}` | `400 USER_ID_REQUIRED; 403 FORBIDDEN; 404 NOT_FOUND` |
| `POST` | `/api/chats/bot/replacement-prompts/:promptId/toggle-slot` | выбор слота кандидатом (replacement) | `body:{slotIndex}` | `{ok:true}` | `400 INVALID_SLOT/SESSION_INACTIVE/…; 403 FORBIDDEN` |
| `POST` | `/api/chats/bot/replacement-prompts/:promptId/request-confirm` | запрос подтверждения | `body:{}` | `{ok:true}` | `400 NOT_FOUND/NO_SLOTS_SELECTED; 403 FORBIDDEN; 500 BOT_MISSING` |
| `POST` | `/api/chats/bot/replacement-prompts/:promptId/confirm` | подтвердить/отклонить | `body:{ok:boolean}` | `{ok:true}` | `400 NOT_FOUND/SLOTS_ALREADY_COVERED/...; 403 FORBIDDEN; 500 BOT_MISSING` |
| `POST` | `/api/chats/messages/:messageId/delete` | удалить direct сообщение | `body:{}` | `{message}` | `404 NOT_FOUND; 403 FORBIDDEN` |
| `POST` | `/api/chats/messages/:messageId/reactions` | реакция direct | `body:{emoji}` | `{message}` | `400 EMOJI_REQUIRED; 404 NOT_FOUND; 403 FORBIDDEN` |
| `POST` | `/api/chats/messages/:messageId/pin` | pin/unpin direct | `body:{pinned}` | `{message}` | `404 NOT_FOUND; 403 FORBIDDEN` |
| `POST` | `/api/chats/messages/:messageId/poll-vote` | голос по poll | `body:{optionId}` | `{message}` | `400 OPTION_REQUIRED; 404 NOT_FOUND; 403 FORBIDDEN` |
| `POST` | `/api/chats/messages/:messageId/poll-close` | закрыть poll | `body:{}` | `{message}` | `404 NOT_FOUND; 403 FORBIDDEN` |
| `GET` | `/api/chats/search/messages` | поиск сообщений | `query:{q,peerUserId?,groupId?,topicId?}` | `{messages:ChatApiMessage[]}` | `403 FORBIDDEN` |

| `POST` | `/api/chats/groups` | создать группу | `body:{title,description?,avatarEmoji?,avatarImageUrl?,memberUserIds[]}` | `{group,defaultTopic:{id,name}}` | `400 TITLE_REQUIRED; 403 FORBIDDEN` |
| `PATCH` | `/api/chats/groups/:groupId` | update группы | `body:{...}` | `{group}` | `404 NOT_FOUND; 403 FORBIDDEN` |
| `GET` | `/api/chats/groups/:groupId` | get группы (+ prefs) | нет | `{group:{id,title,invitePolicy?},prefs:{...}}` | `404 NOT_FOUND; 403 FORBIDDEN` |
| `GET` | `/api/chats/groups/:groupId/invite` | invite link | нет | `{token,url}` | `404 NOT_FOUND; 403 FORBIDDEN` |
| `GET` | `/api/chats/groups/:groupId/members` | участники группы | нет | `{members:[{userId,fio,username,localDisplayName?,role,mutedUntil}]}` | `404 NOT_FOUND; 403 FORBIDDEN` |
| `POST` | `/api/chats/groups/:groupId/members` | добавить участника | `body:{userId,role?}` | `{member}` | `400 USER_ID_REQUIRED/FAILED; 403 FORBIDDEN; 404 NOT_FOUND` |
| `DELETE` | `/api/chats/groups/:groupId/members/:userId` | удалить участника | нет | `{ok:true}` | `400 CANNOT_REMOVE_SELF; 403 FORBIDDEN; 404 NOT_FOUND` |
| `PATCH` | `/api/chats/groups/:groupId/members/:userId` | обновить роль/мьют | `body:{role?,mutedUntil?}` | `{member}` | `403 FORBIDDEN; 404 NOT_FOUND` |

| `GET` | `/api/chats/groups/:groupId/topics` | темы группы | нет | `{topics:[{id,name,emoji,archived,isDefault}]}` | `404 NOT_FOUND; 403 FORBIDDEN` |
| `POST` | `/api/chats/groups/:groupId/topics` | создать тему | `body:{name,description?,emoji?}` | `{topic:{id}}` | `400 NAME_REQUIRED; 404 NOT_FOUND; 403 FORBIDDEN` |
| `POST` | `/api/chats/groups/:groupId/topics/:topicId/archive` | архивировать тему | `body:{}` | `{topic}` | `404 NOT_FOUND; 403 FORBIDDEN` |
| `DELETE` | `/api/chats/groups/:groupId/topics/:topicId` | удалить тему | нет | `{ok:true}` | `404 NOT_FOUND; 403 FORBIDDEN` |
| `PATCH` | `/api/chats/groups/:groupId/local-display-names/:userId` | локальные псевдонимы | `body:{localDisplayName}` | `{localDisplayNames}` | `400 USER_ID_REQUIRED; 403 FORBIDDEN` |

| `GET` | `/api/chats/groups/:groupId/messages` | сообщения темы | `query:{topicId}` | `{messages:ChatApiMessage[]}` | `404 NOT_FOUND; 403 FORBIDDEN` |
| `POST` | `/api/chats/groups/:groupId/messages` | отправить сообщение группы | `body:{topicId,text,attachments?,poll?,mentionUserIds?,replyToMessageId?}` | `{message}` | `400 TEXT_REQUIRED/TEXT_TOO_LONG/POLL_INVALID; 403 FORBIDDEN` |
| `POST` | `/api/chats/groups/:groupId/read` | mark read по topic | `body:{topicId,at}` | `{ok:true}` | `400 PARAM_REQUIRED; 403 FORBIDDEN` |
| `POST` | `/api/chats/groups/:groupId/messages/:messageId/delete` | delete сообщение группы | `body:{}` | `{message}` | `404 NOT_FOUND; 403 FORBIDDEN` |
| `POST` | `/api/chats/groups/:groupId/messages/:messageId/reactions` | reaction | `body:{emoji}` | `{message}` | `400 EMOJI_REQUIRED; 404 NOT_FOUND; 403 FORBIDDEN` |
| `POST` | `/api/chats/groups/:groupId/messages/:messageId/pin` | pin/unpin | `body:{pinned}` | `{message}` | `404 NOT_FOUND; 403 FORBIDDEN` |
| `POST` | `/api/chats/groups/:groupId/messages/:messageId/poll-vote` | poll vote | `body:{optionId}` | `{message}` | `404 NOT_FOUND; 403 FORBIDDEN` |
| `POST` | `/api/chats/groups/:groupId/messages/:messageId/poll-close` | poll close | `body:{}` | `{message}` | `404 NOT_FOUND; 403 FORBIDDEN` |
| `GET` | `/api/chats/groups/:groupId/pinned` | pinned сообщения | нет | `{messages:ChatApiMessage[]}` | `404 NOT_FOUND; 403 FORBIDDEN` |
| `POST` | `/api/chats/join/:token` | вступление в группу | `body:{}` | `{groupId}` | `400/404; 403 FORBIDDEN` |

---

## 2.6. Frontend: страницы, навигация, UI-паттерны

### Роутинг

`apps/web/src/router.tsx` описывает маршруты:

- `/login` → `LoginPage`
- `/` (guarded `PrivateRoute`) → `AppLayout` с children:
  - `index` → `HomePage` (перенаправляет на `section/main`)
  - `section/main` → `MainPage`
  - `section/timetable` → `TimetablePage`
  - `section/analytics` → `AnalyticsPage`
  - `section/journal` → `JournalPanelsPage`
  - `section/journal/class/:grade` → `JournalClassPage`
  - `section/journal/:grade/:disciplineCode` → `JournalTablePage`
  - `section/diary` → `DiaryEntryPage` (выбор ребёнка/доступность)
  - `section/diary/:studentUserId` → `DiaryViewPage` (просмотр дневника)
  - `documents` → `DocumentsFoldersPage`
  - `documents/folder/:folderId` → `DocumentsFoldersPage`
  - `documents/section/:sectionId` → `DocumentsFoldersPage`
  - `documents/section/:sectionId/folder/:folderId` → `DocumentsFoldersPage`
  - `section/methospace` → `MethospaceDisciplinesPage`
  - `section/methospace/:baseCode` → `MethospaceDisciplinePage`
  - `section/users_admin` → `UsersAdminPage`
  - `section/chats` → `ChatsPage`
  - `section/chats/join/:token` → `JoinGroupChatPage`
  - `section/:sectionId` → `SectionPage` (заглушка)

Guard:
- `PrivateRoute` проверяет токен и user в контексте `useAuth()`.

### UI-паттерны

Подтвержденные паттерны:
- `AppLayout`:
  - получает `officeConfig` (`api.office()`)
  - вычисляет доступные секции `computeOfficeSections`
  - рендерит `Sidebar` с `NavLink` по секциям
  - применяет theme/font/direction (ru/en) из `user.profilePrefs/locale`
- `Sidebar`: список разделов + unread badge для чатов.
- Внутри “реальных” страниц: формы/табличные гриды/модалки в стиле Tailwind (компоненты встроены в страницы; отдельные переиспользуемые UI-компоненты кроме Sidebar/Layouts отсутствуют).

### Ключевые страницы (данные → API → действия)

| Страница | Что отображает | API вызовы (по коду страниц/`lib/api.ts`) |
|---|---|---|
| `MainPage` (`section/main`) | календарный month-grid + создание/отмена статуса событий + индикаторы времени + локальные задачи дня | `calendarMonth`, `calendarEvents(date)`, `createCalendarEvent`, `updateCalendarEvent`, `timetableConfig`, `schoolClasses` |
| `TimetablePage` (`section/timetable`) | редактирование сетки/уроков/блоков + day/week views | `schoolClasses`, `timetableWeekView`, `timetableConfig`, `slots`, `lesson-options`, `lessons`, `effective-lessons` (опосредованно), `teacher-colors` и CRUD по slots/lessons/visual-blocks |
| `JournalPanelsPage` (`section/journal`) | панельная вилка выбора: для staff — классы, для teacher — “класс+предмет” | `schoolClasses` (для manager) или `teacher-loads/me` через `api.myTeacherPanels` |
| `JournalClassPage` / `JournalTablePage` | (в коде) построение таблицы журнала/работа с оценками | `journal/table`, `methospace/journal-document-types`, `documentsList`, `journal/marks` (upsert), `journal/lesson-meta`, `journal/lesson-documents` (upload/detach) |
| `DiaryEntryPage` (`section/diary`) | выбор ребёнка (для parent), либо кнопка входа (для student) | `diary/panels` |
| `DiaryViewPage` (`section/diary/:studentUserId`) | дневник по дням/слотам + финальные оценки | `methospace/quarters`, `diary/view`, `diary/final-grades` |
| `DocumentsFoldersPage` (`/documents...`) | дерево секций/папок + список документов + CRUD+upload+перемещение/линк | `documents/tree`, CRUD `documents/*` + `documents/upload` + управление чатами для “ссылка в чат” (через `chats.sendMessage`) |
| `MethospaceDisciplinesPage` | список дисциплин (в т.ч. “мои”) + настройка четвертей | `methospace/disciplines/summary`, `methospace/quarters` (+ `PUT quarters`) |
| `MethospaceDisciplinePage` | карточка дисциплины + прикрепление документов + настройка типов уроков | `methospace/disciplines/by-base/:baseCode`, `documentsList`, `documentsTree`, `chats/users`, CRUD дисциплины/материалов, `methospace/journal-document-types`, `methospace/journal-lesson-types` (+ upload standard-document) |
| `UsersAdminPage` | админка пользователей: CRUD + роли + линк “родители/дети” | `admin/users`, `admin/users/:id/details`, `admin/users` CRUD, `admin/parents/.../children/...` |
| `ChatsPage` | лента диалогов, сообщения, группы/темы/приглашения, typing/presence, реакции/опросы/закреп | полный набор из `lib/api.ts` для chats; а также `bots replacement` через `chats/bot/*` |

### UI-карты страниц (UI Block → Data → Source → Main actions)

#### `MainPage` (`section/main`)

| UI Block | Data (сущности 2.3) | Source (2.5) | Main actions (+ побочные эффекты) |
|---|---|---|---|
| Month grid | `CalendarEvent` по датам (статусы planned/held) | `GET /api/calendar/month?month=...`, `GET /api/calendar/events?date=...` | открыть/закрыть день; создать/удалить событие через `POST/PATCH/DELETE /api/calendar/events` → `calendarEvents.json` |
| Day editor | список событий выбранной даты | `GET /api/calendar/events?date=...` | менять статус/детали события → `PATCH /api/calendar/events/:id` |
| Time indicators | подсказки по сетке (время начала/длительность) | `GET /api/timetable/config` | только просмотр; влияет на подсчёт интервалов отображения |
| Local “tasks day” | (в UI) подсказки пользователю (без подтверждённой доменной сущности) | ГИПОТЕЗА: локальное состояние/derived | пользовательский UX; бэкенд не обязателен |

#### `TimetablePage` (`section/timetable`)

| UI Block | Data (сущности 2.3) | Source (2.5) | Main actions (+ побочные эффекты) |
|---|---|---|---|
| Week/day grid | `TimetableLesson`, визуальные блоки `TimetableVisualBlock`, computed тайминг (view-model) | `GET /api/timetable/week-view|day-view`, `GET /api/timetable/effective-lessons?from&to=...` (иногда косвенно), `GET /api/timetable/visual-blocks` (через day/week view) | редактирование сетки: create/update/delete уроков (`POST/PATCH/DELETE /api/timetable/lessons`) и блоков (`POST/PATCH/DELETE /api/timetable/visual-blocks`) → `timetableLessons.json`, `timetableVisualBlocks.json` |
| Slot palette / lesson options | допустимые `disciplineCode/teacherUserId/groupNumber` для выбранного слота | `GET /api/timetable/lesson-options` | выбрать вариант и создать урок (`POST /api/timetable/lessons`) → `timetableLessons.json` |
| Lesson editor | конкретный `TimetableLesson` (дата+slotIndex+привязки teacher/discipline) | `GET /api/timetable/lessons` и/или `PATCH /api/timetable/lessons/:id` | смена учителя/предмета/slotPatternId → `PATCH /api/timetable/lessons/:id` |
| Slot operations (admin) | паттерны/слоты: merge/split/delete | `GET/PUT/POST/DELETE /api/timetable/slots*`, `POST /api/timetable/slot-rows/*`, `PUT /api/timetable/slots/:id/*` | перестройка сетки → может потребовать пересчёта/очистки недели (`POST /api/timetable/week/clear`) |
| Teacher colors | палитра цветов для `teacherUserId` | `GET /api/timetable/teacher-colors`, `PATCH /api/timetable/teacher-colors` | обновить палитру → `timetableTeacherColors.json` |

#### `AnalyticsPage` (`section/analytics`)

| UI Block | Data (сущности 2.3) | Source (2.5) | Main actions (+ побочные эффекты) |
|---|---|---|---|
| School overview | computed view-model риска/качества по школе (рисковые зоны, агрегаты) | `GET /api/analytics/overview?from=&to=&minAverage=&minAttendancePercent=` | менять фильтры периода → перезагрузка view-model |
| Class aggregates | агрегаты по `SchoolClass`/дисциплине | `GET /api/analytics/classes?from=&to=&grade=&disciplineCode=` | выбор класса/предмета → обновить карточки |
| Teacher panels | панели учителя по его `TeacherLoad` | `GET /api/analytics/teacher?from=&to=` | только просмотр |
| Revision setup (для staff) | выбор классов и `journal document types`, старт `RevisionJob` | `GET /api/analytics/revision/classes`, `GET /api/analytics/revision/journal-document-types` | старт ревизии: `POST /api/analytics/revision/documentation` или `POST /api/analytics/revision/journal` → create job в `revisionJobs.json` |
| Revision bot outputs | сообщения/результаты проверки в чатах | ГИПОТЕЗА: отображение зависит от `messenger.json`/unread badge | после job’ов наблюдать бот-сообщения в `ChatsPage` |

#### `JournalPanelsPage` (`section/journal`)

| UI Block | Data (сущности 2.3) | Source (2.5) | Main actions (+ побочные эффекты) |
|---|---|---|---|
| Class selector (staff) | список `SchoolClass`/предметные доступы | `GET /api/school/classes` | выбор класса → переход к `JournalClassPage/JournalTablePage` |
| Teacher panel selector (teacher) | доступные `TeacherLoad`-панели (класс+предмет) | `GET /api/teacher-loads/me` | выбор панели → переход к таблице журнала |

#### `JournalClassPage` (`section/journal/class/:grade`)

| UI Block | Data (сущности 2.3) | Source (2.5) | Main actions (+ побочные эффекты) |
|---|---|---|---|
| Grade groups/disciplines list | доступные `ClassGroup`/наборы для класса (которые определяют `grade + disciplineCode`) | `GET /api/school/classes/:grade/groups` | клик по группе/дисциплине → переход в `JournalTablePage` (`section/journal/:grade/:disciplineCode`) |
| Quick jump to table | выбранный `grade/disciplineCode` как параметр для построения таблицы | (navigation) | переход без изменений данных |

#### `JournalTablePage` (`section/journal/:grade/:disciplineCode`)

| UI Block | Data (сущности 2.3) | Source (2.5) | Main actions (+ побочные эффекты) |
|---|---|---|---|
| Journal grid | `EffectiveLesson` + `JournalLessonMeta`/`JournalLessonStudentMark` (mark/absent) | `GET /api/journal/table` | редактировать mark/absent → `PUT /api/journal/marks` → `journalLessonMarks.json` |
| Topic + lesson type | тема урока (`topic`) и `journalLessonTypeId` | `PUT /api/journal/lesson-meta` | сохранить тему/тип урока → `journalLessonMeta.json` |
| Document attachment list | прикреплённые документы (`attachedDocumentIds[]`) | `GET /api/journal/table` + список типов | загрузить документ → `POST /api/journal/lesson-documents` → `documents.json` + `journalLessonMeta.attachedDocumentIds[]` |
| Detach document | связь `attachedDocumentIds[]` | `DELETE /api/journal/lesson-documents/:documentId?timetableLessonId=` | отключить документ от урока → `journalLessonMeta.attachedDocumentIds[]` |

#### `DiaryEntryPage` (`section/diary`)

| UI Block | Data (сущности 2.3) | Source (2.5) | Main actions (+ побочные эффекты) |
|---|---|---|---|
| Children panels (parent) | список `ParentChildLink` → `DiaryPanelsItem` | `GET /api/diary/panels` | выбрать ребёнка → `GET /api/diary/view?...&studentUserId=` |
| Login entry (student) | “дневник для себя” | локальный redirect | переход к просмотру своего дневника |

#### `DiaryViewPage` (`section/diary/:studentUserId`)

| UI Block | Data (сущности 2.3) | Source (2.5) | Main actions (+ побочные эффекты) |
|---|---|---|---|
| Diary lessons list | `DiaryLessonRow` (mark/absent по `TimetableLesson.id`) | `GET /api/diary/view` | только просмотр |
| Day slots (если from==to) | `DaySlotCell` | `GET /api/diary/view` | только просмотр |
| Final grades | `DiaryFinalSubject` (`finalMark` по `Discipline.gradeRanges`) | `GET /api/diary/final-grades` | только просмотр |
| Quarters context | `QuarterPeriod[]` | `GET /api/methospace/quarters` | только просмотр/навигация по периодам |

#### `DocumentsFoldersPage` (`/documents...`)

| UI Block | Data (сущности 2.3) | Source (2.5) | Main actions (+ побочные эффекты) |
|---|---|---|---|
| Tree (sections+folders) | `DocumentSection` + `DocumentTreeFolder` | `GET /api/documents/tree` | CRUD папок/секций → `POST/PATCH/DELETE /api/documents/*` → `documentSections.json`, `documentFoldersTree.json` |
| Documents list | `StoredDocument` + `DocumentTagSet` | `GET /api/documents?disciplineCode/&periods/&roles...` | фильтрация по дисциплине/периодам (теги) → derived через `documents` store |
| Upload | `StoredDocument` (создание файла) | `POST /api/documents/upload` (multipart) | загрузить файл → `data/files/*` + запись в `documents.json` |
| Move/merge/link | перемещение `StoredDocument` и линки дисциплины | `POST /api/documents/move-documents`, `POST /api/documents/merge-folders-to-section`, `POST /api/documents/:id/link` | перемещение/линк → обновление метаданных `documents.json` и `disciplines.json` |
| “Share in chat” | (в UI) ссылка/файл отправляется в чат | ГИПОТЕЗА: отправка чата + скачивание статики | отправка через chat message с URL → `messenger.json` (если хранится в сообщении) |

#### `MethospaceDisciplinesPage` (`section/methospace`)

| UI Block | Data (сущности 2.3) | Source (2.5) | Main actions (+ побочные эффекты) |
|---|---|---|---|
| Disciplines summary | `MethodPack`/стандарты (косвенно) и наличие материалов (`hasMaterials/hasRanges`) | `GET /api/methospace/disciplines/summary?mine=...` | выбрать baseCode → `MethospaceDisciplinePage` |
| Quarters editor (staff) | `QuarterPeriod[]` | `GET /api/methospace/quarters`, `PUT /api/methospace/quarters` | сохранение четвертей → `quarters.json` |

#### `MethospaceDisciplinePage` (`section/methospace/:baseCode`)

| UI Block | Data (сущности 2.3) | Source (2.5) | Main actions (+ побочные эффекты) |
|---|---|---|---|
| Discipline card | `Discipline` + связанные `StoredDocument` | `GET /api/methospace/disciplines/by-base/:baseCode` + `documents/tree/list` | редактировать дисциплину (если staff) → `PATCH /api/methospace/disciplines/:code` |
| Method packs | `MethodPack[]` | `GET/POST/PATCH/DELETE /api/methospace/method-packs` | CRUD методпаков → `methodPacks.json` |
| Journal types (doc/lesson) | `JournalDocumentType[]` + `JournalLessonType[]` | `GET/POST/PATCH/DELETE /api/methospace/journal-document-types`, `GET/POST/PATCH/DELETE /api/methospace/journal-lesson-types` | настройка типов уроков → соответствующие JSON хранилища |
| Standard document upload | стандартный документ типа урока | `POST /api/methospace/journal-lesson-types/:id/standard-document` | загрузить/обновить файл → `documents.json` + `journalLessonTypes.json` (`standardDocumentId`) |

#### `UsersAdminPage` (`section/users_admin`)

| UI Block | Data (сущности 2.3) | Source (2.5) | Main actions (+ побочные эффекты) |
|---|---|---|---|
| Users list | `StoredUser[]` | `GET /api/admin/users` | создать/удалить пользователя → `POST /api/admin/users`, `DELETE /api/admin/users/:id` |
| User details | `User` + `TeacherLoad`/assignments + дети | `GET /api/admin/users/:id/details` | редактировать роли/поля → `PATCH /api/admin/users/:id` и `PATCH /api/admin/users/:id/roles` |
| Parent-child links | `ParentChildLink` | `DELETE /api/admin/parents/:parentUserId/children/:studentUserId` | unlink → обновление `parent-children.json` |
| Clear database | reset данных (кроме bootstrap admin) | `POST /api/admin/clear-database` | очистка → обнуление JSON-хранилищ |

#### `ChatsPage` (`section/chats`)

| UI Block | Data (сущности 2.3) | Source (2.5) | Main actions (+ побочные эффекты) |
|---|---|---|---|
| Inbox | `DirectMessage`/`ChatGroup` сводка и unread | `GET /api/chats/inbox`, `GET /api/chats/unread-count` | выбрать диалог |
| Direct messages | `DirectMessage[]` + метаданные (poll/reply/attachments) | `GET /api/chats/messages?userId=...` | отправить → `POST /api/chats/messages`; mark read → `POST /api/chats/messages/read`; модификации → `POST /api/chats/messages/:messageId/*` |
| Group chats | `ChatGroup`, `GroupTopic`, `GroupMessage[]` | `GET /api/chats/groups/:groupId/messages?topicId=...` | отправить/читать/модерировать тему/участников → соответствующие `GET/POST/PATCH/DELETE /api/chats/groups/*` + `POST /api/chats/groups/:groupId/read` |
| Bot replacement UI | `CandidatePrompt` state + выбор слотов | `POST /api/chats/bot/replacement-prompts/:promptId/*` | переключать слоты/подтверждать → обновление `botReplacementSessions.json` + замена `TimetableLesson.teacherUserId` |

#### `JoinGroupChatPage` (`section/chats/join/:token`)

| UI Block | Data (сущности 2.3) | Source (2.5) | Main actions (+ побочные эффекты) |
|---|---|---|---|
| Token join | member/доступ в `ChatGroup` | `POST /api/chats/join/:token` | вступить в группу → обновление `messenger.json` (groupMembers/prompts/первичная sync) |

---

## 2.7. Backend: модули, слои, бизнес-логика

### Организация кода

Основные каталоги:

- `src/routes/*`: описания HTTP endpoints.
- `src/store/*`: файловое хранилище и нормализация объектов (read/write caches).
- `src/services/*`: вычисления и инварианты (например `effectiveLessons`, `journalQuarterLessonsMaterialized`, `documentationRevisionRun`).
- `src/auth/*` + `src/middleware/*`: JWT-проверка и type `AuthedRequest`.
- `src/utils/*`: утилиты по времени/коду/валидации.

### Пример ключевых бизнес-правил (по коду)

| Правило | Где реализовано | Суть |
|---|---|---|
| “Календарные события выбивают уроки” | `services/effectiveLessons.ts` (используется `timetable/*` и `journal/diary/analytics`) | `effective-lessons` исключает перекрытые `planned/held` событиями уроки |
| “Создание урока расписания разрешено только при нагрузке учителя” | `routes/timetable.ts` + `teacherLoadStore.isTeacherAllowedLesson` | teacherLoad определяет право вести конкретные уроки/группы |
| “Журнал и дневник строятся по `TimetableLesson.id`” | `journal` store + `diary` агрегации | мета/оценки привязаны к уроку расписания |
| “Оценка/absent upsert по уроку и ученику” | `store/journalStore.ts` | upsert в `journalLessonMarks.json` |
| “Дневник parent доступен только по привязке parentChildLink” | `routes/diary.ts` | `canAccessStudent` проверяет `parentChildStore.isLinked` |
| “Права доступа по секциям кабинетов для чатов” | `routes/chats.ts` | `requireChatsAccess` использует `officeConfig` + роли пользователя |
| “Только head_teacher/director управляют timetable/calendar/частью документов/методпространства” | `routes/*` (локальные `is*`/`require*`) | эндпоинты проверяют роли перед изменениями |
| “Фоновые ревизии” | `services/revisionBotScheduler.ts` + `services/*RevisionRun` | `setInterval` каждый 30с обрабатывает `revisionJobs.json` |
| “Ассистент замен уроков” | `services/botReplacementStateMachine.ts` + scheduler tick | через `botReplacementSessions.json` и синхронизацию чат-сообщений |

---

## 2.8. Сквозные пользовательские сценарии (E2E)

Ниже — сценарии по ролям (3–7 сценариев на роль). Каждый сценарий — пошаговая цепочка `UI → API → backend-логика → БД`, строго по доменным сущностям (`2.3`) и контрактам (`2.5`).

### `director` (аналитика + ревизии + timetable/календарь)

#### `director` / Сценарий 1: Запуск ревизии документации (analytics → revision jobs → бот)
1. UI: открыть раздел аналитики и инициировать ревизию документации.
   - API: `POST /api/analytics/revision/documentation`
   - Backend: `analyticsRouter.post("/revision/documentation")` → создаёт запись в `revisionJobs.json` (тип `DocumentationRevisionPayload`)
   - БД: запись job добавляется/обновляется в `revisionJobs.json`.
2. UI: по ответу `POST` показать `job`-идентификатор и параметры (например `scheduledAt`) в интерфейсе.
   - API: ответ `201:{job}` из `POST /api/analytics/revision/documentation`
   - Backend: сервер включает сформированный job-объект в ответ
   - БД: поля job сохранены в `revisionJobs.json` на шаге 1.
3. UI: бот-уведомления/сообщения поступят в чаты (как “побочный эффект системы”).
   - API (внутреннее): `revisionBotScheduler.ts` при очередном tick вызывает `documentationRevisionRun`.
   - Backend: `documentationRevisionRun` вычисляет недостающие документы и отправляет сообщения учителям через `chats`/messenger layer.
   - БД: обновляет job-артефакты (например “missingDocs / sent messages”) в `revisionJobs.json` и пишет сообщения в `messenger.json` (если бот отправляет в чат).

#### `director` / Сценарий 2: Запуск ревизии журнала (analytics → journalRevisionRun)
1. UI: инициировать ревизию журнала на период.
   - API: `POST /api/analytics/revision/journal`
   - Backend: `analyticsRouter.post("/revision/journal")` → materializes/сверяет ожидаемые `TimetableLesson` против `journalLessonMarks`/`journalLessonMeta`
   - БД: создаёт `RevisionJob` в `revisionJobs.json` (тип `JournalRevisionPayload`).
2. UI: по ответу `POST` показать параметры job (например `scheduledAt`) и начать ожидание результата.
   - API: ответ `201:{job}` из `POST /api/analytics/revision/journal`
   - Backend: сервер включает сформированный job-объект в ответ
   - БД: поля job сохранены в `revisionJobs.json` на шаге 1.
3. UI: получить сводку/уведомления в чатах.
   - API (внутреннее): `revisionBotScheduler.ts` → `journalRevisionRun`
   - Backend: `journalRevisionRun` формирует список “не заполнено” (оценки/темы/документы) и отправляет бот-сводку
   - БД: обновляет job-артефакты в `revisionJobs.json`, а также пишет сообщения в `messenger.json`.

#### `director` / Сценарий 3: Копирование/очистка недели расписания (timetable management)
1. UI: открыть `section/timetable` и выбрать операцию “копировать неделю” (для нового учебного периода).
   - API: `POST /api/timetable/copy-week`
   - Backend: `timetableRouter.post("/copy-week")` проверяет право управления и входные ограничения (source/target недели)
   - БД: изменения в `timetableLessons.json` (и связанные структуры, например `timetableSlots.json`/`timetableVisualBlocks.json` если копирование затрагивает их параметры).
2. UI: при необходимости — очистить “target week” перед повторной настройкой.
   - API: `POST /api/timetable/week/clear`
   - Backend: `timetableRouter.post("/week/clear")` → удаляет/обнуляет lessons на диапазоне
   - БД: обновляет `timetableLessons.json` (возможные производные кеши/материализации — ГИПОТЕЗА, т.к. механизм зависит от `store/services`).
3. UI: проверить итог в сетке.
   - API: `GET /api/timetable/week-view` / `GET /api/timetable/day-view`
   - Backend: строит view-model через вычисления `effectiveLessons` и визуальные блоки
   - БД: чтение `timetableLessons.json`, `calendarEvents.json`, `timetableVisualBlocks.json`.

### `head_teacher` (timetable + calendar + journal + methospace + documents + admin)

#### `head_teacher` / Сценарий 1: Редактирование расписания и создание уроков (timetable)
1. UI: открыть `section/timetable`, выбрать день/слот и создать `TimetableLesson`.
   - API: `POST /api/timetable/lessons`
   - Backend: `timetableRouter.post("/lessons")` проверяет доступ по `TeacherLoad`/управляющим ролям
   - БД: добавляет запись в `timetableLessons.json`.
2. UI: отредактировать параметры урока (учитель/дисциплина/паттерн).
   - API: `PATCH /api/timetable/lessons/:id`
   - Backend: `timetableRouter.patch("/lessons/:id")`
   - БД: обновляет `timetableLessons.json`.
3. UI: сохранить изменения, наблюдать перерасчёт доступности заполнения журнала.
   - API: `GET /api/timetable/effective-lessons?from=&to=...` (или косвенно при переходе в журнал)
   - Backend: `effectiveLessons` применяет календарные `planned/held` события к слотам
   - БД: чтение `timetableLessons.json` + `calendarEvents.json` → view-model.

#### `head_teacher` / Сценарий 2: Управление календарными событиями (calendar → effectiveLessons)
1. UI: в календаре создать событие “planned/held” на дату.
   - API: `POST /api/calendar/events`
   - Backend: `calendarRouter.post("/events")` валидирует диапазон и авторизацию
   - БД: запись в `calendarEvents.json`.
2. UI: изменить статус/детали события.
   - API: `PATCH /api/calendar/events/:id`
   - Backend: `calendarRouter.patch("/events/:id")`
   - БД: обновляет `calendarEvents.json`.
3. UI: вернуться в расписание/журнал и убедиться, что “встречи” пересобрались.
   - API: `GET /api/timetable/week-view` и/или `GET /api/journal/table`
   - Backend: `effectiveLessons` исключает/пересобирает уроки поверх `planned/held`
   - БД: чтение `timetableLessons.json`, `calendarEvents.json`, затем чтение `journalLessonMarks.json`/`journalLessonMeta.json`.

#### `head_teacher` / Сценарий 3: Заполнение/модерация журнала (journal)
1. UI: открыть `JournalTablePage` для конкретной `SchoolClass` и `Discipline`.
   - API: `GET /api/journal/table?from=&to=&grade=&disciplineCode=...`
   - Backend: `journalRouter.get("/table")` строит итог через “эффективные уроки”
   - БД: чтение `timetableLessons.json`, `calendarEvents.json`, затем `journalLessonMarks.json` и `journalLessonMeta.json`.
2. UI: проставить оценки/absent для ученика.
   - API: `PUT /api/journal/marks`
   - Backend: `journalStore.upsertStudentMark`
   - БД: upsert в `journalLessonMarks.json`.
3. UI: заполнить тему урока и тип урока, а также прикрепить документы.
   - API: `PUT /api/journal/lesson-meta` и `POST /api/journal/lesson-documents`
   - Backend: обновляет `journalLessonMeta` и связывает `documents` с уроком
   - БД: обновляет `journalLessonMeta.json` и дополняет `documents.json` (вместе с `journalLessonMeta.attachedDocumentIds[]`).

#### `head_teacher` / Сценарий 4: Настройка методического пространства и четвертей (methospace → quarters)
1. UI: открыть `section/methospace` и отредактировать периоды (четверти/каникулы).
   - API: `GET /api/methospace/quarters` → `PUT /api/methospace/quarters`
   - Backend: `methospaceRouter.get/put("/quarters")`
   - БД: обновляет `quarters.json` и связанные производные (если есть).
2. UI: настроить типы уроков журнала и стандартные документы типов.
   - API: `POST /api/methospace/journal-lesson-types` и `POST /api/methospace/journal-lesson-types/:id/standard-document` (multipart)
   - Backend: `methospaceRouter` создаёт типы и привязывает/перезаписывает стандартный документ
   - БД: обновляет `journalLessonTypes.json` и `documents.json` (стандартный документ).
3. UI: открыть карточку дисциплины и убедиться, что типы доступны для выбора в журнале.
   - API: `GET /api/methospace/disciplines/by-base/:baseCode` + `GET /api/methospace/journal-lesson-types`
   - Backend: агрегирует связки дисциплина → types → documents
   - БД: чтение `disciplines.json`, `journalLessonTypes.json`, `documents.json`.

### `teacher` (journal + methospace + chats/bot replacement)

#### `teacher` / Сценарий 1: Ведение журнала по своим панелям (journal)
1. UI: открыть панель “мой класс+предмет” в `section/journal`.
   - API: `GET /api/teacher-loads/me`
   - Backend: `teacherLoadsRouter.get("/me")`
   - БД: чтение `teacherLoads.json` и `disciplines.json`.
2. UI: перейти в `JournalTablePage` и загрузить период.
   - API: `GET /api/journal/table?from=&to=&grade=&disciplineCode=...`
   - Backend: `journalRouter.get("/table")` фильтрует уроки по `TeacherLoad`
   - БД: чтение `timetableLessons.json`/`calendarEvents.json` и затем `journalLessonMarks.json`/`journalLessonMeta.json`.
3. UI: выставить оценки/absent и сохранить.
   - API: `PUT /api/journal/marks`
   - Backend: upsert mark для пары (`TimetableLesson.id` + `studentUserId`)
   - БД: запись в `journalLessonMarks.json`.
4. UI: прикрепить документ к уроку по типу из methospace.
   - API: `POST /api/journal/lesson-documents`
   - Backend: `services/journalLessonDocuments` подбирает тип/ограничения и пишет связь
   - БД: обновляет `documents.json` и `journalLessonMeta.json`.

#### `teacher` / Сценарий 2: Просмотр методического пространства “для себя” (methospace)
1. UI: перейти в `section/methospace` и открыть summary.
   - API: `GET /api/methospace/disciplines/summary?mine=1`
   - Backend: `methospaceRouter.get("/disciplines/summary")` ограничивает список доступными дисциплинами
   - БД: чтение `disciplines.json`, возможное чтение `methodPacks.json`/документов для “hasMaterials”.
2. UI: открыть `MethospaceDisciplinePage` по `baseCode` и выбрать “тип урока”.
   - API: `GET /api/methospace/disciplines/by-base/:baseCode` и `GET /api/methospace/journal-lesson-types`
   - Backend: агрегирование дисциплина → методпак → documents/types
   - БД: чтение `methodPacks.json`, `journalLessonTypes.json`, `documents.json`.
3. UI: при необходимости скачать/пересмотреть стандартный документ для типа урока.
   - API: ГИПОТЕЗА: выдача file приходит как `GET` статически по `url` из `documents.json` (без отдельного endpoint контракт-уровня)
   - Backend: служит статика `express.static` для `/files`
   - БД: чтение не нужно на уровне store (файл с диска); в JSON остаётся ссылка в `documents.json`.

#### `teacher` / Сценарий 3: Замена учителя через bot replacement UI (chats + bot replacement state machine)
1. UI: открыть `ChatsPage` и выбрать карточку “bot replacement prompts” (кандидатский экран).
   - API: (в пределах chats) загрузка/поиск доступных prompt’ов и контекста
   - Backend: `chatsRouter` отдаёт состояние `botReplacementSessions.json`/prompt’ов
   - БД: чтение `botReplacementSessions.json`.
2. UI: в prompt выбрать слот (`slotIndex`) для покрытия.
   - API: `POST /api/chats/bot/replacement-prompts/:promptId/toggle-slot` (body `{slotIndex}`)
   - Backend: `toggle-slot` проверяет валидность слота и активность сессии
   - БД: обновляет `botReplacementSessions.json` (какие слоты покрыты кандидатом).
3. UI: запросить подтверждение (или сразу подтвердить).
   - API: `POST /api/chats/bot/replacement-prompts/:promptId/request-confirm` → затем `POST /api/chats/bot/replacement-prompts/:promptId/confirm` (body `{ok:boolean}`)
   - Backend: `request-confirm`/`confirm` меняют state-контур и инициируют замену
   - БД: обновляет `botReplacementSessions.json`, а затем при подтверждении вызывает синхронизацию замены в расписании (ГИПОТЕЗА: запись в `timetableLessons.json` через sync шаг).

### `parent` (diary + chats)

#### `parent` / Сценарий 1: Просмотр дневника ребёнка (diary)
1. UI: открыть `section/diary` и выбрать ребёнка.
   - API: `GET /api/diary/panels`
   - Backend: `diaryRouter.get("/panels")` резолвит `ParentChildLink` и доступность
   - БД: чтение `parent-children.json`, `students.json`, `users.json`.
2. UI: открыть `DiaryViewPage` выбранного `studentUserId`.
   - API: `GET /api/diary/view?from=&to=&studentUserId=...`
   - Backend: строит представление по `effectiveLessons` и журналу
   - БД: чтение `timetableLessons.json`, `calendarEvents.json`, затем `journalLessonMarks.json`/`disciplines.json`.
3. UI: просмотреть конкретный день/урок и соответствующую запись оценок.
   - API: (внутренне) повторный выбор диапазона вызывает тот же `GET /api/diary/view`
   - Backend: вычисляет slice по заданному диапазону
   - БД: чтение тех же store’ов.

#### `parent` / Сценарий 2: Просмотр финальных оценок (diary)
1. UI: на `DiaryViewPage` перейти к “final grades”.
   - API: `GET /api/diary/final-grades?from=&to=&studentUserId=...`
   - Backend: рассчитывает итог через диапазоны `Discipline.gradeRanges`
   - БД: чтение `disciplines.json` и агрегированных `journalLessonMarks.json` (через метод подсчёта).
2. UI: фильтровать по предмету/периоду (если присутствует на экране).
   - API: повторный `GET /api/diary/final-grades` с параметрами
   - Backend: повторный расчёт view-model
   - БД: те же JSON store’ы.

#### `parent` / Сценарий 3: Обсуждение/документы через чаты (chats → messenger + статические файлы)
1. UI: открыть `ChatsPage`, выбрать direct или group.
   - API: `GET /api/chats/inbox` (+ далее `GET /api/chats/messages` / `GET /api/chats/groups/:groupId/messages?topicId=...`)
   - Backend: `chatsRouter` фильтрует доступ через `requireChatsAccess`
   - БД: чтение `messenger.json`.
2. UI: отправить сообщение с прикреплением (например, ссылкой/файлом).
   - API: `POST /api/chats/upload` (multipart `files[]`) → затем `POST /api/chats/messages` с `attachments[]`
   - Backend: chats upload сохраняет метаданные вложений и возвращает `url`
   - БД: обновляет данные вложений в `messenger.json` и/или метаданные attachments (ГИПОТЕЗА: сами файлы идут в `data/` через multer, а ссылка на `url` хранится в сообщении).
3. UI: открыть attachment по `url` и просмотреть/скачать.
   - API: `GET /files/...` (статическая раздача)
   - Backend: `express.static` раздаёт по URL из attachment
   - БД: не обновляет JSON store (только чтение с диска).

### `student` (diary + chats)

#### `student` / Сценарий 1: Просмотр своего дневника (diary)
1. UI: открыть `section/diary` (своя учётная запись).
   - API: `GET /api/diary/view?from=&to=` (studentUserId = viewer)
   - Backend: `diaryRouter.get("/view")` (student scope)
   - БД: читает `timetableLessons.json`/`calendarEvents.json` → `journalLessonMarks.json` → `disciplines.json`.
2. UI: перейти к итогам.
   - API: `GET /api/diary/final-grades?from=&to=`
   - Backend: рассчитывает по `gradeRanges`
   - БД: чтение `disciplines.json` + `journalLessonMarks.json`.

#### `student` / Сценарий 2: Общение в чатах (chats)
1. UI: открыть список диалогов.
   - API: `GET /api/chats/inbox` (+ возможно `GET /api/chats/unread-count`)
   - Backend: `chatsRouter` отдаёт unread/preview
   - БД: чтение `messenger.json`.
2. UI: открыть direct чат и отправить сообщение.
   - API: `POST /api/chats/messages` (body `{toUserId,text?,attachments?,...}`)
   - Backend: валидация `TEXT_REQUIRED/TEXT_TOO_LONG/...` и доступности диалога
   - БД: добавляет `ChatApiMessage` в структуру сообщений (и, вероятно, обновляет unread-индексы).

#### `student` / Сценарий 3: Открыть attachment из сообщения (documents via chat)
1. UI: выбрать сообщение с вложением в чате.
   - API: `GET /api/chats/messages?userId=...` или `GET /api/chats/groups/:groupId/messages?...`
   - Backend: `chatsRouter` отдаёт `attachments` с `url`
   - БД: чтение `messenger.json`.
2. UI: кликнуть по вложению.
   - API: `GET /files/...` (статическая раздача)
   - Backend: `express.static`
   - БД: только чтение файла.

### `bot` (как автоматизация: revision bots + bot replacement escalations)

#### `bot` / Сценарий 1: Обработка job “documentation revision” (background scheduler)
1. UI: директор/ head_teacher инициирует job.
   - API: `POST /api/analytics/revision/documentation`
   - Backend: создаёт `RevisionJob` в `revisionJobs.json`
   - БД: запись `RevisionJob` в `revisionJobs.json`.
2. UI: пользователь ждёт результатов.
   - API (внутреннее): `revisionBotScheduler.ts` по `setInterval` (tick)
   - Backend: `documentationRevisionRun` вычисляет missing/required документы через связки `journal lesson types`, `journal document types`, `documents`
   - БД: обновляет статусы job в `revisionJobs.json` и отправляет бот-сообщения в `messenger.json`.

#### `bot` / Сценарий 2: Обработка job “journal revision” (background scheduler)
1. UI: инициатор запускает ревизию.
   - API: `POST /api/analytics/revision/journal`
   - Backend: job-инициализация
   - БД: запись в `revisionJobs.json`.
2. UI: после завершения job — бот-итоги.
   - API (внутреннее): tick → `journalRevisionRun`
   - Backend: проверяет заполненность `journalLessonMarks`/`journalLessonMeta` на ожидаемых `TimetableLesson`
   - БД: добавляет/обновляет артефакты в `revisionJobs.json` и пишет summary-сообщения в `messenger.json`.

#### `bot` / Сценарий 3: Bot replacement escalation/state machine (background scheduler + replacement sessions)
1. UI: кандидат учитель выбирает слоты через bot replacement prompt UI.
   - API: `POST /api/chats/bot/replacement-prompts/:promptId/toggle-slot` → `POST .../request-confirm` → `POST .../confirm`
   - Backend: `chatsRouter` передаёт изменения в state machine контур `botReplacementSessions.json`
   - БД: обновляет `botReplacementSessions.json`.
2. UI: ожидание применения замены в расписании.
   - API (внутреннее): `revisionBotScheduler.ts` tick → логика `botReplacementStateMachine.ts` (эскалации/подтверждения)
   - Backend: синхронизация итогового state: выбор учителя для `TimetableLesson` и соответствующие сообщения/подтверждения
   - БД: обновляет `timetableLessons.json` и/или статусы сессий в `botReplacementSessions.json` (точные поля — ГИПОТЕЗА, зависит от store-типа).

---

## 2.9. Инфраструктура и интеграции

### Запуск/развёртывание

По коду репозитория:

- Monorepo: корневой `package.json` запускает оба приложения в dev-режиме через `concurrently`.
  - `npm run dev:web` → `vite`
  - `npm run dev:api` → `tsx watch src/index.ts`
  - `npm run build` → `tsc -b` (web) + `tsc` (api) и `vite build`

### Контейнеризации (Docker/K8s)

В текущем дереве кода не найдено явных `Dockerfile`, `docker-compose.yml`, Kubernetes манифестов и CI workflows. Следовательно:
- `ГИПОТЕЗА`: инфраструктура контейнеров отсутствует или вынесена вне репозитория.

### Интеграции

1. JWT: `jsonwebtoken` (сервер-side) + bcryptjs (пароли).
2. File uploads: `multer`, запись на диск.
3. Сторонняя интеграция на фронте: генерация QR-кодов приглашений через `https://api.qrserver.com/v1/create-qr-code/...` (используется в UI `ChatsPage` / `DocumentsFoldersPage` для share links).

---

## 2.10. Технический долг и открытые вопросы

Наблюдения (подтверждено кодом):

1. **Нет настоящей БД**: JSON-файлы и файловая система. Это ограничивает масштабирование, целостность и производительность.
2. **Отсутствует CI/CD** в репозитории (не найдено workflows/манифестов).
3. **Заглушки UI**: `HomePage` и `SectionPage` не реализуют бизнес-логику (`SectionPage` прямо пишет “пока не реализуем”).
4. **Duplication в auth middleware**: в бэкенде есть две разные сущности `middleware`/`auth` (`apps/api/src/auth/middleware.ts` и `apps/api/src/middleware/auth.ts`). В текущих роутерах используется `../auth/middleware.js`, а второй файл может быть неактуальным.
5. **Разбор роли и кабинетов**:
   - фронт вычисляет секции по `officeConfig`,
   - бэкенд отдельно проверяет access для части доменов (например `chats` через ту же идею кабинетов, но остальные модули — через прямые `requireHeadTeacher/requireStaff` и т.п.).
   - `ГИПОТЕЗА`: при расширении доменов может возникнуть рассинхрон “какой кабинет даёт доступ” и “какая проверка стоит на эндпоинтах”.
6. **Производительность чатов**: по паттернам store/view вероятна загрузка “всех” сообщений/пользователей в рамках фильтра без пагинации (требует подтверждения по желанию расширить анализ `chats.ts`).

Открытые вопросы для дальнейшего развития:

- Как обеспечить строгую целостность данных при текущем JSON-подходе (например, что делать при удалении дисциплины/урока: каскады, консистентность `journal` и `documents`)?
- Нужна ли многостраничная пагинация для чатов/сообщений и какие индикаторы производительности ожидаются?
- Стоит ли унифицировать “права доступа” единым модулем (например, таблица “раздел → роли → эндпоинты”) вместо локальных `require*` в каждом route?
- Какие доменные инварианты должны стать явными контрактами/валидациями на уровне сервисов, а не маршрутов?

