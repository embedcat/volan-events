import type { EventState } from '@volan/domain';
import Dexie, { type Table } from 'dexie';
import type { PlayerName } from './names.js';
import type { AnyCommand } from './outbox.svelte.js';
import type { RegistryPlayer } from './registry.svelte.js';

// Данные в браузере для работы без сети (docs/data-model.md, «Браузер: IndexedDB»)

export type StoredEvent = {
	id: string;
	confirmed: EventState; // последнее подтверждённое сервером
	version: number;
	names: Record<string, PlayerName>;
};

export type StoredCommand = { seq?: number; id: string; command: AnyCommand };

type MetaRow = { key: string; value: unknown };

class LocalDb extends Dexie {
	events!: Table<StoredEvent, string>;
	outbox!: Table<StoredCommand, number>; // seq — порядок отправки
	players!: Table<RegistryPlayer, string>;
	meta!: Table<MetaRow, string>;

	constructor() {
		super('volan');
		this.version(1).stores({ events: 'id', outbox: '++seq, &id', players: 'id', meta: 'key' });
	}
}

let db: LocalDb | null = null;

// IndexedDB может быть недоступна (приватный режим, тесты в Node) — тогда работаем без неё
function open(): LocalDb | null {
	if (db) return db;
	if (typeof indexedDB === 'undefined') return null;
	db = new LocalDb();
	return db;
}

async function safely<T>(action: (db: LocalDb) => Promise<T>, fallback: T): Promise<T> {
	const handle = open();
	if (!handle) return fallback;
	try {
		return await action(handle);
	} catch (error) {
		console.warn('IndexedDB:', error);
		return fallback;
	}
}

export const localDb = {
	getMeta: <T>(key: string) =>
		safely(async (d) => (await d.meta.get(key))?.value as T | undefined, undefined),
	setMeta: (key: string, value: unknown) =>
		safely((d) => d.meta.put({ key, value }).then(() => undefined), undefined),

	loadOutbox: () =>
		safely(async (d) => (await d.outbox.orderBy('seq').toArray()).map((r) => r.command), []),
	addCommand: (command: AnyCommand) =>
		safely((d) => d.outbox.add({ id: command.id, command }).then(() => undefined), undefined),
	removeCommands: (ids: string[]) =>
		safely(
			(d) =>
				d.outbox
					.where('id')
					.anyOf(ids)
					.delete()
					.then(() => undefined),
			undefined
		),

	getEvent: (id: string) => safely((d) => d.events.get(id), undefined),
	putEvent: (event: StoredEvent) =>
		safely((d) => d.events.put(plain(event)).then(() => undefined), undefined),
	deleteEvent: (id: string) => safely((d) => d.events.delete(id), undefined),

	loadPlayers: () => safely((d) => d.players.toArray(), []),
	savePlayers: (upsert: RegistryPlayer[], deleted: string[]) =>
		safely(
			(d) =>
				d.transaction('rw', d.players, async () => {
					if (deleted.length > 0) await d.players.bulkDelete(deleted);
					if (upsert.length > 0) await d.players.bulkPut(upsert.map(plain));
				}),
			undefined
		),
	clearPlayers: () => safely((d) => d.players.clear(), undefined),

	// Другой пользователь на этом устройстве: чужие данные не оставляем (ID устройства — остаётся)
	clearUserData: () =>
		safely(
			(d) =>
				d.transaction('rw', [d.events, d.outbox, d.players, d.meta], async () => {
					await Promise.all([d.events.clear(), d.outbox.clear(), d.players.clear()]);
					await d.meta.where('key').noneOf(['deviceId']).delete();
				}),
			undefined
		),

	// Попросить браузер не удалять данные при нехватке места (Safari на iPhone — см. architecture.md)
	persist: async () => {
		try {
			if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
				await navigator.storage.persist();
			}
		} catch {
			// не поддерживается — ничего не теряем
		}
	}
};

// Состояние Svelte ($state) — прокси; в IndexedDB кладём обычную копию
function plain<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}
