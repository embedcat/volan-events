import { type GamePoints, type MatchFormat, gameCap, gamePointsAt, gamesToWin } from './format';

export type Side = 'A' | 'B';
export type GameScore = readonly [number, number];

export type GameInvalidCode = 'game.invalidNumber' | 'game.overshoot' | 'game.overCap';

export type GameClass =
	| { kind: 'complete'; winner: Side }
	| { kind: 'incomplete' }
	| { kind: 'invalid'; code: GameInvalidCode };

export type MatchResultKind = 'played' | 'walkover' | 'retired';

export type MatchResultInput = {
	kind: MatchResultKind;
	winner: Side;
	games: readonly GameScore[];
	nonStandard: boolean;
};

// Номер партии в проблемах — с нуля
export type ScoreIssue =
	| { code: GameInvalidCode | 'game.notFinished' | 'game.tie'; game: number }
	| { code: 'match.extraGame'; game: number }
	| {
			code:
				| 'match.noGames'
				| 'match.tooManyGames'
				| 'match.notFinished'
				| 'match.alreadyDecided'
				| 'match.winnerMismatch'
				| 'walkover.hasGames';
	  };

function isValidNumber(n: number): boolean {
	return Number.isInteger(n) && n >= 0;
}

// Счёт партии: завершена (и кто выиграл), ещё идёт или так не бывает
export function classifyGame(score: GameScore, points: GamePoints): GameClass {
	const [a, b] = score;
	if (!isValidNumber(a) || !isValidNumber(b))
		return { kind: 'invalid', code: 'game.invalidNumber' };

	const cap = gameCap(points);
	const high = Math.max(a, b);
	const low = Math.min(a, b);
	const leader: Side = a > b ? 'A' : 'B';

	if (high > cap) return { kind: 'invalid', code: 'game.overCap' };
	if (high === cap) {
		// 30:29 и 30:28 при игре до 21; 30:30 не бывает — при 29:29 побеждает 30-е очко
		if (low === cap - 1 || low === cap - 2) return { kind: 'complete', winner: leader };
		if (low === cap) return { kind: 'invalid', code: 'game.overCap' };
		return { kind: 'invalid', code: 'game.overshoot' };
	}
	if (high < points) return { kind: 'incomplete' };
	if (high === points && low <= points - 2) return { kind: 'complete', winner: leader };

	// Игра на разницу в 2 очка
	const diff = high - low;
	if (diff <= 1) return { kind: 'incomplete' };
	if (diff === 2) return { kind: 'complete', winner: leader };
	return { kind: 'invalid', code: 'game.overshoot' };
}

export function validateMatchResult(result: MatchResultInput, format: MatchFormat): ScoreIssue[] {
	switch (result.kind) {
		case 'walkover':
			return result.games.length > 0 ? [{ code: 'walkover.hasGames' }] : [];
		case 'played':
			return result.nonStandard ? validateNonStandard(result) : validatePlayed(result, format);
		case 'retired':
			return result.nonStandard ? numberIssues(result.games) : validateRetired(result, format);
	}
}

function validatePlayed(result: MatchResultInput, format: MatchFormat): ScoreIssue[] {
	const { games } = result;
	if (games.length === 0) return [{ code: 'match.noGames' }];
	if (games.length > format.bestOf) return [{ code: 'match.tooManyGames' }];

	const need = gamesToWin(format);
	const wins: Record<Side, number> = { A: 0, B: 0 };
	const issues: ScoreIssue[] = [];
	let decided = false;

	games.forEach((game, i) => {
		const c = classifyGame(game, gamePointsAt(format, i));
		if (c.kind === 'invalid') {
			issues.push({ code: c.code, game: i });
		} else if (c.kind === 'incomplete') {
			issues.push({ code: 'game.notFinished', game: i });
		} else if (decided) {
			issues.push({ code: 'match.extraGame', game: i });
		} else {
			wins[c.winner] += 1;
			decided = wins[c.winner] === need;
		}
	});

	if (issues.length > 0) return issues;
	if (!decided) return [{ code: 'match.notFinished' }];
	const winner: Side = wins.A > wins.B ? 'A' : 'B';
	return winner === result.winner ? [] : [{ code: 'match.winnerMismatch' }];
}

// Нестандартный счёт: только здравый смысл — партии есть, ничьих нет, победитель выиграл больше
function validateNonStandard(result: MatchResultInput): ScoreIssue[] {
	const { games } = result;
	if (games.length === 0) return [{ code: 'match.noGames' }];

	const issues = numberIssues(games);
	games.forEach(([a, b], i) => {
		if (isValidNumber(a) && isValidNumber(b) && a === b) issues.push({ code: 'game.tie', game: i });
	});
	if (issues.length > 0) return issues;

	const winsA = games.filter(([a, b]) => a > b).length;
	const winsB = games.length - winsA;
	const winnerWins = result.winner === 'A' ? winsA : winsB;
	const loserWins = result.winner === 'A' ? winsB : winsA;
	return winnerWins > loserWins ? [] : [{ code: 'match.winnerMismatch' }];
}

// Отказ: завершённые партии — по правилам, последняя может быть не доиграна,
// к моменту отказа матч не решён. Победитель — тот, кто не отказался, счёт ему не помеха.
function validateRetired(result: MatchResultInput, format: MatchFormat): ScoreIssue[] {
	const { games } = result;
	if (games.length > format.bestOf) return [{ code: 'match.tooManyGames' }];

	const wins: Record<Side, number> = { A: 0, B: 0 };
	const issues: ScoreIssue[] = [];

	games.forEach((game, i) => {
		const c = classifyGame(game, gamePointsAt(format, i));
		const isLast = i === games.length - 1;
		if (c.kind === 'invalid') {
			issues.push({ code: c.code, game: i });
		} else if (c.kind === 'incomplete') {
			if (!isLast) issues.push({ code: 'game.notFinished', game: i });
		} else {
			wins[c.winner] += 1;
		}
	});

	if (issues.length > 0) return issues;
	const need = gamesToWin(format);
	return wins.A >= need || wins.B >= need ? [{ code: 'match.alreadyDecided' }] : [];
}

function numberIssues(games: readonly GameScore[]): ScoreIssue[] {
	const issues: ScoreIssue[] = [];
	games.forEach(([a, b], i) => {
		if (!isValidNumber(a) || !isValidNumber(b))
			issues.push({ code: 'game.invalidNumber', game: i });
	});
	return issues;
}

// Подстановка второго числа при вводе счёта: только если введённое число
// может быть лишь у проигравшего (до 21: 0–19 → 21, 20 → 22). Иначе — null.
export function suggestOtherScore(entered: number, points: GamePoints): number | null {
	if (!isValidNumber(entered)) return null;
	if (entered <= points - 2) return points;
	if (entered === points - 1) return points + 1;
	return null;
}
