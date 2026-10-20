// Приложение для тестов: база в памяти, быстрые параметры scrypt, вход под пользователем
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { EventCommandDraft, PlayerCommandDraft } from '@volan/domain';
import { buildApp } from './app';
import { hashPassword } from './auth/password';
import type { Config } from './config';
import { openDatabase } from './db';
import { users } from './db/schema';
import { EventHub } from './hub';

export const TEST_CONFIG: Config = {
	databasePath: ':memory:',
	cookieSecure: false,
	sessionTtlDays: 30,
	scrypt: { N: 1024, r: 8, p: 1 }
};

export async function createTestApp() {
	const migrations = fileURLToPath(new URL('../drizzle', import.meta.url));
	const { db, close } = openDatabase(':memory:', migrations);
	const hub = new EventHub();
	const app = buildApp({ db, hub, config: TEST_CONFIG });
	await app.ready();

	async function createUser(login: string, role: 'superuser' | 'organizer' = 'organizer') {
		const id = randomUUID();
		db.insert(users)
			.values({
				id,
				login,
				displayName: login,
				passwordHash: await hashPassword(`${login}-password`, TEST_CONFIG.scrypt),
				role,
				isActive: true,
				createdAt: new Date()
			})
			.run();
		return id;
	}

	// Вход: возвращает заголовок cookie для следующих запросов
	async function login(loginName: string, password = `${loginName}-password`): Promise<string> {
		const response = await app.inject({
			method: 'POST',
			url: '/api/auth/login',
			payload: { login: loginName, password, deviceId: `dev-${loginName}` }
		});
		if (response.statusCode !== 200) throw new Error(`login ${loginName}: ${response.body}`);
		const cookie = response.cookies.find((c) => c.name === 'volan_session');
		if (!cookie) throw new Error('нет cookie');
		return `volan_session=${cookie.value}`;
	}

	// Пользователь с сессией одной строкой
	async function userWithSession(loginName: string, role: 'superuser' | 'organizer' = 'organizer') {
		const id = await createUser(loginName, role);
		return { id, cookie: await login(loginName) };
	}

	return { app, db, hub, close, createUser, login, userWithSession };
}

let counter = 0;

export function eventCommand(eventId: string, draft: EventCommandDraft, baseVersion?: number) {
	counter += 1;
	return {
		...draft,
		id: `cmd-${counter}`,
		scope: 'event' as const,
		eventId,
		issuedAt: new Date(Date.UTC(2026, 9, 26, 10, counter % 60)).toISOString(),
		deviceId: 'test-device',
		schemaVersion: 1 as const,
		...(baseVersion === undefined ? {} : { baseVersion })
	};
}

export function playerCommand(draft: PlayerCommandDraft) {
	counter += 1;
	return {
		...draft,
		id: `pcmd-${counter}`,
		scope: 'registry' as const,
		issuedAt: new Date(Date.UTC(2026, 9, 26, 10, counter % 60)).toISOString(),
		deviceId: 'test-device',
		schemaVersion: 1 as const
	};
}

export const BO1 = { points: 21, bestOf: 1, deciderPoints: 21 } as const;

export function createEventDraft(ownerId: string, title = 'Турнир'): EventCommandDraft {
	return {
		type: 'event.create',
		payload: { title, date: '2026-10-26', venue: 'Зал', courts: 2, defaultFormat: BO1, ownerId }
	};
}
