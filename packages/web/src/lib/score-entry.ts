import {
	type GamePoints,
	type GameScore,
	type MatchFormat,
	type MatchResult,
	type MatchResultInput,
	type ScoreIssue,
	type Side,
	classifyGame,
	gameCap,
	gamePointsAt,
	suggestOtherScore,
	validateMatchResult
} from '@volan/domain';

// Логика окна ввода результата (docs/screens.md, «Ввод результата»): поля — строки, как в input

export type ResultMode = 'played' | 'walkover' | 'retired';
export type ScoreRow = [string, string]; // [сторона A, сторона B]; '' — пусто
export type Flags = [boolean, boolean];
export type ScoreEntry = { rows: ScoreRow[]; suggested: Flags[] };

export const MAX_GAMES = 3;

export function otherSide(side: Side): Side {
	return side === 'A' ? 'B' : 'A';
}

export function entryFromResult(result: MatchResult | null): ScoreEntry {
	const rows = Array.from({ length: MAX_GAMES }, (_, i): ScoreRow => {
		const game = result?.games[i];
		return game ? [String(game[0]), String(game[1])] : ['', ''];
	});
	return { rows, suggested: rows.map((): Flags => [false, false]) };
}

export function parseScore(value: string): number | null {
	return /^\d+$/.test(value) ? Number(value) : null;
}

// Число дописано: ещё одна цифра дала бы больше предела партии (до 21: «4» — да, «2» — ждём)
export function scoreComplete(value: string, points: GamePoints): boolean {
	const n = parseScore(value);
	return n !== null && (value.length >= 2 || n === 0 || n * 10 > gameCap(points));
}

function rowGame(row: ScoreRow | undefined): GameScore | null {
	const a = parseScore(row?.[0] ?? '');
	const b = parseScore(row?.[1] ?? '');
	return a === null || b === null ? null : [a, b];
}

function rowWinner(rows: ScoreRow[], format: MatchFormat, index: number): Side | null {
	const game = rowGame(rows[index]);
	if (!game) return null;
	const c = classifyGame(game, gamePointsAt(format, index));
	return c.kind === 'complete' ? c.winner : null;
}

// Ввод в поле. final — число дописано (или поле покинуто): тогда второе число партии
// подставляется, если введённое бывает только у проигравшего (D70). Подставленное раньше
// и уже не подходящее — стирается; введённое вручную не трогается.
export function enterScore(
	entry: ScoreEntry,
	game: number,
	side: 0 | 1,
	value: string,
	points: GamePoints,
	final: boolean
): ScoreEntry {
	const rows = entry.rows.map((r): ScoreRow => [r[0], r[1]]);
	const suggested = entry.suggested.map((f): Flags => [f[0], f[1]]);
	const row = rows[game];
	const flags = suggested[game];
	if (!row || !flags) return entry;
	const other = side === 0 ? 1 : 0;
	row[side] = value;
	flags[side] = false;
	if (row[other] === '' || flags[other]) {
		const n = parseScore(value);
		const hint = final && n !== null ? suggestOtherScore(n, points) : null;
		row[other] = hint === null ? '' : String(hint);
		flags[other] = hint !== null;
	}
	return { rows, suggested };
}

// Сколько строк партий показать: при матче до 2 побед — две (при отказе вторая появляется
// после законченной первой), третья — при 1:1. Строка с введёнными числами не прячется.
export function visibleRows(rows: ScoreRow[], format: MatchFormat, mode: ResultMode): number {
	if (mode === 'walkover') return 0;
	const first = rowWinner(rows, format, 0);
	const second = rowWinner(rows, format, 1);
	let count = mode === 'played' || first ? 2 : 1;
	if (first && second && first !== second) count = 3;
	rows.forEach((row, i) => {
		if (row[0] !== '' || row[1] !== '') count = Math.max(count, i + 1);
	});
	return Math.min(format.bestOf, count);
}

// Куда перейти после ввода: пустое поле этой же партии, затем первое пустое дальше
export function nextField(rows: ScoreRow[], visible: number, game: number, side: 0 | 1) {
	const other = side === 0 ? 1 : 0;
	if (rows[game]?.[other] === '') return { game, side: other };
	for (let g = game + 1; g < visible; g++) {
		for (const s of [0, 1] as const) if (rows[g]?.[s] === '') return { game: g, side: s };
	}
	return null;
}

export type Assessment = {
	result: MatchResultInput | null; // что сохранится; null — сохранить нельзя
	nonStandard: boolean; // счёт не по правилам — сохраняется «как есть»
	issues: ScoreIssue[]; // что не так по правилам
	// Чего не хватает: выбрать, кто не явился (отказался), или заполнить партию
	missing: 'loser' | { game: number; partial: boolean } | null;
};

// Что получится из введённого: результат по правилам, «как есть» или ничего.
// В сыгранном матче нужны все показанные партии: пока их вводят, ошибок не показываем.
// При отказе последняя показанная партия может остаться пустой — отказ до её начала.
export function assess(
	rows: ScoreRow[],
	format: MatchFormat,
	mode: ResultMode,
	loser: Side | null
): Assessment {
	const none = { result: null, nonStandard: false, issues: [] };
	const visible = rows.slice(0, visibleRows(rows, format, mode));
	const filled = (r: ScoreRow) => r[0] !== '' && r[1] !== '';
	const partial = visible.findIndex((r) => (r[0] === '') !== (r[1] === ''));
	if (partial >= 0) return { ...none, missing: { game: partial, partial: true } };
	const empty = visible.findIndex((r) => !filled(r));
	if (mode === 'played' && empty >= 0) return { ...none, missing: { game: empty, partial: false } };
	if (mode !== 'played' && loser === null) return { ...none, missing: 'loser' };

	const games = visible.flatMap((r) => {
		const game = rowGame(r);
		return game ? [game] : [];
	});
	// Сыгранный матч: победитель — кто выиграл больше партий; правила проверит validate
	const winsA = games.filter(([a, b]) => a > b).length;
	const winner: Side =
		mode === 'played' ? (winsA > games.length - winsA ? 'A' : 'B') : otherSide(loser ?? 'A');
	const standard: MatchResultInput = { kind: mode, winner, games, nonStandard: false };
	const issues = validateMatchResult(standard, format);
	if (issues.length === 0) return { result: standard, nonStandard: false, issues, missing: null };

	const relaxed: MatchResultInput = { ...standard, nonStandard: true };
	const fits = validateMatchResult(relaxed, format).length === 0;
	return { result: fits ? relaxed : null, nonStandard: fits, issues, missing: null };
}
