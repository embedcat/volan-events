import {
	type EventCommand,
	type EventCommandDraft,
	type EventState,
	type Match,
	applyCommand
} from '@volan/domain';
import { describe, expect, it } from 'vitest';
import {
	activeLots,
	cellText,
	groupStandings,
	playerCourts,
	resultText,
	sideState
} from './event-view.js';

const bo1 = { points: 21, bestOf: 1, deciderPoints: 21 } as const;
let minute = 0;

function run(state: EventState | null, ...drafts: EventCommandDraft[]): EventState {
	let current = state;
	for (const draft of drafts) {
		minute += 1;
		const command = {
			...draft,
			id: `c${minute}`,
			scope: 'event',
			eventId: 'ev',
			issuedAt: new Date(Date.UTC(2026, 9, 26, 10, minute)).toISOString(),
			deviceId: 'dev',
			schemaVersion: 1
		} as EventCommand;
		const result = applyCommand(current, command);
		if (!result.ok) throw new Error(`${draft.type}: ${JSON.stringify(result.error)}`);
		current = result.state;
	}
	if (!current) throw new Error('no state');
	return current;
}

// Одиночки e1…en (игроки p1…pn), расписание составлено, турнир идёт
function running(n: number): EventState {
	let s = run(
		null,
		{
			type: 'event.create',
			payload: {
				title: 'Т',
				date: '2026-10-26',
				venue: null,
				courts: 2,
				defaultFormat: bo1,
				ownerId: 'u'
			}
		},
		{
			type: 'category.create',
			payload: {
				id: 'cat',
				discipline: 'MS',
				level: null,
				customName: null,
				ratingMin: null,
				ratingMax: null
			}
		}
	);
	for (let i = 1; i <= n; i++) {
		s = run(s, {
			type: 'entry.add',
			payload: {
				id: `e${i}`,
				categoryId: 'cat',
				players: [{ playerId: `p${i}`, gender: 'M', rating: 1000 - i * 100, club: null }]
			}
		});
	}
	return run(
		s,
		{ type: 'group.generateSchedule', payload: { groupId: 'cat/A', seed: 1 } },
		{ type: 'event.start', payload: {} }
	);
}

function between(s: EventState, x: string, y: string): Match {
	const match = Object.values(s.matches).find(
		(m) => (m.sideA === x && m.sideB === y) || (m.sideA === y && m.sideB === x)
	);
	if (!match) throw new Error(`нет матча ${x}–${y}`);
	return match;
}

// Победа x над y: 21:10 в одной партии
function win(s: EventState, x: string, y: string): EventState {
	const m = between(s, x, y);
	const winner = m.sideA === x ? 'A' : 'B';
	return run(s, {
		type: 'match.recordResult',
		payload: {
			matchId: m.id,
			result: {
				kind: 'played',
				winner,
				games: [winner === 'A' ? [21, 10] : [10, 21]],
				nonStandard: false
			},
			expectedResult: null
		}
	});
}

const names = (id: string) => ({ lastName: id.toUpperCase(), firstName: 'И' });

describe('очередь', () => {
	it('сторона на корте или отдыхает с конца последнего матча', () => {
		let s = running(4);
		const m = between(s, 'e1', 'e4');
		s = run(s, { type: 'match.call', payload: { matchId: m.id, court: 2 } });
		expect(sideState(s, 'e1', playerCourts(s))).toEqual({ kind: 'busy', playerId: 'p1', court: 2 });
		expect(sideState(s, 'e2', playerCourts(s))).toEqual({ kind: 'rest', since: null });

		s = win(s, 'e1', 'e4');
		const finishedAt = s.matches[m.id]?.finishedAt;
		expect(sideState(s, 'e4', playerCourts(s))).toEqual({ kind: 'rest', since: finishedAt });
	});
});

describe('тексты результата', () => {
	it('список матчей и шахматка', () => {
		let s = running(3);
		s = win(s, 'e1', 'e2');
		const played = between(s, 'e1', 'e2');
		const rowSide = played.sideA === 'e2' ? 'A' : 'B';
		expect(cellText(played.result!, rowSide, bo1)).toBe('10:21');

		const m = between(s, 'e1', 'e3');
		s = run(s, {
			type: 'match.recordResult',
			payload: {
				matchId: m.id,
				result: { kind: 'walkover', winner: 'A', games: [], nonStandard: false },
				expectedResult: null
			}
		});
		const walkover = s.matches[m.id]!;
		expect(resultText(s, names, walkover)).toBe(`н/я ${walkover.sideB.replace('e', 'P')}`);
		expect(cellText(walkover.result!, 'A', bo1)).toBe('н/я');

		const retired = { kind: 'retired', winner: 'B', games: [[11, 8]], nonStandard: false };
		const other = between(s, 'e2', 'e3');
		s = run(s, {
			type: 'match.recordResult',
			payload: { matchId: other.id, result: retired as never, expectedResult: null }
		});
		const done = s.matches[other.id]!;
		expect(resultText(s, names, done)).toBe(`11:8 · отказ ${done.sideA.replace('e', 'P')}`);
		expect(cellText(done.result!, 'A', bo1)).toBe('11:8 отк.');

		// до 2 побед: недоигранная партия при отказе в счёт по партиям не входит
		const bo3 = { points: 21, bestOf: 3, deciderPoints: 15 } as const;
		const games: [number, number][] = [
			[21, 15],
			[5, 3]
		];
		const result = { kind: 'retired', winner: 'A', games, nonStandard: false, byWithdrawal: false };
		expect(cellText(result as never, 'A', bo3)).toBe('1:0 отк.');
		expect(cellText(result as never, 'B', bo3)).toBe('0:1 отк.');
	});
});

describe('таблица', () => {
	it('круговое равенство решается жребием, жребий отмечается как действующий', () => {
		let s = running(3);
		s = win(win(win(s, 'e1', 'e2'), 'e2', 'e3'), 'e3', 'e1');
		const group = s.groups['cat/A']!;
		expect(groupStandings(s, group).unresolved).toEqual([['e1', 'e2', 'e3']]);

		s = run(s, {
			type: 'group.resolveTie',
			payload: { groupId: 'cat/A', order: ['e3', 'e1', 'e2'] }
		});
		const resolved = s.groups['cat/A']!;
		expect(groupStandings(s, resolved).rows.map((r) => r.entryId)).toEqual(['e3', 'e1', 'e2']);
		expect(activeLots(s, resolved)).toEqual([['e3', 'e1', 'e2']]);
	});
});
