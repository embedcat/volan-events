import { describe, expect, it } from 'vitest';
import type { MatchFormat } from './format';
import type { GameScore, MatchResultInput } from './score';
import { computeStandings, type StandingsMatch } from './standings';

const bo1: MatchFormat = { points: 21, bestOf: 1, deciderPoints: 21 };
const bo3: MatchFormat = { points: 21, bestOf: 3, deciderPoints: 21 };

// Матч, сыгранный со счётом с точки зрения a: m('A', 'B', [21, 15]) — A выиграл
function m(a: string, b: string, ...games: GameScore[]): StandingsMatch {
	const winsA = games.filter(([x, y]) => x > y).length;
	const winner = winsA * 2 > games.length ? 'A' : 'B';
	return { sideA: a, sideB: b, result: { kind: 'played', winner, games, nonStandard: false } };
}

function pending(a: string, b: string): StandingsMatch {
	return { sideA: a, sideB: b, result: null };
}

function order(entryIds: string[], matches: StandingsMatch[], format = bo1, lots: string[][] = []) {
	const s = computeStandings({ entryIds, withdrawn: new Set(), matches, format, lots });
	return s.rows.map((r) =>
		r.place === r.placeTo ? `${r.place}:${r.entryId}` : `${r.place}-${r.placeTo}:${r.entryId}`
	);
}

describe('computeStandings — места', () => {
	it('по числу побед', () => {
		const matches = [m('A', 'B', [21, 15]), m('A', 'C', [21, 10]), m('B', 'C', [21, 19])];
		expect(order(['C', 'B', 'A'], matches)).toEqual(['1:A', '2:B', '3:C']);
	});

	it('равны двое по победам — личная встреча важнее разниц', () => {
		const matches = [
			m('A', 'B', [21, 19]), // A побеждает B с минимальным перевесом
			m('B', 'C', [21, 0]),
			m('C', 'A', [21, 0]), // A крупно проигрывает C
			m('A', 'D', [21, 18]),
			m('B', 'D', [21, 0]),
			m('C', 'D', [19, 21])
		];
		// Победы: A — 2 (B, D), B — 2 (C, D), C — 1 (A), D — 1 (C).
		// У B разница очков намного лучше (+40 против −16), но личная встреча за A.
		// C и D тоже равны, D выиграл у C.
		expect(order(['A', 'B', 'C', 'D'], matches)).toEqual(['1:A', '2:B', '3:D', '4:C']);
	});

	it('равны трое — разница партий', () => {
		// Круг: A>B 2:0, B>C 2:1, C>A 2:1. Партии: A +1, C 0, B −1
		const matches = [
			m('A', 'B', [21, 15], [21, 15]),
			m('B', 'C', [21, 15], [15, 21], [21, 15]),
			m('C', 'A', [21, 15], [15, 21], [21, 15])
		];
		expect(order(['A', 'B', 'C'], matches, bo3)).toEqual(['1:A', '2:C', '3:B']);
	});

	it('равны трое — разница очков, после неё двое равны — личная встреча', () => {
		// Круг по одной партии: A>B +6, B>C +4, C>A +8. Очки: C +4, A −2, B −2; A выиграл у B
		const matches = [m('A', 'B', [21, 15]), m('B', 'C', [21, 17]), m('C', 'A', [21, 13])];
		expect(order(['A', 'B', 'C'], matches)).toEqual(['1:C', '2:A', '3:B']);
	});

	it('полное равенство трёх — общее место и требуется жребий', () => {
		const matches = [m('A', 'B', [21, 15]), m('B', 'C', [21, 15]), m('C', 'A', [21, 15])];
		const s = computeStandings({
			entryIds: ['A', 'B', 'C'],
			withdrawn: new Set(),
			matches,
			format: bo1,
			lots: []
		});
		expect(s.rows.map((r) => [r.place, r.placeTo])).toEqual([
			[1, 3],
			[1, 3],
			[1, 3]
		]);
		expect(s.complete).toBe(true);
		expect(s.unresolved).toEqual([['A', 'B', 'C']]);
	});

	it('жребий расставляет равных', () => {
		const matches = [m('A', 'B', [21, 15]), m('B', 'C', [21, 15]), m('C', 'A', [21, 15])];
		expect(order(['A', 'B', 'C'], matches, bo1, [['B', 'A', 'C']])).toEqual(['1:B', '2:A', '3:C']);
	});

	it('жребий для другого набора равных не действует', () => {
		const matches = [m('A', 'B', [21, 15]), m('B', 'C', [21, 15]), m('C', 'A', [21, 15])];
		expect(order(['A', 'B', 'C'], matches, bo1, [['B', 'A']])).toEqual(['1-3:A', '1-3:B', '1-3:C']);
	});
});

describe('computeStandings — технические результаты', () => {
	function result(kind: MatchResultInput['kind'], winner: 'A' | 'B', games: GameScore[] = []) {
		return { kind, winner, games, nonStandard: false };
	}

	it('неявка — сухая победа: 2:0 по партиям и 21:0 в каждой', () => {
		const s = computeStandings({
			entryIds: ['A', 'B'],
			withdrawn: new Set(),
			matches: [{ sideA: 'A', sideB: 'B', result: result('walkover', 'B') }],
			format: bo3,
			lots: []
		});
		const b = s.rows.find((r) => r.entryId === 'B');
		expect(b).toMatchObject({ wins: 1, gamesWon: 2, gamesLost: 0, pointsWon: 42, pointsLost: 0 });
	});

	it('отказ — тоже сухая победа, фактический счёт в таблице не учитывается', () => {
		const s = computeStandings({
			entryIds: ['A', 'B'],
			withdrawn: new Set(),
			matches: [
				{
					sideA: 'A',
					sideB: 'B',
					result: result('retired', 'B', [
						[21, 15],
						[10, 12]
					])
				}
			],
			format: bo3,
			lots: []
		});
		const a = s.rows.find((r) => r.entryId === 'A');
		expect(a).toMatchObject({
			wins: 0,
			losses: 1,
			gamesWon: 0,
			gamesLost: 2,
			pointsWon: 0,
			pointsLost: 42
		});
	});

	it('снявшийся ранжируется по результатам, с пометкой', () => {
		const s = computeStandings({
			entryIds: ['A', 'B', 'C'],
			withdrawn: new Set(['A']),
			matches: [
				m('A', 'B', [21, 10]),
				m('A', 'C', [21, 10]),
				{ sideA: 'B', sideB: 'C', result: result('played', 'A', [[21, 19]]) }
			],
			format: bo1,
			lots: []
		});
		expect(s.rows.map((r) => [r.entryId, r.place, r.withdrawn])).toEqual([
			['A', 1, true],
			['B', 2, false],
			['C', 3, false]
		]);
	});
});

describe('computeStandings — недоигранная группа', () => {
	it('несыгранные матчи не учитываются, группа не завершена', () => {
		const s = computeStandings({
			entryIds: ['A', 'B', 'C'],
			withdrawn: new Set(),
			matches: [m('A', 'B', [21, 10]), pending('A', 'C'), pending('B', 'C')],
			format: bo1,
			lots: []
		});
		expect(s.complete).toBe(false);
		expect(s.rows.find((r) => r.entryId === 'A')).toMatchObject({ played: 1, wins: 1 });
		expect(s.rows.find((r) => r.entryId === 'C')).toMatchObject({ played: 0, wins: 0 });
	});

	it('личная встреча не сыграна — решают следующие показатели', () => {
		// A и B по одной победе над C, между собой ещё не играли; у A разница очков лучше
		const matches = [m('A', 'C', [21, 5]), m('B', 'C', [21, 15]), pending('A', 'B')];
		expect(order(['B', 'A', 'C'], matches)).toEqual(['1:A', '2:B', '3:C']);
	});

	it('личная встреча не сыграна и показатели равны — общее место без жребия', () => {
		const matches = [m('A', 'C', [21, 15]), m('B', 'C', [21, 15]), pending('A', 'B')];
		const s = computeStandings({
			entryIds: ['A', 'B', 'C'],
			withdrawn: new Set(),
			matches,
			format: bo1,
			lots: []
		});
		expect(s.rows.slice(0, 2).map((r) => [r.place, r.placeTo])).toEqual([
			[1, 2],
			[1, 2]
		]);
		expect(s.complete).toBe(false);
		expect(s.unresolved).toEqual([['A', 'B']]);
	});
});
