import type { EventCommand } from '@volan/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './api.js';
import { type AnyCommand, Outbox, type OutboxStorage, type Outcome } from './outbox.svelte.js';

function command(id: string): EventCommand {
	return {
		id,
		type: 'event.start',
		scope: 'event',
		eventId: 'ev',
		payload: {},
		issuedAt: '2026-10-26T10:00:00.000Z',
		deviceId: 'dev',
		schemaVersion: 1
	};
}

const applied = (commands: AnyCommand[]): Outcome[] => commands.map(() => ({ status: 'applied' }));

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('Outbox', () => {
	it('отправляет команду и отдаёт итог; очередь пустеет', async () => {
		const sender = vi.fn(async (commands: AnyCommand[]) => applied(commands));
		const outbox = new Outbox(sender);
		await expect(outbox.enqueue(command('a'))).resolves.toEqual({ status: 'applied' });
		expect(outbox.pending).toEqual([]);
		expect(outbox.status).toBe('idle');
	});

	it('нет связи: команда остаётся, повтор через паузу', async () => {
		let online = false;
		const sender = vi.fn(async (commands: AnyCommand[]) => {
			if (!online) throw new ApiError(0, 'network');
			return applied(commands);
		});
		const outbox = new Outbox(sender);
		const outcome = outbox.enqueue(command('a'));
		await vi.advanceTimersByTimeAsync(0);
		expect(outbox.status).toBe('offline');
		expect(outbox.pending.map((c) => c.id)).toEqual(['a']);

		online = true;
		await vi.advanceTimersByTimeAsync(1000);
		await expect(outcome).resolves.toEqual({ status: 'applied' });
		expect(outbox.pending).toEqual([]);
	});

	it('сессия истекла: стоп до нового входа, затем отправка', async () => {
		let authorized = false;
		const sender = vi.fn(async (commands: AnyCommand[]) => {
			if (!authorized) throw new ApiError(401, 'auth.required');
			return applied(commands);
		});
		const outbox = new Outbox(sender);
		const outcome = outbox.enqueue(command('a'));
		await vi.advanceTimersByTimeAsync(60_000);
		expect(outbox.status).toBe('unauthorized');
		expect(sender).toHaveBeenCalledTimes(1);

		authorized = true;
		outbox.resume();
		await expect(outcome).resolves.toEqual({ status: 'applied' });
	});

	it('команды, добавленные во время отправки, уходят следующей пачкой по порядку', async () => {
		const batches: string[][] = [];
		const sender = vi.fn(async (commands: AnyCommand[]) => {
			batches.push(commands.map((c) => c.id));
			return applied(commands);
		});
		const outbox = new Outbox(sender);
		const first = outbox.enqueue(command('a'));
		const second = outbox.enqueue(command('b'));
		await Promise.all([first, second]);
		expect(batches.flat()).toEqual(['a', 'b']);
	});

	it('подписчики получают итог каждой команды', async () => {
		const outbox = new Outbox(async () => [
			{ status: 'rejected', error: { code: 'event.noSchedule' } }
		]);
		const seen: [string, Outcome][] = [];
		outbox.subscribe((c, o) => seen.push([c.id, o]));
		await outbox.enqueue(command('a'));
		expect(seen).toEqual([['a', { status: 'rejected', error: { code: 'event.noSchedule' } }]]);
	});

	it('очередь переживает перезапуск: сохранённое уходит первым, отправленное стирается', async () => {
		// хранилище, как IndexedDB: команды по порядку добавления
		const saved = new Map<string, AnyCommand>();
		const storage: OutboxStorage = {
			load: async () => [...saved.values()],
			add: async (c) => void saved.set(c.id, c),
			remove: async (ids) => ids.forEach((id) => saved.delete(id))
		};

		// первый запуск: связи нет, команда осталась в хранилище
		const offline = new Outbox(async () => {
			throw new ApiError(0, 'network');
		}, storage);
		void offline.enqueue(command('a'));
		await vi.advanceTimersByTimeAsync(0);
		expect([...saved.keys()]).toEqual(['a']);

		// второй запуск: связь есть
		const batches: string[][] = [];
		const online = new Outbox(async (commands) => {
			batches.push(commands.map((c) => c.id));
			return applied(commands);
		}, storage);
		await online.restore(); // при запуске — до новых команд
		await online.enqueue(command('b'));
		await vi.advanceTimersByTimeAsync(0);
		expect(batches.flat()).toEqual(['a', 'b']);
		expect(saved.size).toBe(0);
	});
});
