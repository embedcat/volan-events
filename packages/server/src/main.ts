import { fileURLToPath } from 'node:url';
import { buildApp } from './app';
import { loadConfig } from './config';
import { openDatabase } from './db';
import { EventHub } from './hub';

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '127.0.0.1';

const config = loadConfig();
// Папка миграций — рядом с пакетом: и src/main.ts, и dist/main.js лежат на уровень ниже
const migrations = fileURLToPath(new URL('../drizzle', import.meta.url));
const { db, close } = openDatabase(config.databasePath, migrations);

const app = buildApp({ db, hub: new EventHub(), config }, { logger: true });
await app.listen({ port, host });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
	process.once(signal, async () => {
		await app.close();
		close();
		process.exit(0);
	});
}
