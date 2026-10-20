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
	return { status: response.statusCode, body: response.json() };
}

const ivanov = (createdBy: string, id = 'p1') => ({
	id,
	lastName: 'Иванов',
	firstName: 'Иван',
	gender: 'M' as const,
	club: 'Волан',
	rating: 420,
	birthYear: 1990,
	contact: '+7 900',
	externalId: null,
	createdBy
});

describe('команды события', () => {
	it('создание события и следующая команда: версии 1 и 2', async () => {
		ctx = await createTestApp();
		const anna = await ctx.userWithSession('anna');
		const { body } = await send(anna.cookie, [
			eventCommand('ev1', createEventDraft(anna.id)),
			eventCommand('ev1', { type: 'event.setVisibility', payload: { visibility: 'published' } })
		]);
		expect(body.results).toEqual([
			expect.objectContaining({ status: 'applied', seq: 1 }),
			expect.objectContaining({ status: 'applied', seq: 2 })
		]);
		const state = await ctx.app.inject({
			method: 'GET',
			url: '/api/events/ev1',
			headers: { cookie: anna.cookie }
		});
		expect(state.json()).toMatchObject({
			version: 2,
			state: { visibility: 'published', title: 'Турнир' }
		});
	});

	it('повторная отправка — duplicate без изменений', async () => {
		ctx = await createTestApp();
		const anna = await ctx.userWithSession('anna');
		const create = eventCommand('ev1', createEventDraft(anna.id));
		await send(anna.cookie, [create]);
		const { body } = await send(anna.cookie, [create]);
		expect(body.results).toEqual([{ id: create.id, status: 'duplicate', seq: 1 }]);
	});

	it('пачка не останавливается на отклонённой команде, отклонённая сохраняется', async () => {
		ctx = await createTestApp();
		const anna = await ctx.userWithSession('anna');
		const bad = eventCommand('ev1', { type: 'event.start', payload: {} }); // нет расписания
		const { body } = await send(anna.cookie, [
			eventCommand('ev1', createEventDraft(anna.id)),
			bad,
			eventCommand('ev1', { type: 'event.update', payload: { title: 'Новое' } })
		]);
		expect(body.results.map((r: { status: string }) => r.status)).toEqual([
			'applied',
			'rejected',
			'applied'
		]);
		expect(body.results[1].error).toEqual({ code: 'event.noSchedule' });

		const rejected = await ctx.app.inject({
			method: 'GET',
			url: '/api/rejected',
			headers: { cookie: anna.cookie }
		});
		expect(rejected.json().rejected).toEqual([
			expect.objectContaining({ id: bad.id, reason: { code: 'event.noSchedule' }, eventId: 'ev1' })
		]);

		await ctx.app.inject({
			method: 'POST',
			url: `/api/rejected/${bad.id}/resolve`,
			headers: { cookie: anna.cookie },
			payload: { resolution: 'discarded' }
		});
		const after = await ctx.app.inject({
			method: 'GET',
			url: '/api/rejected',
			headers: { cookie: anna.cookie }
		});
		expect(after.json().rejected).toEqual([]);
	});

	it('чужое событие — forbidden, суперюзер — может', async () => {
		ctx = await createTestApp();
		const anna = await ctx.userWithSession('anna');
		const boris = await ctx.userWithSession('boris');
		const root = await ctx.userWithSession('root', 'superuser');
		await send(anna.cookie, [eventCommand('ev1', createEventDraft(anna.id))]);

		const update = { type: 'event.update', payload: { title: 'Чужое' } } as const;
		expect((await send(boris.cookie, [eventCommand('ev1', update)])).body.results[0].status).toBe(
			'forbidden'
		);
		expect(
			(await send(boris.cookie, [eventCommand('ev2', createEventDraft(anna.id))])).body.results[0]
				.status
		).toBe('forbidden');
		expect((await send(root.cookie, [eventCommand('ev1', update)])).body.results[0].status).toBe(
			'applied'
		);
	});

	it('неверная команда — invalid, без входа — 401', async () => {
		ctx = await createTestApp();
		const anna = await ctx.userWithSession('anna');
		const { body } = await send(anna.cookie, [{ id: 'x', type: 'match.teleport' }]);
		expect(body.results[0]).toMatchObject({ id: 'x', status: 'invalid' });
		const anonymous = await ctx.app.inject({
			method: 'POST',
			url: '/api/commands',
			payload: { commands: [{}] }
		});
		expect(anonymous.statusCode).toBe(401);
	});
});

describe('справочник игроков', () => {
	it('создание и правка; закрытые поля видят автор и суперюзер', async () => {
		ctx = await createTestApp();
		const anna = await ctx.userWithSession('anna');
		const boris = await ctx.userWithSession('boris');
		const root = await ctx.userWithSession('root', 'superuser');

		const created = await send(anna.cookie, [
			playerCommand({ type: 'player.create', payload: ivanov(anna.id) })
		]);
		expect(created.body.results[0]).toMatchObject({ status: 'applied', revision: 1 });

		const view = async (cookie: string, since = 0) =>
			(
				await ctx.app.inject({
					method: 'GET',
					url: `/api/players?since=${since}`,
					headers: { cookie }
				})
			).json();
		expect((await view(anna.cookie)).players[0]).toMatchObject({
			contact: '+7 900',
			birthYear: 1990
		});
		expect((await view(root.cookie)).players[0]).toHaveProperty('contact');
		expect((await view(boris.cookie)).players[0]).not.toHaveProperty('contact');
		expect((await view(boris.cookie)).players[0]).toMatchObject({
			lastName: 'Иванов',
			rating: 420
		});

		await send(anna.cookie, [
			playerCommand({
				type: 'player.update',
				payload: { playerId: 'p1', changes: { rating: 450 }, expected: { rating: 420 } }
			})
		]);
		const changes = await view(boris.cookie, 1);
		expect(changes).toMatchObject({ revision: 2, players: [{ id: 'p1', rating: 450 }] });
	});

	it('чужого игрока править нельзя — отклонено', async () => {
		ctx = await createTestApp();
		const anna = await ctx.userWithSession('anna');
		const boris = await ctx.userWithSession('boris');
		await send(anna.cookie, [playerCommand({ type: 'player.create', payload: ivanov(anna.id) })]);
		const { body } = await send(boris.cookie, [
			playerCommand({
				type: 'player.update',
				payload: { playerId: 'p1', changes: { rating: 1 }, expected: { rating: 420 } }
			})
		]);
		expect(body.results[0]).toMatchObject({
			status: 'rejected',
			error: { code: 'player.forbidden' }
		});
	});

	it('удалить заявленного игрока нельзя; незаявленного — можно, удаление видно по ревизии', async () => {
		ctx = await createTestApp();
		const anna = await ctx.userWithSession('anna');
		await send(anna.cookie, [
			playerCommand({ type: 'player.create', payload: ivanov(anna.id, 'p1') }),
			playerCommand({ type: 'player.create', payload: ivanov(anna.id, 'p2') }),
			eventCommand('ev1', createEventDraft(anna.id)),
			eventCommand('ev1', {
				type: 'category.create',
				payload: {
					id: 'cat',
					discipline: 'MS',
					level: null,
					customName: null,
					ratingMin: null,
					ratingMax: null
				}
			}),
			eventCommand('ev1', {
				type: 'entry.add',
				payload: {
					id: 'e1',
					categoryId: 'cat',
					players: [{ playerId: 'p1', gender: 'M', rating: 420, club: null }]
				}
			})
		]);
		const { body } = await send(anna.cookie, [
			playerCommand({ type: 'player.delete', payload: { playerId: 'p1' } }),
			playerCommand({ type: 'player.delete', payload: { playerId: 'p2' } })
		]);
		expect(body.results[0]).toMatchObject({ status: 'rejected', error: { code: 'player.inUse' } });
		expect(body.results[1]).toMatchObject({ status: 'applied' });

		const changes = await ctx.app.inject({
			method: 'GET',
			url: '/api/players?since=2',
			headers: { cookie: anna.cookie }
		});
		expect(changes.json().players).toEqual([{ id: 'p2', deleted: true }]);
	});
});
