import type { MatchFormat } from '@volan/domain';
import { describe, expect, it } from 'vitest';
import {
	type ScoreEntry,
	type ScoreRow,
	assess,
	enterScore,
	entryFromResult,
	nextField,
	scoreComplete,
	visibleRows
} from './score-entry.js';

const bo1: MatchFormat = { points: 21, bestOf: 1, deciderPoints: 21 };
const bo3: MatchFormat = { points: 21, bestOf: 3, deciderPoints: 15 };

function rows(...games: [string, string][]): ScoreRow[] {
	const result: ScoreRow[] = games.map(([a, b]) => [a, b]);
	while (result.length < 3) result.push(['', '']);
	return result;
}

const empty = (): ScoreEntry => entryFromResult(null);

describe('scoreComplete', () => {
	it('число дописано, когда следующая цифра дала бы больше предела', () => {
		expect(scoreComplete('2', 21)).toBe(false); // может быть 21–29
		expect(scoreComplete('3', 21)).toBe(false); // может быть 30
		expect(scoreComplete('4', 21)).toBe(true);
		expect(scoreComplete('0', 21)).toBe(true);
		expect(scoreComplete('18', 21)).toBe(true);
		expect(scoreComplete('2', 15)).toBe(false); // может быть 20 или 21
		expect(scoreComplete('3', 15)).toBe(true);
		expect(scoreComplete('', 21)).toBe(false);
	});
});

describe('enterScore', () => {
	it('подставляет второе число, только если введённое бывает лишь у проигравшего', () => {
		expect(enterScore(empty(), 0, 0, '15', 21, true).rows[0]).toEqual(['15', '21']);
		expect(enterScore(empty(), 0, 1, '20', 21, true).rows[0]).toEqual(['22', '20']);
		expect(enterScore(empty(), 0, 0, '14', 15, true).rows[0]).toEqual(['14', '16']);
		expect(enterScore(empty(), 0, 0, '21', 21, true).rows[0]).toEqual(['21', '']);
		expect(enterScore(empty(), 0, 0, '23', 21, true).rows[0]).toEqual(['23', '']);
	});

	it('пока число не дописано — не подставляет', () => {
		expect(enterScore(empty(), 0, 0, '1', 21, false).rows[0]).toEqual(['1', '']);
	});

	it('устаревшую подстановку стирает, введённое вручную не трогает', () => {
		let entry = enterScore(empty(), 0, 0, '18', 21, true);
		expect(entry.suggested[0]).toEqual([false, true]);
		entry = enterScore(entry, 0, 0, '2', 21, false);
		expect(entry.rows[0]).toEqual(['2', '']);
		entry = enterScore(entry, 0, 0, '25', 21, true);
		expect(entry.rows[0]).toEqual(['25', '']);

		entry = enterScore(entry, 0, 1, '23', 21, true); // вручную
		entry = enterScore(entry, 0, 0, '15', 21, true);
		expect(entry.rows[0]).toEqual(['15', '23']);
	});
});

describe('visibleRows', () => {
	it('одна партия', () => {
		expect(visibleRows(rows(), bo1, 'played')).toBe(1);
	});

	it('до 2 побед: третья — при 1:1', () => {
		expect(visibleRows(rows(), bo3, 'played')).toBe(2);
		expect(visibleRows(rows(['21', '15'], ['21', '18']), bo3, 'played')).toBe(2);
		expect(visibleRows(rows(['21', '15'], ['18', '21']), bo3, 'played')).toBe(3);
	});

	it('строка с числами не прячется', () => {
		expect(visibleRows(rows(['21', '15'], ['21', '18'], ['5', '']), bo3, 'played')).toBe(3);
	});

	it('отказ: вторая партия — после законченной первой; неявка — без счёта', () => {
		expect(visibleRows(rows(), bo3, 'retired')).toBe(1);
		expect(visibleRows(rows(['11', '8']), bo3, 'retired')).toBe(1);
		expect(visibleRows(rows(['21', '8']), bo3, 'retired')).toBe(2);
		expect(visibleRows(rows(['21', '8']), bo3, 'walkover')).toBe(0);
	});
});

describe('nextField', () => {
	it('сначала пустое поле той же партии, затем дальше', () => {
		expect(nextField(rows(['21', '']), 2, 0, 0)).toEqual({ game: 0, side: 1 });
		expect(nextField(rows(['', '15']), 2, 0, 1)).toEqual({ game: 0, side: 0 });
		expect(nextField(rows(['21', '15']), 2, 0, 1)).toEqual({ game: 1, side: 0 });
		expect(nextField(rows(['21', '15'], ['21', '18']), 2, 1, 1)).toBeNull();
	});
});

describe('assess', () => {
	it('счёт по правилам — победитель по партиям', () => {
		const a = assess(rows(['21', '15'], ['18', '21'], ['15', '13']), bo3, 'played', null);
		expect(a.result).toEqual({
			kind: 'played',
			winner: 'A',
			games: [
				[21, 15],
				[18, 21],
				[15, 13]
			],
			nonStandard: false
		});
	});

	it('счёт не по правилам — «как есть», с перечнем проблем', () => {
		const a = assess(rows(['21', '20']), bo1, 'played', null);
		expect(a.nonStandard).toBe(true);
		expect(a.result?.winner).toBe('A');
		expect(a.issues).toEqual([{ code: 'game.notFinished', game: 0 }]);
	});

	it('пока показанные партии не заполнены — ни ошибок, ни «как есть»', () => {
		expect(assess(rows(), bo1, 'played', null).missing).toEqual({ game: 0, partial: false });
		expect(assess(rows(['21', '']), bo1, 'played', null).missing).toEqual({
			game: 0,
			partial: true
		});
		const oneGame = assess(rows(['17', '21']), bo3, 'played', null);
		expect(oneGame).toMatchObject({ result: null, issues: [], missing: { game: 1 } });
		const third = assess(rows(['21', '15'], ['15', '21']), bo3, 'played', null);
		expect(third.missing).toEqual({ game: 2, partial: false });
	});

	it('ничья по партиям не сохраняется даже «как есть»', () => {
		const a = assess(rows(['21', '15'], ['15', '21'], ['14', '14']), bo3, 'played', null);
		expect(a.result).toBeNull();
		expect(a.issues).toEqual([{ code: 'game.notFinished', game: 2 }]);
	});

	it('неявка и отказ: победитель — соперник выбранного', () => {
		expect(assess(rows(), bo3, 'walkover', null).missing).toBe('loser');
		expect(assess(rows(['21', '15']), bo3, 'walkover', 'B').result).toEqual({
			kind: 'walkover',
			winner: 'A',
			games: [],
			nonStandard: false
		});
		// отказ до начала второй партии: пустая последняя строка допустима
		expect(assess(rows(['21', '15']), bo3, 'retired', 'B').result?.games).toEqual([[21, 15]]);
		const retired = assess(rows(['11', '8']), bo1, 'retired', 'A');
		expect(retired.result).toEqual({
			kind: 'retired',
			winner: 'B',
			games: [[11, 8]],
			nonStandard: false
		});
	});
});
