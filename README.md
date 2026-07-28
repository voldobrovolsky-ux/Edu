# EDUMED v1.0.0

Цифровая экосистема управления учебным процессом (передача по Договору,
Технический стандарт версии v1.0.0). Состав поставки соответствует границам
версии v1.0.0 (раздел 2.2 Технического стандарта).

## Структура (модульный монорепо)

```
docs/            — архитектура, ADR, деплой, онбординг
apps/api/        — backend: Node.js (NestJS) + Prisma + PostgreSQL
apps/web/        — frontend: SPA (React + TypeScript + Vite)
packages/shared/ — общие TS-контракты фронт↔бэк
docker-compose.yml
```

## Основные модули

| Модуль (договор) | Код |
|---|---|
| Электронный журнал | `apps/api/src/modules/journal`, `engine/journal.service`, `apps/web/src/sections/journal` |
| Расписание | `apps/web/src/app/screens/ScheduleScreen`, `apps/api/src/modules/engine` |
| Управление пользователями | `apps/api/src/modules/structure`, `modules/teacher`, `parameters/contingent` |
| Документы | `apps/api/src/modules/doc`, `modules/materials`, `apps/web/src/sections/materials` |
| Методическое пространство | `apps/api/src/modules/standards`, `modules/planning`, `modules/cabinets` |
| Аналитика | `apps/api/src/modules/reports`, `engine/analytics.service` |
| Коммуникации (Communitoria) | `apps/api/src/modules/comm` |
| Персонализация | `apps/web/src/app/screens/Personalize.tsx` |
| Профиль пользователя | `apps/web/src/cabinets/CurrentUser.tsx` |
| Аутентификация / роли | `apps/api/src/common/auth`, `common/authz`, `modules/pilot` (пилотный QR-вход) |

## Документы
- [Архитектура](docs/ARCHITECTURE.md) — модульность, как добавить раздел.
- [Деплой](docs/DEPLOY.md) — развёртывание на VPS.
- [Онбординг](docs/ONBOARDING.md), [Пилотный вход](docs/PILOT.md).
- [ADR](docs/adr/) — ключевые архитектурные решения.

## Быстрый старт (dev)

```bash
# всё разом
docker compose up

# или по отдельности
cd apps/api && npm install && npx prisma migrate dev && npm run seed && npm run start:dev
cd apps/web && npm install && npm run dev
```

- web: http://localhost:5173
- api: http://localhost:3000/api

## Технологический стек
- Frontend: SPA на React/TypeScript (сборка Vite), тестовая среда `localhost:5173`.
- Backend: Node.js (NestJS), модульный монолит.
- БД: PostgreSQL; схема и миграции — Prisma (`apps/api/prisma`).
