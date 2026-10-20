# Команды

Всё, что меняет событие или справочник игроков, — команда. Пользователи, сессии
и удаление событий — обычные запросы, только при наличии связи.

## Конверт

```ts
type Command = {
  id: string;                      // uuidv7, генерирует клиент
  type: string;                    // 'match.recordResult' …
  scope: 'event' | 'registry';
  eventId?: EventId;
  payload: object;
  baseVersion?: number;            // версия события, на которой команда сформирована
  issuedAt: string;                // часы устройства, ISO
  deviceId: string;
  schemaVersion: 1;
};
```

## Обработка на сервере

Каждая команда — одна транзакция:

1. Проверка прав: действующая сессия; событие — владельца или суперюзера;
   правка игрока — автора или суперюзера.
2. ID уже в журнале → ответ «уже применена», без изменений.
3. `domain.apply(state, command)` → новое состояние или ошибка с кодом.
4. Успех: сохранить снимок, `version + 1`, запись в журнал, разослать по SSE.
5. Ошибка: записать в `rejected_commands`, вернуть причину.

`domain.apply` — чистая функция: всё, что нужно для результата (ID новых сущностей,
зерно жеребьёвки, время, снимки рейтинга, клуба и пола), берётся из команды.

### Конфликты

Команды, которые перезаписывают значение, несут то, что клиент видел до правки:

- `match.recordResult` при правке и `match.clearResult` — поле `expectedResult`;
- `player.update` — `expected` для каждого меняемого поля.

Если на сервере уже другое значение — конфликт. Если ровно то же, что присылает команда, —
команда принимается без изменений (два устройства ввели одинаковый счёт).

Остальные команды конфликтуют, если перестали быть допустимыми: корт уже занят,
матч уже вызван, участник снят и т. п.

## Транспорт

| Запрос | Назначение |
|---|---|
| `POST /api/commands` | пачка команд по порядку; ответ по каждой: применена (`seq`) / уже применена / отклонена (причина) |
| `GET /api/events` | события организатора; для гостей — опубликованные |
| `GET /api/events/:id` | полный `EventState` + `version` (владелец, суперюзер) |
| `GET /api/events/:id/commands?after=N` | команды после версии N |
| `GET /api/events/:id/stream` | SSE: владельцу — команды, гостю — «изменилось» |
| `GET /api/public/events/:id` | публичное представление события (без закрытых полей) |
| `GET /api/players?updatedAfter=…` | синхронизация справочника |
| `GET /api/rejected`, `POST /api/rejected/:id/resolve` | отклонённые команды |
| `POST /api/auth/login`, `POST /api/auth/logout` | вход и выход |
| `GET /api/auth/sessions`, `DELETE /api/auth/sessions/:id` | свои устройства, отзыв |
| `POST /api/users`, `PATCH /api/users/:id` | суперюзер: организаторы, блокировка, сброс пароля |
| `DELETE /api/events/:id` | удаление события |

Консоль сервера: `user:create-superuser`.

## Каталог команд MVP

Обозначения: **Можно** — когда команда допустима; **Делает** — что меняется.

### Событие

**`event.create`** `{ title, date, venue?, courts, defaultFormat }`
— Делает: новое событие, `draft` + `setup`, корты 1..N.

**`event.update`** `{ title?, date?, venue?, defaultFormat? }`

**`event.setVisibility`** `{ visibility }`

**`event.setCourts`** `{ count }`
— Можно: убираемые корты свободны.

**`court.setEnabled`** `{ court, enabled }`
— Можно выключить: на корте нет матча (сначала перенести матч на другой корт).

**`event.start`** — `setup → running`.
— Можно: хотя бы в одной группе есть расписание.

**`event.finish`** — `running → finished`.
— Можно: ни один матч не на корте. Несыгранные матчи остаются несыгранными.

**`event.reopen`** — `finished → running`, чтобы исправить итоги.

Удаление события — запрос `DELETE`, не команда: владелец — пока нет ни одного сыгранного
матча, суперюзер — всегда.

### Категории

**`category.create`** `{ id, discipline, level?, customName?, ratingMin?, ratingMax?, format? }`
— Делает: категорию, групповой этап и группу A (в MVP одна группа).

**`category.update`** `{ categoryId, … }`
— Разряд меняется, только пока нет участников. Формат этапа — пока нет сыгранных матчей.

**`category.delete`** `{ categoryId }`
— Можно: в категории нет сыгранных матчей.

### Участники

**`entry.add`** `{ id, categoryId, players: EntryPlayer[] }`
— Можно: состав подходит к разряду (число игроков, пол), игроки ещё не заявлены
в эту категорию.
— Делает: если расписание группы есть и ни один её матч не вызван — расписание пересобирается;
если вызван — матчи нового участника со всеми активными дописываются в конец очереди.
— Рейтинг вне диапазона категории — предупреждение на клиенте, не ошибка.

**`entry.update`** `{ entryId, players?, … }`
— Замена партнёра в любой момент; сыгранные матчи хранят фактический состав
в `lineupA/lineupB`.

**`entry.remove`** `{ entryId }`
— Можно: у участника нет сыгранных матчей. Делает: убирает его матчи; если ни один матч
группы не вызван — расписание пересобирается.

**`entry.withdraw`** `{ entryId }`
— Можно: участник сейчас не на корте (сначала ввести отказ).
— Делает: несыгранные матчи → неявка в пользу соперника (`byWithdrawal`), убираются из очереди.

**`entry.reinstate`** `{ entryId }`
— Отмена снятия: неявки `byWithdrawal` удаляются, матчи возвращаются в конец очереди.

### Группа

**`group.generateSchedule`** `{ groupId }`
— Можно: в группе не меньше 2 участников, ни один матч группы не вызван.
— Делает: круговое расписание по турам; ID матчей выводятся из ID команды; номера по порядку;
матчи встают в очередь по турам. Повторный вызов пересобирает расписание.

**`group.resolveTie`** `{ groupId, entryIds }`
— Можно: эти участники сейчас равны по всем показателям. Делает: фиксирует порядок по жребию.

Жеребьёвка по группам (`stage.draw`, `group.moveEntry`) — этап 2.

### Очередь и корты

**`queue.move`** `{ matchId, toIndex }`

**`match.call`** `{ matchId, court }`
— Можно: событие `running`, матч в очереди, корт включён и свободен, ни один игрок матча
не на другом корте.
— Делает: `on_court`, `calledAt = issuedAt`, матч уходит из очереди.

**`match.uncall`** `{ matchId }` — матч возвращается в начало очереди.

**`match.moveCourt`** `{ matchId, court }` — корт включён и свободен.

**`match.recordResult`** `{ matchId, result, expectedResult }`
— Проверка: счёт соответствует формату этапа, либо `nonStandard = true`.
— Матч на корте → `finished`, `finishedAt = issuedAt`, корт свободен.
— Матч в очереди (например, неявка) → `finished` без продолжительности, уходит из очереди.
— Матч уже сыгран → правка; нужен совпадающий `expectedResult`.
— Фиксирует `lineupA/lineupB` из текущего состава участников.
— Событие `finished` → нельзя (сначала `event.reopen`).

**`match.clearResult`** `{ matchId, expectedResult }`
— Ошибочный ввод: матч возвращается в начало очереди. Неявки из-за снятия так не убираются —
только `entry.reinstate`.

### Справочник игроков

**`player.create`** `{ id, lastName, firstName, gender, club?, rating?, birthYear?, contact?, externalId? }`
— Можно и без интернета. Автор — создавший.

**`player.update`** `{ playerId, changes, expected }` — автор или суперюзер.

**`player.delete`** `{ playerId }` — автор или суперюзер; только если игрок нигде не заявлен.

**`player.merge`** `{ sourceId, targetId }`
— Суперюзер или автор обеих записей. `sourceId` получает `merged_into_id = targetId`.

**`player.unmerge`** `{ sourceId }` — отмена объединения.

## Отмена

Подтверждений в интерфейсе нет (кроме удаления события): после действия на несколько
секунд показывается «[Отменить]». Отмена — это новая обратная команда, а не откат журнала.
`domain` для каждой команды умеет построить обратную по состоянию до неё:
`invert(stateBefore, command) → Command[]`.

| Команда | Обратная |
|---|---|
| `match.call` | `match.uncall` |
| `match.uncall` | `match.call` на тот же корт (если свободен) |
| `match.moveCourt` | `match.moveCourt` на прежний корт |
| `match.recordResult` — первый ввод | `match.clearResult` |
| `match.recordResult` — правка | `match.recordResult` с прежним результатом |
| `match.clearResult` | `match.recordResult` с прежним результатом |
| `queue.move` | `queue.move` на прежнее место |
| `court.setEnabled` | `court.setEnabled` с прежним значением |
| `event.start` | `event.backToSetup` |
| `event.finish` | `event.reopen` |
| `event.reopen` | `event.finish` |
| `event.update`, `event.setVisibility`, `event.setCourts` | та же команда с прежними значениями |
| `category.create` | `category.delete` |
| `category.delete` | `category.restore` с сохранённой категорией и участниками |
| `category.update` | `category.update` с прежними значениями |
| `entry.add` | `entry.remove` |
| `entry.remove` | `entry.add` с тем же ID и составом |
| `entry.update` | `entry.update` с прежним составом |
| `entry.withdraw` | `entry.reinstate` |
| `entry.reinstate` | `entry.withdraw` |
| `group.generateSchedule` | `group.clearSchedule` или пересборка прежнего порядка |
| `group.resolveTie` | `group.resolveTie` с прежней расстановкой (или пустой) |
| `player.create` | `player.delete` |
| `player.update` | `player.update` с прежними значениями |
| `player.merge` | `player.unmerge` |

Дополнительные команды, нужные только для отмены:

- **`event.backToSetup`** — `running → setup`; можно, пока ни один матч не вызван.
- **`group.clearSchedule`** `{ groupId }` — убрать расписание; можно, пока ни один матч
  группы не вызван.
- **`category.restore`** `{ category, stages, groups, entries }` — вернуть удалённую категорию.

Если обратная команда уже недопустима (корт заняли с другого устройства), отмена
не выполняется и показывается причина.
