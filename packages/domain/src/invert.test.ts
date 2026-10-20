import { beforeEach, describe, expect, it } from 'vitest';
import { applyCommand } from './apply';
import type { EventCommandDraft } from './commands';
import { invertCommand } from './invert';
import type { EventState } from './state';
import {
	GROUP,
	createEvent,
	envelope,
	eventWithEntries,
	matchByNumber,
	pairOf,
	player,
	resetIds,
	run,
	runningEvent
} from './test-helpers';

beforeEach(() => resetIds());

const win = (
	winner: 'A' | 'B',
	games: [number, number][] = [winner === 'A' ? [21, 15] : [15, 21]]
) => ({
	kind: 'played' as const,
	winner,
	games,
	nonStandard: false
});

// Применить команду, затем её обратную: состояние должно вернуться в точности
function expectUndo(before: EventState, draft: EventCommandDraft): void {
	const command = envelope(draft);
	const applied = applyCommand(before, command);
	if (!applied.ok) throw new Error(JSON.stringify(applied.error));
	const inverse = invertCommand(before, command);
	expect(inverse.length).toBeGreaterThan(0);
	expect(run(applied.state, ...inverse)).toEqual(before);
}

function withCalled(state: EventState, number: number, court: number): EventState {
	return run(state, {
		type: 'match.call',
		payload: { matchId: matchByNumber(state, number).id, court }
	});
}

describe('отмена: событие и корты', () => {
	it('описание, видимость', () => {
		expectUndo(createEvent(), { type: 'event.update', payload: { title: 'Новое', venue: 'Зал' } });
		expectUndo(createEvent(), {
			type: 'event.setVisibility',
			payload: { visibility: 'published' }
		});
	});

	it('число кортов — с возвратом выключенного корта', () => {
		const before = run(createEvent(3), {
			type: 'court.setEnabled',
			payload: { court: 3, enabled: false }
		});
		expectUndo(before, { type: 'event.setCourts', payload: { count: 2 } });
		expectUndo(before, { type: 'court.setEnabled', payload: { court: 1, enabled: false } });
	});

	it('старт, возврат в настройку, завершение, возврат в работу', () => {
		const ready = run(eventWithEntries(3), {
			type: 'group.generateSchedule',
			payload: { groupId: GROUP, seed: 1 }
		});
		expectUndo(ready, { type: 'event.start', payload: {} });
		const running = run(ready, { type: 'event.start', payload: {} });
		expectUndo(running, { type: 'event.backToSetup', payload: {} });
		expectUndo(running, { type: 'event.finish', payload: {} });
		expectUndo(run(running, { type: 'event.finish', payload: {} }), {
			type: 'event.reopen',
			payload: {}
		});
	});
});

describe('отмена: категории и участники', () => {
	it('создание и правка категории', () => {
		expectUndo(createEvent(), {
			type: 'category.create',
			payload: {
				id: 'c',
				discipline: 'WS',
				level: 'C',
				customName: null,
				ratingMin: null,
				ratingMax: null
			}
		});
		expectUndo(eventWithEntries(2), {
			type: 'category.update',
			payload: {
				categoryId: 'cat',
				level: 'A',
				format: { points: 15, bestOf: 3, deciderPoints: 15 }
			}
		});
	});

	it('удаление категории с участниками и расписанием — возвращается всё, включая очередь', () => {
		const before = run(eventWithEntries(4), {
			type: 'group.generateSchedule',
			payload: { groupId: GROUP, seed: 5 }
		});
		expectUndo(before, { type: 'category.delete', payload: { categoryId: 'cat' } });
	});

	it('добавление, замена состава, удаление участника', () => {
		expectUndo(eventWithEntries(2), {
			type: 'entry.add',
			payload: { id: 'x', categoryId: 'cat', players: [player('px')] }
		});
		expectUndo(eventWithEntries(2), {
			type: 'entry.update',
			payload: { entryId: 'e1', players: [player('new', 777)] }
		});
		expectUndo(eventWithEntries(3), { type: 'entry.remove', payload: { entryId: 'e2' } });
	});

	it('снятие участника — матчи возвращаются на прежние места в очереди', () => {
		let before = runningEvent(4);
		before = run(before, {
			type: 'match.recordResult',
			payload: { matchId: matchByNumber(before, 2).id, result: win('A'), expectedResult: null }
		});
		before = run(before, {
			type: 'queue.move',
			payload: { matchId: matchByNumber(before, 6).id, toIndex: 0 }
		});
		expectUndo(before, { type: 'entry.withdraw', payload: { entryId: 'e4' } });
	});

	it('возврат снятого', () => {
		const before = run(runningEvent(4), { type: 'entry.withdraw', payload: { entryId: 'e3' } });
		expectUndo(before, { type: 'entry.reinstate', payload: { entryId: 'e3' } });
	});
});

describe('отмена: расписание и жребий', () => {
	it('составление расписания с нуля', () => {
		expectUndo(eventWithEntries(4), {
			type: 'group.generateSchedule',
			payload: { groupId: GROUP, seed: 9 }
		});
	});

	it('пересборка и удаление расписания возвращают те же пары под теми же номерами', () => {
		const before = run(eventWithEntries(5), {
			type: 'group.generateSchedule',
			payload: { groupId: GROUP, seed: 3 }
		});
		for (const draft of [
			{ type: 'group.generateSchedule', payload: { groupId: GROUP, seed: 4 } },
			{ type: 'group.clearSchedule', payload: { groupId: GROUP } }
		] as EventCommandDraft[]) {
			const command = envelope(draft);
			const applied = applyCommand(before, command);
			if (!applied.ok) throw new Error(JSON.stringify(applied.error));
			const restored = run(applied.state, ...invertCommand(before, command));
			const numbers = Object.values(before.matches).map((m) => m.number);
			expect(numbers.map((n) => pairOf(restored, n))).toEqual(
				numbers.map((n) => pairOf(before, n))
			);
		}
	});

	it('жребий: новый, замена прежнего, снятие', () => {
		// Круговое равенство трёх: №1 e2–e3, №2 e1–e3, №3 e1–e2
		let s = runningEvent(3);
		for (const [n, w] of [
			[1, 'A'],
			[2, 'B'],
			[3, 'A']
		] as const) {
			s = run(s, {
				type: 'match.recordResult',
				payload: { matchId: matchByNumber(s, n).id, result: win(w), expectedResult: null }
			});
		}
		expectUndo(s, {
			type: 'group.resolveTie',
			payload: { groupId: GROUP, order: ['e2', 'e1', 'e3'] }
		});
		const resolved = run(s, {
			type: 'group.resolveTie',
			payload: { groupId: GROUP, order: ['e2', 'e1', 'e3'] }
		});
		expectUndo(resolved, {
			type: 'group.resolveTie',
			payload: { groupId: GROUP, order: ['e3', 'e2', 'e1'] }
		});
		expectUndo(resolved, {
			type: 'group.clearTie',
			payload: { groupId: GROUP, entryIds: ['e1', 'e2', 'e3'] }
		});
	});
});

describe('отмена: корты, очередь, результаты', () => {
	it('перестановка в очереди', () => {
		const s = runningEvent(4);
		expectUndo(s, { type: 'queue.move', payload: { matchId: matchByNumber(s, 5).id, toIndex: 1 } });
	});

	it('вызов, отмена вызова, перенос — с точным временем вызова', () => {
		const s = runningEvent(4, 3);
		expectUndo(s, { type: 'match.call', payload: { matchId: matchByNumber(s, 3).id, court: 2 } });
		const called = withCalled(s, 3, 2);
		expectUndo(called, { type: 'match.uncall', payload: { matchId: matchByNumber(s, 3).id } });
		expectUndo(called, {
			type: 'match.moveCourt',
			payload: { matchId: matchByNumber(s, 3).id, court: 3 }
		});
	});

	it('результат матча на корте, неявка из очереди, правка, стирание', () => {
		const s = runningEvent(4);
		const called = withCalled(s, 1, 1);
		const m1 = matchByNumber(s, 1).id;
		const m4 = matchByNumber(s, 4).id;
		expectUndo(called, {
			type: 'match.recordResult',
			payload: { matchId: m1, result: win('A'), expectedResult: null }
		});
		expectUndo(s, {
			type: 'match.recordResult',
			payload: {
				matchId: m4,
				result: { kind: 'walkover', winner: 'A', games: [], nonStandard: false },
				expectedResult: null
			}
		});

		const recorded = run(called, {
			type: 'match.recordResult',
			payload: { matchId: m1, result: win('A'), expectedResult: null }
		});
		const current = recorded.matches[m1]!.result!;
		expectUndo(recorded, {
			type: 'match.recordResult',
			payload: { matchId: m1, result: win('A', [[21, 19]]), expectedResult: current }
		});
		expectUndo(recorded, {
			type: 'match.clearResult',
			payload: { matchId: m1, expectedResult: current }
		});
	});

	it('команда, которая ничего не изменила, отменять нечего', () => {
		const s = runningEvent(3);
		const m1 = matchByNumber(s, 1).id;
		const recorded = run(s, {
			type: 'match.recordResult',
			payload: { matchId: m1, result: win('A'), expectedResult: null }
		});
		const again = envelope({
			type: 'match.recordResult',
			payload: { matchId: m1, result: win('A'), expectedResult: null }
		});
		expect(invertCommand(recorded, again)).toEqual([]);
	});

	it('отмена не затирает чужие изменения: матч успели перенести — конфликт', () => {
		const s = runningEvent(4, 3);
		const m3 = matchByNumber(s, 3).id;
		const call = envelope({ type: 'match.call', payload: { matchId: m3, court: 1 } });
		const applied = applyCommand(s, call);
		if (!applied.ok) throw new Error('call failed');
		const undo = invertCommand(s, call);

		// С другого устройства матч перенесли на корт 2
		const moved = run(applied.state, {
			type: 'match.moveCourt',
			payload: { matchId: m3, court: 2 }
		});
		const result = applyCommand(moved, envelope(undo[0]!));
		expect(result.ok ? null : result.error).toEqual({ code: 'match.stateChanged', matchId: m3 });
	});
});
