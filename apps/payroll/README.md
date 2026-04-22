# EDUMED Payroll (локальный MVP)

Прозрачный модуль учёта ставок и расчёта начислений для школы: кандидаты, стажёры, педагоги с ТД и без, PK/PR/OP, МРОТ, субсидии, замены, аудит, проекты приказов.

## Стек

- Next.js 16 (App Router), TypeScript, React 19
- Prisma 7 + SQLite (`better-sqlite3` через официальный адаптер)
- Zod для схем форм
- Vitest для unit-тестов движка расчёта

## Источник данных (важно)

- Операционные данные payroll (часы, прогоны, карточки `Person` в бухучёте) хранятся в SQLite этого приложения: `DATABASE_URL` → по умолчанию `file:./prisma/dev.db`.
- **Кто такие «люди» в списке:** при открытии «Люди» и «Часы» модуль **подтягивает кадры из основного EDUMED** — файл **`apps/api/data/users.json`** (поле `id` → `Person.systemUserId`, `username` → `systemUsername`). Роли: директор, завуч, учитель, sysadmin и пользователи с доп. ролью `teacher`. Путь можно задать в **`EDUMED_USERS_JSON_PATH`**.
- Справочники расчёта: **`npm run db:seed`** — PK/категории/МРОТ и т.д., без вымышленных сотрудников и без «Марта 2026».
- Локальный **полный демо-набор** (отдельные тестовые ФИО, часы, прогон) — только **`npm run db:seed:demo`**. Для работы с реальными учётками школы используйте `db:seed`, затем откройте «Люди» (синхронизация создаст карточки).

## Запуск

```bash
cd apps/payroll
npm install
npx prisma generate
npx prisma migrate dev
npm run db:seed
npm run dev
```

Откройте dev-сервер (порт см. в `package.json`, по умолчанию для модуля в монорепо часто проксируется как `:3002`).

Переменная `DATABASE_URL` в `.env` по умолчанию: `file:./prisma/dev.db`.

## Скрипты

| Команда | Назначение |
|--------|------------|
| `npm run dev` | Разработка |
| `npm run build` / `npm start` | Продакшен |
| `npm test` | Unit-тесты (без `*.int.test.ts`) |
| `npm run test:integration` | Интеграционные тесты (нужен демо-сид, см. ниже) |
| `npm run db:seed` | Справочники + пустые операционные таблицы (рекомендуется для «честного» пустого UI) |
| `npm run db:seed:demo` | Старый полный демо-набор (люди, март 2026, часы, прогон) |
| `npm run db:migrate` | Миграции Prisma |
| `npm run db:generate` | Сгенерировать клиент Prisma |

Интеграционный тест `payroll-run-service.int.test.ts` ожидает данные после **`db:seed:demo`**. Запуск: `npm run db:seed:demo && npm run test:integration`.

## Структура домена

- `src/modules/branch-engine.ts` — правила веток кандидата из справочника `CandidateBranchRule`
- `src/modules/pk-engine.ts` — рекомендация PK по коридору и PR/OP
- `src/modules/payroll-engine.ts` — чистые функции строк расчёта (fix/flex, замены, МРОТ)
- `src/modules/mrot-engine.ts` — сумма к МРОТ и доведение
- `src/modules/order-draft-engine.ts` — текст проекта приказа
- `src/modules/audit-service.ts` — запись в `AuditLog`
- `src/lib/payroll-run-service.ts` — загрузка данных из БД и сохранение `PayrollLine`

## Важно

- Клиент Prisma требует адаптер SQLite (`src/lib/db.ts`, `prisma/seed.ts`).
- После изменения схемы: `npx prisma migrate dev`, затем `npm run db:seed` (или `db:seed:demo` при необходимости демо).
