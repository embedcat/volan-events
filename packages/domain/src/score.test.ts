import { describe, expect, it } from 'vitest';
import type { MatchFormat } from './format';
import {
	classifyGame,
	suggestOtherScore,
	validateMatchResult,
	type MatchResultInput
} from './score';

const to21: MatchFormat = { points: 21, bestOf: 1, deciderPoints: 21 };
const bo3: MatchFormat = { points: 21, bestOf: 3, deciderPoints: 21 };
const bo3ShortDecider: MatchFormat = { points: 21, bestOf: 3, deciderPoints: 15 };

function played(games: [number, number][], winner: 'A' | 'B'): MatchResultInput {
	return { kind: 'played', winner, games, nonStandard: false };
}

describe('classifyGame — партия до 21 (предел 30)', () => {
	it.each([
		[21, 0, 'A'],
		[19, 21, 'B'],
		[21, 19, 'A'],
		[22, 20, 'A'],
		[27, 29, 'B'],
		[30, 29, 'A'],
		[28, 30, 'B']
	] as const)('%i:%i — завершена, победа %s', (a, b, winner) => {
		expect(classifyGame([a, b], 21)).toEqual({ kind: 'complete', winner });
	});

	it.each([
		[0, 0],
		[20, 19],
		[20, 20],
		[21, 20],
		[25, 25],
		[29, 28],
		[29, 29]
	] as const)('%i:%i — не завершена', (a, b) => {
		expect(classifyGame([a, b], 21)).toEqual({ kind: 'incomplete' });
	});

	it.each([
		[22, 19, 'game.overshoot'],
		[23, 20, 'game.overshoot'],
		[25, 21, 'game.overshoot'],
		[30, 27, 'game.overshoot'],
		[30, 30, 'game.overCap'],
		[31, 29, 'game.overCap'],
		[-1, 21, 'game.invalidNumber'],
		[21.5, 3, 'game.invalidNumber']
	] as const)('%i:%i — невозможный счёт (%s)', (a, b, code) => {
		expect(classifyGame([a, b], 21)).toEqual({ kind: 'invalid', code });
	});
});

describe('classifyGame — партия до 15 (предел 21)', () => {
	it.each([
		[15, 13, 'A'],
		[14, 16, 'B'],
		[21, 19, 'A'],
		[21, 20, 'A']
	] as const)('%i:%i — завершена, победа %s', (a, b, winner) => {
		expect(classifyGame([a, b], 15)).toEqual({ kind: 'complete', winner });
	});

	it.each([
		[15, 14],
		[20, 20]
	] as const)('%i:%i — не завершена', (a, b) => {
		expect(classifyGame([a, b], 15)).toEqual({ kind: 'incomplete' });
	});

	it.each([
		[17, 14, 'game.overshoot'],
		[21, 15, 'game.overshoot'],
		[21, 21, 'game.overCap'],
		[22, 20, 'game.overCap']
	] as const)('%i:%i — невозможный счёт (%s)', (a, b, code) => {
		expect(classifyGame([a, b], 15)).toEqual({ kind: 'invalid', code });
	});
});

describe('validateMatchResult — сыгранный матч', () => {
	it('одна партия: корректный счёт', () => {
		expect(validateMatchResult(played([[21, 15]], 'A'), to21)).toEqual([]);
	});

	it('одна партия: победитель не совпадает со счётом', () => {
		expect(validateMatchResult(played([[21, 15]], 'B'), to21)).toEqual([
			{ code: 'match.winnerMismatch' }
		]);
	});

	it('нет ни одной партии', () => {
		expect(validateMatchResult(played([], 'A'), to21)).toEqual([{ code: 'match.noGames' }]);
	});

	it('партий больше, чем позволяет формат', () => {
		expect(
			validateMatchResult(
				played(
					[
						[21, 15],
						[21, 10]
					],
					'A'
				),
				to21
			)
		).toEqual([{ code: 'match.tooManyGames' }]);
	});

	it('незавершённая партия указывает номер партии (с нуля)', () => {
		expect(validateMatchResult(played([[21, 20]], 'A'), to21)).toEqual([
			{ code: 'game.notFinished', game: 0 }
		]);
	});

	it('до 2 побед: 2:0 и 2:1', () => {
		expect(
			validateMatchResult(
				played(
					[
						[21, 15],
						[21, 18]
					],
					'A'
				),
				bo3
			)
		).toEqual([]);
		expect(
			validateMatchResult(
				played(
					[
						[21, 15],
						[18, 21],
						[19, 21]
					],
					'B'
				),
				bo3
			)
		).toEqual([]);
	});

	it('до 2 побед: третья партия после 2:0 лишняя', () => {
		expect(
			validateMatchResult(
				played(
					[
						[21, 15],
						[21, 18],
						[21, 0]
					],
					'A'
				),
				bo3
			)
		).toEqual([{ code: 'match.extraGame', game: 2 }]);
	});

	it('до 2 побед: при 1:1 матч не завершён', () => {
		expect(
			validateMatchResult(
				played(
					[
						[21, 15],
						[18, 21]
					],
					'A'
				),
				bo3
			)
		).toEqual([{ code: 'match.notFinished' }]);
	});

	it('короткая решающая: третья партия по правилам игры до 15', () => {
		expect(
			validateMatchResult(
				played(
					[
						[21, 15],
						[18, 21],
						[15, 12]
					],
					'A'
				),
				bo3ShortDecider
			)
		).toEqual([]);
		expect(
			validateMatchResult(
				played(
					[
						[21, 15],
						[18, 21],
						[21, 15]
					],
					'A'
				),
				bo3ShortDecider
			)
		).toEqual([{ code: 'game.overshoot', game: 2 }]);
	});
});

describe('validateMatchResult — нестандартный счёт', () => {
	function nonStandard(games: [number, number][], winner: 'A' | 'B'): MatchResultInput {
		return { kind: 'played', winner, games, nonStandard: true };
	}

	it('любые очки и число партий, если победитель выиграл больше партий', () => {
		expect(
			validateMatchResult(
				nonStandard(
					[
						[11, 5],
						[11, 8]
					],
					'A'
				),
				to21
			)
		).toEqual([]);
	});

	it('ничья в партии недопустима', () => {
		expect(validateMatchResult(nonStandard([[11, 11]], 'A'), to21)).toEqual([
			{ code: 'game.tie', game: 0 }
		]);
	});

	it('при равенстве партий победителя нет', () => {
		expect(
			validateMatchResult(
				nonStandard(
					[
						[11, 5],
						[5, 11]
					],
					'A'
				),
				to21
			)
		).toEqual([{ code: 'match.winnerMismatch' }]);
	});

	it('хотя бы одна партия', () => {
		expect(validateMatchResult(nonStandard([], 'A'), to21)).toEqual([{ code: 'match.noGames' }]);
	});
});

describe('validateMatchResult — отказ', () => {
	function retired(games: [number, number][], winner: 'A' | 'B'): MatchResultInput {
		return { kind: 'retired', winner, games, nonStandard: false };
	}

	it('отказ до начала игры', () => {
		expect(validateMatchResult(retired([], 'A'), bo3)).toEqual([]);
	});

	it('отказ по ходу партии: последняя партия не завершена', () => {
		expect(
			validateMatchResult(
				retired(
					[
						[21, 15],
						[10, 12]
					],
					'B'
				),
				bo3
			)
		).toEqual([]);
	});

	it('отказ между партиями: последняя партия завершена', () => {
		expect(validateMatchResult(retired([[15, 21]], 'B'), bo3)).toEqual([]);
	});

	it('завершённые партии проверяются по правилам', () => {
		expect(
			validateMatchResult(
				retired(
					[
						[25, 3],
						[1, 0]
					],
					'A'
				),
				bo3
			)
		).toEqual([{ code: 'game.overshoot', game: 0 }]);
	});

	it('последняя партия может быть только незавершённой или завершённой, но не невозможной', () => {
		expect(validateMatchResult(retired([[25, 3]], 'A'), bo3)).toEqual([
			{ code: 'game.overshoot', game: 0 }
		]);
	});

	it('к моменту отказа матч не должен быть решён', () => {
		expect(
			validateMatchResult(
				retired(
					[
						[21, 15],
						[21, 10]
					],
					'B'
				),
				bo3
			)
		).toEqual([{ code: 'match.alreadyDecided' }]);
	});
});

describe('validateMatchResult — неявка', () => {
	it('без партий', () => {
		expect(
			validateMatchResult({ kind: 'walkover', winner: 'A', games: [], nonStandard: false }, bo3)
		).toEqual([]);
	});

	it('партий быть не должно', () => {
		expect(
			validateMatchResult(
				{ kind: 'walkover', winner: 'A', games: [[21, 0]], nonStandard: false },
				bo3
			)
		).toEqual([{ code: 'walkover.hasGames' }]);
	});
});

describe('suggestOtherScore — подстановка второго числа', () => {
	it.each([
		[0, 21],
		[15, 21],
		[19, 21],
		[20, 22]
	] as const)('до 21: %i → %i', (entered, other) => {
		expect(suggestOtherScore(entered, 21)).toBe(other);
	});

	it.each([21, 23, 29, 30])('до 21: %i — неоднозначно', (entered) => {
		expect(suggestOtherScore(entered, 21)).toBeNull();
	});

	it.each([
		[13, 15],
		[14, 16]
	] as const)('до 15: %i → %i', (entered, other) => {
		expect(suggestOtherScore(entered, 15)).toBe(other);
	});

	it('до 15: 15 — неоднозначно', () => {
		expect(suggestOtherScore(15, 15)).toBeNull();
	});
});
