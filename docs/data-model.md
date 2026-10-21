# Модель данных

Данные делятся на две части:

- **общие** — пользователи, сессии, справочник игроков, список событий;
- **внутренность события** — один документ `EventState`, который меняется только командами
  (см. [commands.md](commands.md)).

Таблица мест, продолжительность матчей, время отдыха игроков и подсказка матча на корт
нигде не хранятся — их вычисляет `domain` из `EventState`.

## Сервер: таблицы SQLite

### `users`

| Поле | Тип | Примечание |
|---|---|---|
| `id` | uuid | |
| `login` | text, unique | |
| `password_hash` | text | scrypt (node:crypto): соль + параметры + хеш |
| `display_name` | text | |
| `role` | `superuser` \| `organizer` | |
| `is_active` | bool | неактивный не может войти, его сессии отозваны |
| `created_at` | timestamp | |

Суперюзер создаётся только консольной командой. Организаторов заводит суперюзер.

### `sessions`

| Поле | Тип | Примечание |
|---|---|---|
| `id` | text | SHA-256 от токена; сам токен — только в cookie |
| `user_id` | uuid | |
| `device_id` | uuid | ID установки приложения в браузере |
| `device_label` | text | «Chrome, Android» — для списка устройств |
| `created_at`, `last_seen_at` | timestamp | |
| `expires_at` | timestamp | 30 дней от последнего обращения |
| `revoked_at` | timestamp? | выход, отзыв пользователем или суперюзером |

Cookie: httpOnly, Secure, SameSite=Lax.

### `players` — справочник

| Поле | Тип | Видно гостям |
|---|---|---|
| `id` | uuidv7 | |
| `last_name`, `first_name` | text | да |
| `gender` | `M` \| `F` | да |
| `club` | text? | да (клуб или город) |
| `rating` | int? | да |
| `birth_year` | int? | нет |
| `contact` | text? | нет |
| `external_id` | text? | нет |
| `merged_into_id` | uuid? | — объединённая запись указывает на основную |
| `created_by` | uuid | автор: он и суперюзер могут править и видят закрытые поля |
| `created_at`, `updated_at` | timestamp | |
| `revision` | int | сквозной номер изменения справочника; клиент забирает всё новее своей ревизии |
| `deleted` | bool | удалённые остаются меткой, чтобы удаление дошло до других устройств |

Закрытые поля (год рождения, контакт, внешний ID) видят только автор записи и суперюзер.

Объединение не переписывает события: ссылки на объединённую запись при чтении
разворачиваются в основную.

Удалить игрока, заявленного хоть в одном событии, нельзя — только объединить.

### `events` — список событий и снимки

| Поле | Тип | Примечание |
|---|---|---|
| `id` | uuidv7 | генерирует клиент |
| `owner_id` | uuid | |
| `title`, `date`, `visibility`, `progress` | | копия из `state` для списков и фильтров |
| `version` | int | номер последней применённой команды |
| `state` | JSON | `EventState` целиком |
| `created_at`, `updated_at` | timestamp | |

### `commands` — журнал

| Поле | Тип | Примечание |
|---|---|---|
| `id` | uuidv7, unique | ID команды; повторная отправка распознаётся |
| `scope` | `event` \| `registry` | |
| `event_id` | uuid? | |
| `seq` | int? | порядковый номер в событии (= `events.version` после применения) |
| `type`, `payload` | text, JSON | |
| `schema_version` | int | |
| `user_id`, `device_id` | uuid | |
| `base_version` | int? | версия события, на которой клиент сформировал команду |
| `issued_at` | timestamp | часы устройства |
| `received_at` | timestamp | часы сервера |

### `rejected_commands` — отклонённые

Те же поля, что у `commands`, плюс `reason` (код и параметры ошибки domain), `resolved_at`,
`resolution` (`discarded` | `reapplied`). Видны владельцу со всех его устройств,
пока он их не разберёт.

### Позже

Таблицы-выборки для статистики между событиями (продолжительность матчей, история игрока)
заполняются сервером при применении команд. В MVP их нет.

## `EventState`

Один и тот же тип в `domain`, на сервере и в браузере. Источник истины — схемы Zod
в `packages/domain/src/state.ts`, типы выводятся из них; ниже — упрощённый пересказ.

- ID этапа и группы выводятся из ID категории: `<categoryId>/groups`, `<categoryId>/A`.
- ID матчей, созданных командой, — `<ID команды>:<n>`.
- Номер нового матча — наименьший свободный; у существующих матчей номер не меняется.

```ts
type EventState = {
  stateVersion: 1;                 // версия формы документа, для миграций
  id: EventId;
  ownerId: UserId;
  title: string;
  date: string;                    // YYYY-MM-DD
  venue: string | null;
  visibility: 'draft' | 'published';
  progress: 'setup' | 'running' | 'finished';
  courts: Court[];
  defaultFormat: MatchFormat;
  categories: Record<CategoryId, Category>;
  entries: Record<EntryId, Entry>;
  stages: Record<StageId, Stage>;
  groups: Record<GroupId, Group>;
  matches: Record<MatchId, Match>;
  queue: MatchId[];                // общая очередь события
};

type Court = { number: number; enabled: boolean };   // 1..N

type MatchFormat = {
  points: 21 | 15;                 // 21: предел 30; 15: предел 21; разница 2
  bestOf: 1 | 3;
  deciderPoints: 21 | 15;          // решающая партия при bestOf = 3
};

type Discipline = 'MS' | 'WS' | 'MD' | 'WD' | 'XD' | 'OS' | 'OD';

type Category = {
  id: CategoryId;
  discipline: Discipline;
  level: string | null;            // A, B+, B+C, 3 …
  customName: string | null;       // иначе имя = discipline + level
  ratingMin: number | null;        // выход за диапазон — только предупреждение
  ratingMax: number | null;
  stageIds: StageId[];
};

type Entry = {
  id: EntryId;
  categoryId: CategoryId;
  players: EntryPlayer[];          // 1 или 2, по разряду
  status: 'active' | 'withdrawn';
};

type EntryPlayer = {
  playerId: PlayerId;
  gender: 'M' | 'F';               // снимок — для проверки состава
  rating: number | null;           // снимок на момент события
  club: string | null;             // снимок на момент события
};

type Stage = {
  id: StageId;
  categoryId: CategoryId;
  kind: 'groups' | 'bracket';      // bracket — этап 2
  format: MatchFormat;
};

type Group = {
  id: GroupId;
  stageId: StageId;
  name: string;                    // A, B, …
  entryIds: EntryId[];             // после составления расписания — порядок посева
  scheduleSeed: number | null;     // зерно жеребьёвки для пересборки; null — расписания нет
  lots: EntryId[][];               // ручная расстановка при жребии, каждая — упорядоченный набор
};

type Match = {
  id: MatchId;
  number: number;                  // №, который видит человек
  stageId: StageId;
  groupId: GroupId | null;
  round: number;                   // тур
  sideA: EntryId;
  sideB: EntryId;
  status: 'pending' | 'on_court' | 'finished';
  court: number | null;
  calledAt: string | null;         // время устройства
  finishedAt: string | null;
  lineupA: PlayerId[] | null;      // кто реально играл — при вводе результата; у неявки null
  lineupB: PlayerId[] | null;
  result: MatchResult | null;
};

type MatchResult = {
  kind: 'played' | 'walkover' | 'retired';
  winner: 'A' | 'B';
  games: [number, number][];       // played — все партии; retired — счёт до отказа; walkover — []
  nonStandard: boolean;            // сохранён в обход проверки счёта
  byWithdrawal: boolean;           // неявка из-за снятия участника
};
```

### Что вычисляется, а не хранится

- **Таблица мест группы**. Неявка, отказ и неявка из-за снятия считаются как сухая победа:
  2:0 (1:0) по партиям и `points`:0 в каждой.
- **Продолжительность** = `finishedAt − calledAt`.
- **Отдых игрока** = сейчас − `finishedAt` его последнего сыгранного матча.
- **Подсказка на корт** — первый матч `queue`, в котором ни один игрок не на корте.

## Выгрузка события (JSON)

Кнопка у владельца в «Настройках»; файл собирается в браузере из подтверждённого сервером
состояния и журнала (D147). Имя файла — «<дата> <название>.json».

```ts
type EventExport = {
  format: 'volan-event';
  formatVersion: 1;
  exportedAt: string;                      // ISO, часы устройства
  stateVersion: number;                    // EventState.stateVersion
  version: number;                         // версия события = seq последней команды
  event: EventState;
  players: PublicPlayer[];                 // игроки заявок и фактических составов, без закрытых полей
  commands: { seq: number; command: EventCommand }[];  // весь журнал по порядку
};
```

## Браузер: IndexedDB (Dexie)

База `volan` (`packages/web/src/lib/local-db.ts`):

| Таблица | Содержимое |
|---|---|
| `events` | `{ id, confirmed: EventState, version, names }` — последнее подтверждённое сервером |
| `outbox` | команды, ещё не принятые сервером, по порядку (`seq`) |
| `players` | копия справочника (свои записи — с закрытыми полями) |
| `meta` | `deviceId`, `user` (последний вошедший), `registryRevision`, `myEvents` (список «Мои события»), `rejected` (копия списка конфликтов) |

На экране — `confirmed` с применёнными поверх командами из `outbox`. Когда приходят чужие
команды, `confirmed` продвигается, а `outbox` применяется к нему заново.

## Версии и миграции

- `EventState.stateVersion` — при изменении формы документа сервер и клиент мигрируют
  снимок при загрузке.
- `Command.schemaVersion` — команды меняются только с обратной совместимостью;
  старые версии приводятся к новой на сервере.
- Слишком старый клиент получает отказ с требованием обновиться. `outbox` при обновлении
  приложения сохраняется и отправляется после него.
