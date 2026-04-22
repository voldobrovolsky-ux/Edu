# edumed-v0.1

Monorepo школьной экосистемы **EDUMED** (v0.1).

## Документация (источник правды)

| Файл | Назначение |
|------|------------|
| [docs/EDUMED-MANIFESTO-v0.1.md](./docs/EDUMED-MANIFESTO-v0.1.md) | Принципы: роли, кабинеты, панельная вилка, данные, инкремент, ИИ |
| [docs/EDUMED-GENERAL-DESCRIPTION-v0.1.md](./docs/EDUMED-GENERAL-DESCRIPTION-v0.1.md) | Функциональность: стек, кабинеты, журнал, дневник, расписание и др. |
| [docs/EDUMED-RIVI-FUNCTIONAL-SPEC-v0.1.md](./docs/EDUMED-RIVI-FUNCTIONAL-SPEC-v0.1.md) | Полное функциональное и UX-ТЗ по модулю Rivi |
| [docs/EDUMED-RIVI-DELIVERY-CHECKLIST-v0.1.md](./docs/EDUMED-RIVI-DELIVERY-CHECKLIST-v0.1.md) | Этапность реализации Rivi: MVP, V1, V2 |
| [docs/EDUMED-RIVI-UAT-CHECKLIST-v0.1.md](./docs/EDUMED-RIVI-UAT-CHECKLIST-v0.1.md) | QA/UAT-чек-лист для проверки Rivi |
| [docs/EDUMED-RIVI-ONE-PAGER-v0.1.md](./docs/EDUMED-RIVI-ONE-PAGER-v0.1.md) | Краткая одностраничная версия Rivi для согласования |
| [docs/EDUMED-RIVI-BACKLOG-v0.1.md](./docs/EDUMED-RIVI-BACKLOG-v0.1.md) | Бэклог Rivi в формате epics, features, tasks |

## Структура

```
apps/web   — React + TypeScript + Vite + Tailwind
apps/api   — Node + TypeScript + Express
docs/      — манифест и общее описание
```

## Команды

Из корня (нужен Node.js ≥ 20, `npm install` в корне):

```bash
npm install
npm run dev        # web + api
npm run dev:web
npm run dev:api
npm run build
```
"# edumed-v0.1" 
