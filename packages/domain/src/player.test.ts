import { describe, expect, it } from 'vitest';
import {
	type Actor,
	type Player,
	type PlayerCommand,
	type PlayerCommandDraft,
	applyPlayerCommand,
	canSeePrivate,
	invertPlayerCommand,
	parsePlayerCommand,
	publicPlayer
} from './player';

const author: Actor = { userId: 'u1', role: 'organizer' };
const other: Actor = { userId: 'u2', role: 'organizer' };
const admin: Actor = { userId: 'root', role: 'superuser' };

let n = 0;
function cmd(draft: PlayerCommandDraft): PlayerCommand {
	n += 1;
	return {
		...draft,
		id: `pc${n}`,
		scope: 'registry',
		issuedAt: '2026-10-26T10:00:00.000Z',
		deviceId: 'dev',
		schemaVersion: 1
	} as PlayerCommand;
}

function ivanov(overrides: Partial<Player> = {}): Player {
	return {
		id: 'p1',
		lastName: 'Иванов',
		firstName: 'Иван',
		gender: 'M',
		club: 'Волан',
		rating: 420,
		birthYear: 1990,
		contact: '+7 900 000-00-00',
		externalId: null,
		mergedIntoId: null,
		createdBy: 'u1',
		...overrides
	};
}

// Справочник в памяти: применяет результат команды
function registry(...players: Player[]) {
	const map = new Map(players.map((p) => [p.id, p]));
	return {
		lookup: (id: string) => map.get(id),
		apply(draft: PlayerCommandDraft, actor: Actor) {
			const result = applyPlayerCommand(map.get.bind(map), cmd(draft), actor);
			if (result.ok) {
				result.upsert.forEach((p) => map.set(p.id, p));
				result.deleted.forEach((id) => map.delete(id));
			}
			return result;
		},
		all: () => [...map.values()]
	};
}

// Поля команды создания: всё, кроме признака объединения
const { mergedIntoId: _m, ...ivanovFields } = ivanov();

describe('player.create', () => {
	it('создаёт запись от имени автора', () => {
		const r = registry();
		expect(r.apply({ type: 'player.create', payload: ivanovFields }, author).ok).toBe(true);
		expect(r.lookup('p1')).toEqual(ivanov());
	});

	it('от чужого имени — только суперюзер', () => {
		expect(registry().apply({ type: 'player.create', payload: ivanovFields }, other)).toEqual({
			ok: false,
			error: { code: 'player.forbidden', playerId: 'p1' }
		});
		expect(registry().apply({ type: 'player.create', payload: ivanovFields }, admin).ok).toBe(true);
	});

	it('повторная отправка той же команды — не ошибка, другой игрок с тем же ID — ошибка', () => {
		const r = registry(ivanov());
		expect(r.apply({ type: 'player.create', payload: ivanovFields }, author)).toEqual({
			ok: true,
			upsert: [],
			deleted: []
		});
		expect(
			r.apply({ type: 'player.create', payload: { ...ivanovFields, lastName: 'Петров' } }, author)
		).toMatchObject({ ok: false, error: { code: 'player.exists' } });
	});
});

describe('player.update', () => {
	it('автор правит, проверяя прежние значения', () => {
		const r = registry(ivanov());
		const result = r.apply(
			{
				type: 'player.update',
				payload: { playerId: 'p1', changes: { rating: 450 }, expected: { rating: 420 } }
			},
			author
		);
		expect(result.ok).toBe(true);
		expect(r.lookup('p1')?.rating).toBe(450);
	});

	it('поле уже изменили — конфликт', () => {
		const r = registry(ivanov({ rating: 430 }));
		expect(
			r.apply(
				{
					type: 'player.update',
					payload: { playerId: 'p1', changes: { rating: 450 }, expected: { rating: 420 } }
				},
				author
			)
		).toEqual({ ok: false, error: { code: 'player.changed', playerId: 'p1' } });
	});

	it('чужой организатор править не может, суперюзер — может', () => {
		const draft: PlayerCommandDraft = {
			type: 'player.update',
			payload: { playerId: 'p1', changes: { club: 'Другой' }, expected: { club: 'Волан' } }
		};
		expect(registry(ivanov()).apply(draft, other)).toMatchObject({
			error: { code: 'player.forbidden' }
		});
		expect(registry(ivanov()).apply(draft, admin).ok).toBe(true);
	});
});

describe('player.merge / unmerge', () => {
	it('суперюзер объединяет и разъединяет', () => {
		const r = registry(ivanov(), ivanov({ id: 'p2', createdBy: 'u2' }));
		expect(
			r.apply({ type: 'player.merge', payload: { sourceId: 'p2', targetId: 'p1' } }, admin).ok
		).toBe(true);
		expect(r.lookup('p2')?.mergedIntoId).toBe('p1');
		expect(r.apply({ type: 'player.unmerge', payload: { sourceId: 'p2' } }, admin).ok).toBe(true);
		expect(r.lookup('p2')?.mergedIntoId).toBeNull();
	});

	it('организатор — только если автор обеих записей', () => {
		const r = registry(ivanov(), ivanov({ id: 'p2', createdBy: 'u2' }), ivanov({ id: 'p3' }));
		expect(
			r.apply({ type: 'player.merge', payload: { sourceId: 'p2', targetId: 'p1' } }, author)
		).toMatchObject({
			error: { code: 'player.forbidden' }
		});
		expect(
			r.apply({ type: 'player.merge', payload: { sourceId: 'p3', targetId: 'p1' } }, author).ok
		).toBe(true);
	});

	it('цепочки объединений и объединение с собой запрещены', () => {
		const r = registry(ivanov(), ivanov({ id: 'p2', mergedIntoId: 'p1' }), ivanov({ id: 'p3' }));
		expect(
			r.apply({ type: 'player.merge', payload: { sourceId: 'p3', targetId: 'p2' } }, admin)
		).toMatchObject({
			error: { code: 'player.merged', playerId: 'p2' }
		});
		expect(
			r.apply({ type: 'player.merge', payload: { sourceId: 'p1', targetId: 'p1' } }, admin)
		).toMatchObject({
			error: { code: 'player.sameRecord' }
		});
	});
});

describe('отмена команд справочника', () => {
	it.each<[string, Player[], PlayerCommandDraft, Actor]>([
		['создание', [], { type: 'player.create', payload: ivanovFields }, author],
		[
			'правка',
			[ivanov()],
			{
				type: 'player.update',
				payload: {
					playerId: 'p1',
					changes: { rating: 500, club: null },
					expected: { rating: 420, club: 'Волан' }
				}
			},
			author
		],
		['удаление', [ivanov()], { type: 'player.delete', payload: { playerId: 'p1' } }, author],
		[
			'объединение',
			[ivanov(), ivanov({ id: 'p2' })],
			{ type: 'player.merge', payload: { sourceId: 'p2', targetId: 'p1' } },
			author
		]
	])('%s возвращается обратной командой', (_name, players, draft, actor) => {
		const r = registry(...players);
		const before = r.all();
		const inverse = invertPlayerCommand(r.lookup, cmd(draft));
		expect(r.apply(draft, actor).ok).toBe(true);
		for (const undo of inverse) expect(r.apply(undo, actor).ok).toBe(true);
		expect(r.all()).toEqual(before);
	});
});

describe('видимость закрытых полей', () => {
	it('автор и суперюзер видят, остальные — нет', () => {
		expect(canSeePrivate(ivanov(), author)).toBe(true);
		expect(canSeePrivate(ivanov(), admin)).toBe(true);
		expect(canSeePrivate(ivanov(), other)).toBe(false);
		expect(canSeePrivate(ivanov(), null)).toBe(false);
		expect(publicPlayer(ivanov())).not.toHaveProperty('contact');
		expect(publicPlayer(ivanov())).not.toHaveProperty('birthYear');
	});
});

describe('parsePlayerCommand', () => {
	it('проверяет данные', () => {
		const good = cmd({ type: 'player.create', payload: ivanovFields });
		expect(parsePlayerCommand(good).ok).toBe(true);
		expect(parsePlayerCommand({ ...good, payload: { ...ivanovFields, lastName: '  ' } }).ok).toBe(
			false
		);
		expect(parsePlayerCommand({ ...good, payload: { ...ivanovFields, birthYear: 1800 } }).ok).toBe(
			false
		);
	});
});
