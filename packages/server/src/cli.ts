import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { eq } from 'drizzle-orm';
import { hashPassword } from './auth/password';
import { loadConfig } from './config';
import { openDatabase } from './db';
import { users } from './db/schema';

const USAGE = `Использование:
  cli user:create-superuser <логин> [--name <имя>]
  cli dev:seed                      учётные записи admin и org для разработки

Пароль суперюзера берётся из VOLAN_PASSWORD, иначе спрашивается в терминале.
Пароль dev:seed — из VOLAN_DEV_PASSWORD, иначе значение по умолчанию из cli.ts.`;

// Пароль без эха в терминале
function promptHidden(question: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const { stdin, stdout } = process;
		if (!stdin.isTTY) return reject(new Error('Нет терминала: задайте пароль в VOLAN_PASSWORD'));
		stdout.write(question);
		stdin.setRawMode(true);
		stdin.resume();
		stdin.setEncoding('utf8');
		let value = '';
		const onData = (char: string) => {
			if (char === '\r' || char === '\n') {
				stdin.setRawMode(false);
				stdin.pause();
				stdin.off('data', onData);
				stdout.write('\n');
				resolve(value);
			} else if (char === '\u0003') {
				process.exit(130);
			} else if (char === '\u007f' || char === '\b') {
				value = value.slice(0, -1);
			} else {
				value += char;
			}
		};
		stdin.on('data', onData);
	});
}

async function createSuperuser(login: string, displayName: string): Promise<void> {
	let password = process.env.VOLAN_PASSWORD;
	if (!password) {
		password = await promptHidden('Пароль: ');
		if (password !== (await promptHidden('Ещё раз: '))) throw new Error('Пароли не совпадают');
	}
	if (password.length < 8) throw new Error('Пароль — не короче 8 символов');

	const config = loadConfig();
	const { db, close } = openDatabase(
		config.databasePath,
		fileURLToPath(new URL('../drizzle', import.meta.url))
	);
	try {
		if (db.select().from(users).where(eq(users.login, login)).get()) {
			throw new Error(`Логин ${login} уже занят`);
		}
		db.insert(users)
			.values({
				id: randomUUID(),
				login,
				displayName,
				passwordHash: await hashPassword(password, config.scrypt),
				role: 'superuser',
				isActive: true,
				createdAt: new Date()
			})
			.run();
		console.log(`Суперюзер ${login} создан`);
	} finally {
		close();
	}
}

// Пароль учётных записей для разработки, если не задан VOLAN_DEV_PASSWORD.
// Только для локальной базы: в рабочем режиме команда отказывается работать.
const DEV_PASSWORD = 'volan-dev-pass';

async function devSeed(): Promise<void> {
	if (process.env.NODE_ENV === 'production') throw new Error('dev:seed — только для разработки');
	const password = process.env.VOLAN_DEV_PASSWORD ?? DEV_PASSWORD;
	const config = loadConfig();
	const { db, close } = openDatabase(
		config.databasePath,
		fileURLToPath(new URL('../drizzle', import.meta.url))
	);
	try {
		const accounts = [
			{ login: 'admin', displayName: 'Администратор', role: 'superuser' as const },
			{ login: 'org', displayName: 'Организатор', role: 'organizer' as const }
		];
		for (const account of accounts) {
			if (db.select().from(users).where(eq(users.login, account.login)).get()) continue;
			db.insert(users)
				.values({
					...account,
					id: randomUUID(),
					passwordHash: await hashPassword(password, config.scrypt),
					isActive: true,
					createdAt: new Date()
				})
				.run();
			console.log(`Создан ${account.login} (${account.role})`);
		}
	} finally {
		close();
	}
}

const { positionals, values } = parseArgs({
	allowPositionals: true,
	options: { name: { type: 'string' } }
});
const [command, login] = positionals;

try {
	if (command === 'user:create-superuser' && login) {
		await createSuperuser(login, values.name ?? login);
	} else if (command === 'dev:seed') {
		await devSeed();
	} else {
		console.log(USAGE);
		process.exitCode = 1;
	}
} catch (error) {
	console.error((error as Error).message);
	process.exitCode = 1;
}
