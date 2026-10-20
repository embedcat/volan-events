# volan-events

Сервис проведения бадминтонных турниров. Документация — в `docs/`, начинать с `docs/README.md`.

## Правила работы

- `docs/` — источник правды. Перед изменением поведения сверяться с `docs/domain.md`,
  `docs/data-model.md`, `docs/commands.md`, `docs/screens.md`.
- Любое техническое решение (библиотека, структура, формат данных, правило турнира) и любой
  неясный момент предметной области — сначала обсудить с kip. После согласования записать
  в `docs/decisions.md` (следующий номер D…) и в профильный документ.
- Нерешённое — в `docs/open-questions.md`.
- Код и идентификаторы — на английском, комментарии и документация — на русском,
  интерфейс — только на русском.

## Структура

- `packages/domain` — правила турнира. Чистый TypeScript без типов окружения
  (`"types": []`): ни браузера, ни Node. Без побочных эффектов и случайности — ID, зерно
  жеребьёвки и время приходят в команде. Тесты рядом с кодом (`*.test.ts`), пишутся до кода.
- `packages/server` — Fastify, SQLite через Drizzle. Разработка — `tsx watch`, сборка —
  esbuild в `dist/main.js`: пакеты `@volan/*` встраиваются, остальные зависимости внешние.
- `packages/web` — SvelteKit 3 в режиме SPA (adapter-static, `ssr = false`), алиас `#lib`.
  В разработке `/api` проксируется на `127.0.0.1:3000`.
- Пакеты отдают исходники TS (`exports` → `src/index.ts`), отдельной сборки у них нет.

## Команды

| Команда          | Что делает                                        |
| ---------------- | ------------------------------------------------- |
| `pnpm dev`       | сервер (порт 3000) и интерфейс (порт 5173) вместе |
| `pnpm check`     | lint + typecheck + test — то же, что проверяет CI |
| `pnpm lint`      | Prettier в режиме проверки и ESLint               |
| `pnpm format`    | Prettier с исправлением                           |
| `pnpm typecheck` | tsc в domain и server, svelte-check в web         |
| `pnpm test`      | Vitest во всех пакетах                            |
| `pnpm build`     | сборка сервера и интерфейса                       |

## Версии и инструменты

- Node 24 (`.node-version`), pnpm — версия из поля `packageManager`, через corepack.
- TypeScript закреплён на 6.0.x: typescript-eslint, svelte-check и SvelteKit пока
  не поддерживают TypeScript 7. Не обновлять без проверки их совместимости.
- Общие версии — в каталоге `pnpm-workspace.yaml`, в `package.json` пишется `"catalog:"`.
- pnpm не ставит слишком свежие версии пакетов (minimumReleaseAge). Не обходить это
  исключениями — ослаблять диапазон версии.
- Скрипты при установке разрешены только пакетам из `allowBuilds` в `pnpm-workspace.yaml`.
- TypeScript: strict + `noUncheckedIndexedAccess`.
- Стиль: Prettier (табы, одинарные кавычки, ширина 100), ESLint (typescript-eslint,
  eslint-plugin-svelte). Папку `docs/` Prettier не трогает.
