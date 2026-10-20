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
- `packages/server` — Fastify, SQLite через Drizzle (better-sqlite3). Разработка — `tsx watch`,
  сборка — esbuild в `dist/main.js` и `dist/cli.js`: пакеты `@volan/*` встраиваются,
  остальные зависимости внешние. Схема базы — `src/db/schema.ts`; после её изменения
  сгенерировать миграцию (`db:generate`), файлы в `drizzle/` коммитятся и применяются при
  старте. База по умолчанию — `packages/server/data/volan.sqlite` (`DATABASE_PATH`).
  Порт и адрес — `API_PORT` / `API_HOST` (не `PORT`: его выставляют разные инструменты).
  Тесты — с базой в памяти через `src/test-app.ts`.
- `packages/web` — SvelteKit 3 в режиме SPA (adapter-static, `ssr = false`).
  В разработке `/api` проксируется на `127.0.0.1:3000`.
  - Импорты из `src/lib` — через поле `imports` package.json и с расширением `.js`:
    `#lib/api.js`, `#lib/session.svelte.js`, `#lib/ui/EventList.svelte`.
  - Ссылки и `goto` — через `resolve('/e/[id]', { id })` из `$app/paths`: маршрут
    проверяется типами.
  - Все команды идут через `outbox` (`#lib/outbox.svelte.js`), конверт собирает
    `#lib/commands.js`. Тексты ошибок domain и сервера — `#lib/messages.js`.
  - Событие на странице — `EventStore` (`openEvent(id)`, `#lib/event-store.svelte.js`):
    `store.view` — что показывать, `store.run(draft, 'текст')` — команда с проверкой
    правилами и плашкой «Отменить». Справочник — `registry` (`#lib/registry.svelte.js`).
  - В компонентах не называть переменную `state`: она затеняет руну `$state`
    (принято имя `ev` для состояния события).
  - Меню «⋯» — `#lib/ui/Menu.svelte` (popover), пункты — кнопки с классом `menu-item`.
    Окна — `<dialog>` с `showModal()`, как `#lib/ui/ResultDialog.svelte`.
  - Текущее время для «14 мин» — `clock.now` (`#lib/clock.svelte.js`), не `Date.now()`:
    так экран обновляется сам.
  - Логика без интерфейса (`event-view.ts`, `score-entry.ts` и т. п.) — отдельными
    модулями с тестами рядом.
  - Стили: токены и общие классы в `src/app.css`, без UI-библиотек.
  - Настройки Vitest — в `vitest.config.ts`, отдельно от `vite.config.ts`.
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

Сервер: `pnpm --filter @volan/server db:generate -- --name <имя>` — миграция из схемы;
`pnpm --filter @volan/server cli user:create-superuser <логин>` — суперюзер;
`pnpm --filter @volan/server cli dev:seed` — учётные записи `admin` и `org` для разработки
(пароль — в `packages/server/src/cli.ts` или `VOLAN_DEV_PASSWORD`).

Просмотр в браузерной панели Claude — `.claude/launch.json`: `volan-dev` запускает
`pnpm dev` сам; если Vite под ним не стартует (так бывает на Windows), запустить `pnpm dev`
отдельно и подключиться через `volan-attach`. Если страница в разработке вдруг пустая, а файл
в порядке, — Vite мог закэшировать его пустым (файл перезаписан командой из shell):
поможет `touch` этого файла.

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
