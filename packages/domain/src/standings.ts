import { type MatchFormat, gamePointsAt, gamesToWin } from './format';
import type { GameScore, MatchResultInput } from './score';

export type StandingsMatch = {
	sideA: string;
	sideB: string;
	result: MatchResultInput | null; // null — ещё не сыгран
};

export type StandingsInput = {
	// Порядок посева: в нём же стоят участники нерешённого равенства
	entryIds: readonly string[];
	withdrawn: ReadonlySet<string>;
	matches: readonly StandingsMatch[];
	format: MatchFormat;
	// Расстановки по жребию; действуют, только если совпадает набор равных
	lots: readonly (readonly string[])[];
};

export type StandingRow = {
	entryId: string;
	// Место; при нерешённом равенстве place < placeTo («3–4»)
	place: number;
	placeTo: number;
	played: number;
	wins: number;
	losses: number;
	gamesWon: number;
	gamesLost: number;
	pointsWon: number;
	pointsLost: number;
	withdrawn: boolean;
};

export type Standings = {
	rows: StandingRow[]; // в порядке мест
	complete: boolean; // все матчи группы сыграны
	unresolved: string[][]; // наборы равных, которых не разделили ни показатели, ни жребий
};

type Stats = Omit<StandingRow, 'entryId' | 'place' | 'placeTo' | 'withdrawn'>;

// Партии для таблицы мест: неявка и отказ — сухая победа (2:0 или 1:0, очки партии : 0)
export function standingsGames(result: MatchResultInput, format: MatchFormat): GameScore[] {
	if (result.kind === 'played') return [...result.games];
	return Array.from({ length: gamesToWin(format) }, (_, i): GameScore => {
		const points = gamePointsAt(format, i);
		return result.winner === 'A' ? [points, 0] : [0, points];
	});
}

// Места по п. 2.12.1.6.3 правил: победы → личная встреча (двое) → разница партий (трое и
// больше) → разница очков → жребий. Если после очередного показателя равными остались двое —
// личная встреча. Несыгранная личная встреча пропускается (предварительные места).
export function computeStandings(input: StandingsInput): Standings {
	const stats = collectStats(input);
	const stat = (id: string): Stats => stats.get(id) ?? emptyStats();
	const gamesDiff = (id: string) => stat(id).gamesWon - stat(id).gamesLost;
	const pointsDiff = (id: string) => stat(id).pointsWon - stat(id).pointsLost;

	const headToHead = (x: string, y: string): string | null => {
		for (const { sideA, sideB, result } of input.matches) {
			if (!result) continue;
			if (sideA === x && sideB === y) return result.winner === 'A' ? x : y;
			if (sideA === y && sideB === x) return result.winner === 'A' ? y : x;
		}
		return null;
	};

	const byLots = (block: string[]): string[][] => {
		const record = input.lots.find(
			(lot) => lot.length === block.length && block.every((id) => lot.includes(id))
		);
		return record ? record.map((id) => [id]) : [block];
	};

	// Пара: личная встреча, если не сыграна — оставшиеся показатели, затем жребий
	const resolvePair = (pair: string[], fallback: ((id: string) => number)[]): string[][] => {
		const [x, y] = pair as [string, string];
		const winner = headToHead(x, y);
		if (winner) return [[winner], [winner === x ? y : x]];
		for (const key of fallback) {
			if (key(x) !== key(y)) return key(x) > key(y) ? [[x], [y]] : [[y], [x]];
		}
		return byLots(pair);
	};

	const resolveByPoints = (block: string[]): string[][] =>
		splitBy(block, pointsDiff).flatMap((sub) => {
			if (sub.length === 1) return [sub];
			if (sub.length === 2) return resolvePair(sub, []);
			return byLots(sub);
		});

	const resolveByGames = (block: string[]): string[][] =>
		splitBy(block, gamesDiff).flatMap((sub) => {
			if (sub.length === 1) return [sub];
			if (sub.length === 2) return resolvePair(sub, [pointsDiff]);
			return resolveByPoints(sub);
		});

	const blocks = splitBy([...input.entryIds], (id) => stat(id).wins).flatMap((block) => {
		if (block.length === 1) return [block];
		if (block.length === 2) return resolvePair(block, [gamesDiff, pointsDiff]);
		return resolveByGames(block);
	});

	const rows: StandingRow[] = [];
	let position = 0;
	for (const block of blocks) {
		for (const entryId of block) {
			rows.push({
				entryId,
				place: position + 1,
				placeTo: position + block.length,
				...stat(entryId),
				withdrawn: input.withdrawn.has(entryId)
			});
		}
		position += block.length;
	}

	return {
		rows,
		complete: input.matches.every((match) => match.result !== null),
		unresolved: blocks.filter((block) => block.length > 1)
	};
}

function emptyStats(): Stats {
	return {
		played: 0,
		wins: 0,
		losses: 0,
		gamesWon: 0,
		gamesLost: 0,
		pointsWon: 0,
		pointsLost: 0
	};
}

function collectStats(input: StandingsInput): Map<string, Stats> {
	const stats = new Map<string, Stats>(input.entryIds.map((id) => [id, emptyStats()]));

	for (const { sideA, sideB, result } of input.matches) {
		if (!result) continue;
		const games = standingsGames(result, input.format);
		const sides: [string, 0 | 1, 'A' | 'B'][] = [
			[sideA, 0, 'A'],
			[sideB, 1, 'B']
		];
		for (const [id, own, side] of sides) {
			const s = stats.get(id);
			if (!s) continue;
			const other = own === 0 ? 1 : 0;
			s.played += 1;
			if (result.winner === side) s.wins += 1;
			else s.losses += 1;
			for (const game of games) {
				if (game[own] > game[other]) s.gamesWon += 1;
				else s.gamesLost += 1;
				s.pointsWon += game[own];
				s.pointsLost += game[other];
			}
		}
	}

	return stats;
}

// Разбить на группы с одинаковым значением, по убыванию; внутри — исходный порядок
function splitBy(ids: string[], key: (id: string) => number): string[][] {
	const sorted = [...ids].sort((a, b) => key(b) - key(a));
	const groups: string[][] = [];
	for (const id of sorted) {
		const last = groups[groups.length - 1];
		if (last && key(last[0] as string) === key(id)) last.push(id);
		else groups.push([id]);
	}
	return groups;
}
