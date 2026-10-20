# volan-events

Сервис для проведения бадминтонных турниров: категории, круговые группы, корты и очередь,
ввод счёта, таблица мест, работа без интернета. Подробности — в [docs/](docs/README.md).

## Запуск

Нужны Node 24 и pnpm (через corepack: `corepack enable pnpm`).

```sh
pnpm install
pnpm dev
```

Интерфейс — http://localhost:5173, API — http://localhost:3000/api.

Учётные записи для разработки (`admin` — суперюзер, `org` — организатор) в локальной базе:

```sh
pnpm --filter @volan/server cli dev:seed
```

Пароль по умолчанию — в `packages/server/src/cli.ts`, свой можно задать в `VOLAN_DEV_PASSWORD`.

Проверки перед коммитом — `pnpm check`.
