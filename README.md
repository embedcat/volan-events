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

Проверки перед коммитом — `pnpm check`.
