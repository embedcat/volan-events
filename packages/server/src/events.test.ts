import { afterEach, describe, expect, it } from 'vitest';
import { createEventDraft, createTestApp, eventCommand, playerCommand } from './test-app';

let ctx: Awaited<ReturnType<typeof createTestApp>>;
afterEach(() => ctx?.close());

async function send(cookie: string, commands: unknown[]) {
	const response = await ctx.app.inject({
		method: 'POST',
		url: '/api/commands',
		headers: { cookie },
		payload: { commands }
	});
	return response.json();
}

async function get(url: string, cookie?: string) {
	const response = await ctx.app.inject({ method: 'GET', url, headers: cookie ? { cookie } : {} });
	return { status: response.statusCode, body: response.json() };
}

// Событие с одной категорией и двумя игроками из справочника, расписание составлено
async function eventWithPlayers(ownerId: string, cookie: string, eventId = 'ev1') {
	const player = (id: string, lastName: string) =>
		playerCommand({
			type: 'player.create',
			payload: {
				id,
				lastName,
				firstName: 'Тест',
				gender: 'M',
				club: null,
				rating: null,
				birthYear: null,
				contact: 'секрет',
				externalId: null,
				createdBy: ownerId
			}
		});
	const entry = (id: string, playerId: string) =>
		eventCommand(eventId, {
			type: 'entry.add',
			payload: {
				id,
				categoryId: 'cat',
				players: [{ playerId, gender: 'M', rating: null, club: null }]
			}
		});
	await send(cookie, [
		player(`${eventId}-p1`, 'Иванов'),
		player(`${eventId}-p2`, 'Петров'),
		eventCommand(eventId, createEventDraft(ownerId)),
		eventCommand(eventId, {
			type: 'category.create',
			payload: {
				id: 'cat',
				discipline: 'MS',
				level: 'B',
				customName: null,
				ratingMin: null,
				ratingMax: null
			}
		}),
		entry('e1', `${eventId}-p1`),
		entry('e2', `${eventId}-p2`),
		eventCommand(eventId, {
			type: 'group.generateSchedule',
			payload: { groupId: 'cat/A', seed: 1 }
		})
	]);
}

describe('список событий', () => {
	it('всем — только опубликованные; ?owner=me — свои', async () => {
		ctx = await createTestApp();
		const anna = await ctx.userWithSession('anna');
		await send(anna.cookie, [
			eventCommand('draft', createEventDraft(anna.id, 'Черновик')),
			eventCommand('pub', createEventDraft(anna.id, 'Открытое')),
			eventCommand('pub', { type: 'event.setVisibility', payload: { visibility: 'published' } })
		]);
		expect((await get('/api/events')).body.events.map((e: { title: string }) => e.title)).toEqual([
			'Открытое'
		]);
		expect((await get('/api/events?owner=me', anna.cookie)).body.events).toHaveLength(2);
		expect((await get('/api/events?owner=me')).status).toBe(401);
	});
});

describe('чтение события', () => {
	it('полное состояние — владельцу, с именами игроков', async () => {
		ctx = await createTestApp();
		const anna = await ctx.userWithSession('anna');
		const boris = await ctx.userWithSession('boris');
		await eventWithPlayers(anna.id, anna.cookie);

		const own = await get('/api/events/ev1', anna.cookie);
		expect(own.body.version).toBe(5);
		expect(own.body.players['ev1-p1']).toEqual({ lastName: 'Иванов', firstName: 'Тест' });
		expect((await get('/api/events/ev1', boris.cookie)).status).toBe(403);
	});

	it('публичное представление: черновик скрыт, опубликованное видно без владельца и закрытых полей', async () => {
		ctx = await createTestApp();
		const anna = await ctx.userWithSession('anna');
		await eventWithPlayers(anna.id, anna.cookie);
		expect((await get('/api/public/events/ev1')).status).toBe(404);
		expect((await get('/api/public/events/ev1', anna.cookie)).status).toBe(200);

		await send(anna.cookie, [
			eventCommand('ev1', { type: 'event.setVisibility', payload: { visibility: 'published' } })
		]);
		const pub = await get('/api/public/events/ev1');
		expect(pub.status).toBe(200);
		expect(pub.body.state).not.toHaveProperty('ownerId');
		expect(JSON.stringify(pub.body)).not.toContain('секрет');
		expect(Object.keys(pub.body.state.matches)).toHaveLength(1);
	});

	it('объединённый игрок показывается по основной записи', async () => {
		ctx = await createTestApp();
		const anna = await ctx.userWithSession('anna');
		await eventWithPlayers(anna.id, anna.cookie);
		await send(anna.cookie, [
			playerCommand({ type: 'player.merge', payload: { sourceId: 'ev1-p2', targetId: 'ev1-p1' } })
		]);
		const own = await get('/api/events/ev1', anna.cookie);
		expect(own.body.players['ev1-p2']).toEqual({ lastName: 'Иванов', firstName: 'Тест' });
	});

	it('команды после версии N — для догона', async () => {
		ctx = await createTestApp();
		const anna = await ctx.userWithSession('anna');
		await eventWithPlayers(anna.id, anna.cookie);
		const { body } = await get('/api/events/ev1/commands?after=3', anna.cookie);
		expect(body.commands.map((c: { seq: number }) => c.seq)).toEqual([4, 5]);
		expect(body.commands[1].command.type).toBe('group.generateSchedule');
	});
});

describe('удаление события', () => {
	it('владелец — пока нет сыгранных матчей; после — только суперюзер', async () => {
		ctx = await createTestApp();
		const anna = await ctx.userWithSession('anna');
		const root = await ctx.userWithSession('root', 'superuser');
		await eventWithPlayers(anna.id, anna.cookie);
		const state = (await get('/api/events/ev1', anna.cookie)).body.state;
		const matchId = Object.keys(state.matches)[0] as string;
		await send(anna.cookie, [
			eventCommand('ev1', { type: 'event.start', payload: {} }),
			eventCommand('ev1', {
				type: 'match.recordResult',
				payload: {
					matchId,
					result: { kind: 'played', winner: 'A', games: [[21, 10]], nonStandard: false },
					expectedResult: null
				}
			})
		]);

		const byOwner = await ctx.app.inject({
			method: 'DELETE',
			url: '/api/events/ev1',
			headers: { cookie: anna.cookie }
		});
		expect(byOwner.statusCode).toBe(409);
		const byRoot = await ctx.app.inject({
			method: 'DELETE',
			url: '/api/events/ev1',
			headers: { cookie: root.cookie }
		});
		expect(byRoot.statusCode).toBe(200);
		expect((await get('/api/events/ev1', anna.cookie)).status).toBe(404);
	});
});
