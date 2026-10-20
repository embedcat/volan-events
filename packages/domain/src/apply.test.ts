import { beforeEach, describe, expect, it } from 'vitest';
import { suggestMatch } from './queue';
import {
	GROUP,
	createEvent,
	eventWithEntries,
	failOf,
	lastId,
	matchByNumber,
	pairOf,
	player,
	resetIds,
	run,
	runningEvent
} from './test-helpers';

beforeEach(() => resetIds());

const win21 = (winner: 'A' | 'B') => ({
	kind: 'played' as const,
	winner,
	games: [winner === 'A' ? ([21, 15] as [number, number]) : ([15, 21] as [number, number])],
	nonStandard: false
});

describe('событие', () => {
	it('создание: корты включены, черновик, настройка', () => {
		const s = createEvent(3);
		expect(s.courts).toEqual([
			{ number: 1, enabled: true },
			{ number: 2, enabled: true },
			{ number: 3, enabled: true }
		]);
		expect(s).toMatchObject({
			visibility: 'draft',
			progress: 'setup',
			ownerId: 'owner',
			queue: []
		});
	});

	it('повторное создание и команды без события', () => {
		const payload = {
			title: 'Ещё',
			date: '2026-10-27',
			venue: null,
			courts: 2,
			defaultFormat: createEvent().defaultFormat,
			ownerId: 'owner'
		};
		expect(failOf(createEvent(), { type: 'event.create', payload })).toEqual({
			code: 'event.exists'
		});
		expect(failOf(null, { type: 'event.start', payload: {} })).toEqual({ code: 'event.notFound' });
	});

	it('старт — только с расписанием', () => {
		const s = eventWithEntries(3);
		expect(failOf(s, { type: 'event.start', payload: {} })).toEqual({ code: 'event.noSchedule' });
		expect(runningEvent(3).progress).toBe('running');
	});

	it('вернуть в настройку — пока ни один матч не вызван', () => {
		const running = runningEvent(3);
		expect(run(running, { type: 'event.backToSetup', payload: {} }).progress).toBe('setup');
		const called = run(running, {
			type: 'match.call',
			payload: { matchId: matchByNumber(running, 1).id, court: 1 }
		});
		expect(failOf(called, { type: 'event.backToSetup', payload: {} })).toEqual({
			code: 'event.matchesStarted'
		});
	});

	it('завершение — когда кортах никого, затем «вернуть в работу»', () => {
		let s = runningEvent(3);
		const m1 = matchByNumber(s, 1).id;
		s = run(s, { type: 'match.call', payload: { matchId: m1, court: 1 } });
		expect(failOf(s, { type: 'event.finish', payload: {} })).toEqual({
			code: 'event.matchesOnCourt'
		});
		s = run(
			s,
			{ type: 'match.uncall', payload: { matchId: m1 } },
			{ type: 'event.finish', payload: {} }
		);
		expect(s.progress).toBe('finished');
		expect(failOf(s, { type: 'match.call', payload: { matchId: m1, court: 1 } })).toEqual({
			code: 'event.finished'
		});
		expect(
			run(s, { type: 'event.setVisibility', payload: { visibility: 'published' } }).visibility
		).toBe('published');
		expect(run(s, { type: 'event.reopen', payload: {} }).progress).toBe('running');
	});
});

describe('корты', () => {
	it('уменьшить число кортов нельзя, если убираемый занят', () => {
		let s = runningEvent(4, 3);
		s = run(s, { type: 'match.call', payload: { matchId: matchByNumber(s, 1).id, court: 3 } });
		expect(failOf(s, { type: 'event.setCourts', payload: { count: 2 } })).toEqual({
			code: 'court.busy',
			court: 3
		});
		expect(run(s, { type: 'event.setCourts', payload: { count: 4 } }).courts).toHaveLength(4);
	});

	it('выключить занятый корт нельзя; на выключенный не вызвать', () => {
		let s = runningEvent(4);
		s = run(s, { type: 'match.call', payload: { matchId: matchByNumber(s, 1).id, court: 1 } });
		expect(failOf(s, { type: 'court.setEnabled', payload: { court: 1, enabled: false } })).toEqual({
			code: 'court.busy',
			court: 1
		});
		s = run(s, { type: 'court.setEnabled', payload: { court: 2, enabled: false } });
		expect(
			failOf(s, { type: 'match.call', payload: { matchId: matchByNumber(s, 2).id, court: 2 } })
		).toEqual({
			code: 'court.disabled',
			court: 2
		});
	});
});

describe('категории и состав', () => {
	it('категория создаёт групповой этап и группу A с форматом события', () => {
		const s = eventWithEntries(0);
		expect(s.categories['cat']?.stageIds).toEqual(['cat/groups']);
		expect(s.stages['cat/groups']).toMatchObject({ kind: 'groups', format: s.defaultFormat });
		expect(s.groups[GROUP]).toMatchObject({ name: 'A', entryIds: [], scheduleSeed: null });
	});

	it.each([
		['MS', [player('a', null, 'F')], 'gender'],
		['MD', [player('a')], 'count'],
		['XD', [player('a'), player('b')], 'gender'],
		['OD', [player('a'), player('a')], 'duplicate']
	] as const)('%s: неверный состав (%s)', (discipline, players, reason) => {
		const s = run(createEvent(), {
			type: 'category.create',
			payload: {
				id: 'c',
				discipline,
				level: null,
				customName: null,
				ratingMin: null,
				ratingMax: null
			}
		});
		expect(
			failOf(s, { type: 'entry.add', payload: { id: 'e', categoryId: 'c', players: [...players] } })
		).toEqual({
			code: 'entry.composition',
			reason
		});
	});

	it('OS — открытая одиночка, пол не важен; XD — мужчина и женщина', () => {
		const s = run(
			createEvent(),
			{
				type: 'category.create',
				payload: {
					id: 'os',
					discipline: 'OS',
					level: null,
					customName: null,
					ratingMin: null,
					ratingMax: null
				}
			},
			{
				type: 'category.create',
				payload: {
					id: 'xd',
					discipline: 'XD',
					level: null,
					customName: null,
					ratingMin: null,
					ratingMax: null
				}
			},
			{
				type: 'entry.add',
				payload: { id: 'e1', categoryId: 'os', players: [player('w', null, 'F')] }
			},
			{
				type: 'entry.add',
				payload: { id: 'e2', categoryId: 'xd', players: [player('m'), player('w', null, 'F')] }
			}
		);
		expect(Object.keys(s.entries)).toEqual(['e1', 'e2']);
	});

	it('игрок не может быть заявлен в категорию дважды', () => {
		const s = eventWithEntries(2);
		expect(
			failOf(s, {
				type: 'entry.add',
				payload: { id: 'x', categoryId: 'cat', players: [player('p1')] }
			})
		).toEqual({
			code: 'entry.playerAlreadyInCategory',
			playerId: 'p1'
		});
	});

	it('разряд категории не меняется, когда есть участники', () => {
		expect(
			failOf(eventWithEntries(1), {
				type: 'category.update',
				payload: { categoryId: 'cat', discipline: 'WS' }
			})
		).toEqual({
			code: 'category.hasEntries',
			categoryId: 'cat'
		});
	});

	it('замена партнёра в паре', () => {
		let s = run(
			createEvent(),
			{
				type: 'category.create',
				payload: {
					id: 'md',
					discipline: 'MD',
					level: null,
					customName: null,
					ratingMin: null,
					ratingMax: null
				}
			},
			{
				type: 'entry.add',
				payload: { id: 'e', categoryId: 'md', players: [player('a'), player('b')] }
			}
		);
		s = run(s, {
			type: 'entry.update',
			payload: { entryId: 'e', players: [player('a'), player('c')] }
		});
		expect(s.entries['e']?.players.map((p) => p.playerId)).toEqual(['a', 'c']);
	});
});

describe('расписание', () => {
	it('4 участника: 6 матчей №1–6 по турам, сильнейшие в последнем туре', () => {
		const s = run(eventWithEntries(4), {
			type: 'group.generateSchedule',
			payload: { groupId: GROUP, seed: 1 }
		});
		const cmdId = lastId();
		expect([1, 2, 3, 4, 5, 6].map((n) => pairOf(s, n))).toEqual([
			'e1-e4',
			'e2-e3',
			'e1-e3',
			'e4-e2',
			'e1-e2',
			'e3-e4'
		]);
		expect(s.queue).toEqual([1, 2, 3, 4, 5, 6].map((k) => `${cmdId}:${k}`));
		expect(matchByNumber(s, 5)).toMatchObject({
			round: 3,
			status: 'pending',
			stageId: 'cat/groups'
		});
		expect(s.groups[GROUP]).toMatchObject({ entryIds: ['e1', 'e2', 'e3', 'e4'], scheduleSeed: 1 });
	});

	it('пересборка до первого вызова: номера снова с 1', () => {
		const s = run(
			eventWithEntries(4),
			{ type: 'group.generateSchedule', payload: { groupId: GROUP, seed: 1 } },
			{ type: 'group.generateSchedule', payload: { groupId: GROUP, seed: 2 } }
		);
		expect(
			Object.values(s.matches)
				.map((m) => m.number)
				.sort()
		).toEqual([1, 2, 3, 4, 5, 6]);
		expect(s.queue).toHaveLength(6);
	});

	it('после вызова матча группы расписание не пересобирается', () => {
		let s = runningEvent(4);
		s = run(s, { type: 'match.call', payload: { matchId: matchByNumber(s, 1).id, court: 1 } });
		expect(
			failOf(s, { type: 'group.generateSchedule', payload: { groupId: GROUP, seed: 3 } })
		).toEqual({
			code: 'group.started',
			groupId: GROUP
		});
	});

	it('убрать расписание', () => {
		const s = run(
			eventWithEntries(3),
			{ type: 'group.generateSchedule', payload: { groupId: GROUP, seed: 1 } },
			{ type: 'group.clearSchedule', payload: { groupId: GROUP } }
		);
		expect(s.matches).toEqual({});
		expect(s.queue).toEqual([]);
		expect(s.groups[GROUP]?.scheduleSeed).toBeNull();
	});

	it('опоздавший до первого вызова: расписание пересобирается целиком', () => {
		const s = run(runningEvent(4), {
			type: 'entry.add',
			payload: { id: 'e5', categoryId: 'cat', players: [player('p5', 50)] }
		});
		expect(
			Object.values(s.matches)
				.map((m) => m.number)
				.sort((a, b) => a - b)
		).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
	});

	it('опоздавший после вызова: его матчи дописываются в конец очереди', () => {
		let s = runningEvent(4);
		const before = Object.keys(s.matches);
		s = run(s, { type: 'match.call', payload: { matchId: matchByNumber(s, 1).id, court: 1 } });
		s = run(s, {
			type: 'entry.add',
			payload: { id: 'e5', categoryId: 'cat', players: [player('p5', 50)] }
		});
		expect(Object.keys(s.matches)).toEqual(expect.arrayContaining(before));
		expect(s.queue.slice(-4).map((id) => s.matches[id]?.number)).toEqual([7, 8, 9, 10]);
		expect(s.queue.slice(-4).map((id) => s.matches[id]?.round)).toEqual([4, 4, 4, 4]);
	});
});

describe('вызов на корт', () => {
	it('только когда турнир идёт', () => {
		const s = run(eventWithEntries(3), {
			type: 'group.generateSchedule',
			payload: { groupId: GROUP, seed: 1 }
		});
		expect(
			failOf(s, { type: 'match.call', payload: { matchId: matchByNumber(s, 1).id, court: 1 } })
		).toEqual({
			code: 'event.notRunning'
		});
	});

	it('матч уходит из очереди на корт, время вызова — время команды', () => {
		let s = runningEvent(4);
		const m1 = matchByNumber(s, 1).id;
		s = run(s, { type: 'match.call', payload: { matchId: m1, court: 2 } });
		expect(s.matches[m1]).toMatchObject({
			status: 'on_court',
			court: 2,
			calledAt: expect.any(String)
		});
		expect(s.queue).not.toContain(m1);
	});

	it('занятый корт и занятый игрок', () => {
		let s = runningEvent(4);
		s = run(s, { type: 'match.call', payload: { matchId: matchByNumber(s, 1).id, court: 1 } });
		expect(
			failOf(s, { type: 'match.call', payload: { matchId: matchByNumber(s, 2).id, court: 1 } })
		).toEqual({
			code: 'court.busy',
			court: 1
		});
		// №3 — e1-e3, а e1 сейчас на корте 1
		const m3 = matchByNumber(s, 3).id;
		expect(failOf(s, { type: 'match.call', payload: { matchId: m3, court: 2 } })).toEqual({
			code: 'match.playerBusy',
			matchId: m3,
			playerId: 'p1'
		});
	});

	it('игрок занят в другой категории', () => {
		let s = runningEvent(4);
		s = run(
			s,
			{
				type: 'category.create',
				payload: {
					id: 'md',
					discipline: 'MD',
					level: null,
					customName: null,
					ratingMin: null,
					ratingMax: null
				}
			},
			{
				type: 'entry.add',
				payload: { id: 'd1', categoryId: 'md', players: [player('p1'), player('x')] }
			},
			{
				type: 'entry.add',
				payload: { id: 'd2', categoryId: 'md', players: [player('y'), player('z')] }
			},
			{ type: 'group.generateSchedule', payload: { groupId: 'md/A', seed: 1 } }
		);
		s = run(s, { type: 'match.call', payload: { matchId: matchByNumber(s, 1).id, court: 1 } });
		const pairMatch = Object.values(s.matches).find((m) => m.groupId === 'md/A');
		expect(pairMatch).toBeDefined();
		expect(
			failOf(s, { type: 'match.call', payload: { matchId: pairMatch!.id, court: 2 } })
		).toMatchObject({
			code: 'match.playerBusy',
			playerId: 'p1'
		});
	});

	it('отмена вызова возвращает матч в начало очереди', () => {
		let s = runningEvent(4);
		const m3 = matchByNumber(s, 3).id;
		s = run(
			s,
			{ type: 'match.call', payload: { matchId: m3, court: 1 } },
			{ type: 'match.uncall', payload: { matchId: m3 } }
		);
		expect(s.queue[0]).toBe(m3);
		expect(s.matches[m3]).toMatchObject({ status: 'pending', court: null, calledAt: null });
	});

	it('перенос на другой корт и перестановка в очереди', () => {
		let s = runningEvent(4);
		const [m1, m2] = [matchByNumber(s, 1).id, matchByNumber(s, 2).id];
		s = run(
			s,
			{ type: 'match.call', payload: { matchId: m1, court: 1 } },
			{ type: 'match.call', payload: { matchId: m2, court: 2 } }
		);
		expect(failOf(s, { type: 'match.moveCourt', payload: { matchId: m1, court: 2 } })).toEqual({
			code: 'court.busy',
			court: 2
		});
		s = run(
			s,
			{ type: 'event.setCourts', payload: { count: 3 } },
			{ type: 'match.moveCourt', payload: { matchId: m1, court: 3 } }
		);
		expect(s.matches[m1]?.court).toBe(3);

		const last = s.queue[s.queue.length - 1] as string;
		s = run(s, { type: 'queue.move', payload: { matchId: last, toIndex: 0 } });
		expect(s.queue[0]).toBe(last);
	});

	it('подсказка — первый матч очереди со свободными игроками', () => {
		let s = runningEvent(4);
		s = run(s, { type: 'match.call', payload: { matchId: matchByNumber(s, 1).id, court: 1 } });
		// №2 e2-e3 свободны
		expect(suggestMatch(s)?.number).toBe(2);
		s = run(s, { type: 'match.call', payload: { matchId: matchByNumber(s, 2).id, court: 2 } });
		// все оставшиеся матчи с кем-то из e1–e4, все на кортах
		expect(suggestMatch(s)).toBeUndefined();
	});
});

describe('результаты', () => {
	it('некорректный счёт отклоняется с перечнем проблем', () => {
		const s = runningEvent(3);
		const m1 = matchByNumber(s, 1).id;
		expect(
			failOf(s, {
				type: 'match.recordResult',
				payload: {
					matchId: m1,
					result: { kind: 'played', winner: 'A', games: [[21, 20]], nonStandard: false },
					expectedResult: null
				}
			})
		).toEqual({
			code: 'score.invalid',
			matchId: m1,
			issues: [{ code: 'game.notFinished', game: 0 }]
		});
	});

	it('результат матча на корте: корт свободен, время и состав записаны', () => {
		let s = runningEvent(4);
		const m1 = matchByNumber(s, 1).id;
		s = run(s, { type: 'match.call', payload: { matchId: m1, court: 1 } });
		s = run(s, {
			type: 'match.recordResult',
			payload: { matchId: m1, result: win21('A'), expectedResult: null }
		});
		expect(s.matches[m1]).toMatchObject({
			status: 'finished',
			court: 1,
			finishedAt: expect.any(String),
			lineupA: ['p1'],
			lineupB: ['p4'],
			result: { ...win21('A'), byWithdrawal: false }
		});
		// корт 1 снова свободен
		const next = run(s, {
			type: 'match.call',
			payload: { matchId: matchByNumber(s, 2).id, court: 1 }
		});
		expect(next.matches[matchByNumber(s, 2).id]?.court).toBe(1);
	});

	it('неявка матчу из очереди: без вызова, уходит из очереди', () => {
		let s = runningEvent(3);
		const m1 = matchByNumber(s, 1).id;
		s = run(s, {
			type: 'match.recordResult',
			payload: {
				matchId: m1,
				result: { kind: 'walkover', winner: 'B', games: [], nonStandard: false },
				expectedResult: null
			}
		});
		expect(s.queue).not.toContain(m1);
		expect(s.matches[m1]).toMatchObject({
			status: 'finished',
			calledAt: null,
			lineupA: null,
			lineupB: null
		});
	});

	it('правка: совпадающий expected — принимается, устаревший — конфликт, тот же счёт — без изменений', () => {
		let s = runningEvent(3);
		const m1 = matchByNumber(s, 1).id;
		s = run(s, {
			type: 'match.recordResult',
			payload: { matchId: m1, result: win21('A'), expectedResult: null }
		});
		const first = s.matches[m1]!.result!;

		const fixed = {
			kind: 'played' as const,
			winner: 'A' as const,
			games: [[21, 17]] as [number, number][],
			nonStandard: false
		};
		const edited = run(s, {
			type: 'match.recordResult',
			payload: { matchId: m1, result: fixed, expectedResult: first }
		});
		expect(edited.matches[m1]?.result?.games).toEqual([[21, 17]]);

		expect(
			failOf(edited, {
				type: 'match.recordResult',
				payload: { matchId: m1, result: win21('B'), expectedResult: first }
			})
		).toEqual({
			code: 'match.resultChanged',
			matchId: m1
		});
		expect(
			run(s, {
				type: 'match.recordResult',
				payload: { matchId: m1, result: win21('A'), expectedResult: null }
			})
		).toEqual(s);
	});

	it('стереть результат: матч в начало очереди', () => {
		let s = runningEvent(3);
		const m2 = matchByNumber(s, 2).id;
		s = run(s, {
			type: 'match.recordResult',
			payload: { matchId: m2, result: win21('A'), expectedResult: null }
		});
		s = run(s, {
			type: 'match.clearResult',
			payload: { matchId: m2, expectedResult: s.matches[m2]!.result! }
		});
		expect(s.queue[0]).toBe(m2);
		expect(s.matches[m2]).toMatchObject({
			status: 'pending',
			result: null,
			finishedAt: null,
			court: null
		});
	});
});

describe('снятие участника', () => {
	it('несыгранные матчи — неявки в пользу соперников, из очереди уходят', () => {
		let s = runningEvent(4);
		const m1 = matchByNumber(s, 1).id; // e1-e4
		s = run(s, {
			type: 'match.recordResult',
			payload: { matchId: m1, result: win21('A'), expectedResult: null }
		});
		s = run(s, { type: 'entry.withdraw', payload: { entryId: 'e4' } });

		expect(s.entries['e4']?.status).toBe('withdrawn');
		const e4Matches = Object.values(s.matches).filter((m) => m.sideA === 'e4' || m.sideB === 'e4');
		expect(e4Matches.every((m) => m.status === 'finished')).toBe(true);
		const wo = e4Matches.filter((m) => m.result?.byWithdrawal);
		expect(wo).toHaveLength(2);
		for (const m of wo) {
			expect(m.result).toMatchObject({ kind: 'walkover', winner: m.sideA === 'e4' ? 'B' : 'A' });
			expect(s.queue).not.toContain(m.id);
		}
		// сыгранный матч сохранился
		expect(s.matches[m1]?.result?.byWithdrawal).toBe(false);
	});

	it('нельзя снять участника, который на корте; стереть неявку снятия нельзя', () => {
		let s = runningEvent(4);
		s = run(s, { type: 'match.call', payload: { matchId: matchByNumber(s, 1).id, court: 1 } });
		expect(failOf(s, { type: 'entry.withdraw', payload: { entryId: 'e1' } })).toEqual({
			code: 'entry.onCourt',
			entryId: 'e1'
		});

		s = run(s, { type: 'entry.withdraw', payload: { entryId: 'e3' } });
		const wo = Object.values(s.matches).find((m) => m.result?.byWithdrawal)!;
		expect(
			failOf(s, {
				type: 'match.clearResult',
				payload: { matchId: wo.id, expectedResult: wo.result! }
			})
		).toEqual({
			code: 'match.byWithdrawal',
			matchId: wo.id
		});
	});

	it('возврат снятого: матчи снова в очереди', () => {
		let s = runningEvent(4);
		s = run(
			s,
			{ type: 'entry.withdraw', payload: { entryId: 'e2' } },
			{ type: 'entry.reinstate', payload: { entryId: 'e2' } }
		);
		expect(s.entries['e2']?.status).toBe('active');
		expect(Object.values(s.matches).every((m) => m.status === 'pending')).toBe(true);
		expect(s.queue).toHaveLength(6);
	});

	it('удалить участника с результатами нельзя', () => {
		let s = runningEvent(3);
		s = run(s, {
			type: 'match.recordResult',
			payload: { matchId: matchByNumber(s, 1).id, result: win21('A'), expectedResult: null }
		});
		const sideA = matchByNumber(s, 1).sideA;
		expect(failOf(s, { type: 'entry.remove', payload: { entryId: sideA } })).toEqual({
			code: 'entry.hasResults',
			entryId: sideA
		});
	});
});

describe('жребий', () => {
	// Расписание трёх: №1 e2–e3, №2 e1–e3, №3 e1–e2. Круг e2>e3, e3>e1, e1>e2,
	// все 21:15 — полное равенство по всем показателям
	function cycle() {
		let s = runningEvent(3);
		for (const [n, winner] of [
			[1, 'A'],
			[2, 'B'],
			[3, 'A']
		] as const) {
			const m = matchByNumber(s, n);
			s = run(s, {
				type: 'match.recordResult',
				payload: { matchId: m.id, result: win21(winner), expectedResult: null }
			});
		}
		return s;
	}

	it('пока группа не доиграна — нельзя', () => {
		expect(
			failOf(runningEvent(3), {
				type: 'group.resolveTie',
				payload: { groupId: GROUP, order: ['e1', 'e2', 'e3'] }
			})
		).toEqual({
			code: 'group.notComplete',
			groupId: GROUP
		});
	});

	it('только для действительно равных', () => {
		expect(
			failOf(cycle(), {
				type: 'group.resolveTie',
				payload: { groupId: GROUP, order: ['e1', 'e2'] }
			})
		).toEqual({
			code: 'group.notTied',
			groupId: GROUP
		});
	});

	it('расстановка и её снятие', () => {
		const resolved = run(cycle(), {
			type: 'group.resolveTie',
			payload: { groupId: GROUP, order: ['e3', 'e1', 'e2'] }
		});
		expect(resolved.groups[GROUP]?.lots).toEqual([['e3', 'e1', 'e2']]);
		const cleared = run(resolved, {
			type: 'group.clearTie',
			payload: { groupId: GROUP, entryIds: ['e1', 'e2', 'e3'] }
		});
		expect(cleared.groups[GROUP]?.lots).toEqual([]);
	});

	it('повторный жребий того же набора заменяет прежний', () => {
		const s = run(
			cycle(),
			{ type: 'group.resolveTie', payload: { groupId: GROUP, order: ['e3', 'e1', 'e2'] } },
			{ type: 'group.resolveTie', payload: { groupId: GROUP, order: ['e2', 'e3', 'e1'] } }
		);
		expect(s.groups[GROUP]?.lots).toEqual([['e2', 'e3', 'e1']]);
	});
});
