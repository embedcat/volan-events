import {
	type Category,
	type Discipline,
	type Entry,
	type EventState,
	type GameScore,
	type Group,
	type Match,
	type MatchFormat,
	type MatchResult,
	type Side,
	type Standings,
	categoryCode,
	classifyGame,
	computeStandings,
	gamePointsAt,
	lastFinishedAt,
	matchPlayerIds
} from '@volan/domain';
import { MATCHES, ROUNDS, plural } from './format.js';
import { type NameLookup, entrySurnames } from './names.js';

export const DISCIPLINE_LABEL: Record<Discipline, string> = {
	MS: 'Мужской одиночный',
	WS: 'Женский одиночный',
	MD: 'Мужской парный',
	WD: 'Женский парный',
	XD: 'Смешанный парный',
	OS: 'Открытый одиночный',
	OD: 'Открытый парный'
};

export const DISCIPLINES = Object.keys(DISCIPLINE_LABEL) as Discipline[];

export function isDoubles(discipline: Discipline): boolean {
	return !['MS', 'WS', 'OS'].includes(discipline);
}

// Какой пол нужен в позиции участника; null — любой
export function slotGender(discipline: Discipline, slot: number): 'M' | 'F' | null {
	if (discipline === 'MS' || discipline === 'MD') return 'M';
	if (discipline === 'WS' || discipline === 'WD') return 'F';
	if (discipline === 'XD') return slot === 0 ? 'M' : 'F';
	return null;
}

export function categoryTitle(category: Category): string {
	return category.customName ?? categoryCode(category.discipline, category.level);
}

export function categoryGroup(state: EventState, categoryId: string): Group | undefined {
	const stageIds = state.categories[categoryId]?.stageIds ?? [];
	return Object.values(state.groups).find((g) => stageIds.includes(g.stageId));
}

export function groupMatches(state: EventState, groupId: string): Match[] {
	return Object.values(state.matches)
		.filter((m) => m.groupId === groupId)
		.sort((a, b) => a.number - b.number);
}

// Участники категории в порядке группы (после расписания — порядок посева)
export function categoryEntries(state: EventState, categoryId: string): Entry[] {
	const order = categoryGroup(state, categoryId)?.entryIds ?? [];
	return Object.values(state.entries)
		.filter((e) => e.categoryId === categoryId)
		.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
}

export type ScheduleInfo = { exists: boolean; matches: number; rounds: number; started: boolean };

export function scheduleInfo(state: EventState, group: Group): ScheduleInfo {
	const matches = groupMatches(state, group.id);
	return {
		exists: group.scheduleSeed !== null,
		matches: matches.length,
		rounds: Math.max(0, ...matches.map((m) => m.round)),
		started: matches.some((m) => m.status !== 'pending')
	};
}

export type ReadinessItem = { ok: boolean; text: string };

// Готовность к старту (docs/screens.md, «Настройки»)
export function readiness(state: EventState): { items: ReadinessItem[]; ready: boolean } {
	const categories = Object.values(state.categories);
	const items: ReadinessItem[] = [
		{ ok: true, text: `Событие: ${state.title}, кортов: ${state.courts.length}` },
		{
			ok: categories.length > 0,
			text:
				categories.length > 0
					? `Категория ${categoryTitle(categories[0] as Category)}`
					: 'Категория не создана'
		}
	];
	for (const category of categories) {
		const entries = Object.values(state.entries).filter((e) => e.categoryId === category.id).length;
		items.push({
			ok: entries >= 2,
			text: entries >= 2 ? `Участников: ${entries}` : `Участников: ${entries} — нужно минимум 2`
		});
		const group = categoryGroup(state, category.id);
		const schedule = group ? scheduleInfo(state, group) : null;
		items.push({
			ok: !!schedule?.exists,
			text: schedule?.exists
				? `Расписание: ${plural(schedule.matches, MATCHES)}, ${plural(schedule.rounds, ROUNDS)}`
				: 'Расписание не составлено'
		});
	}
	return { items, ready: items.every((i) => i.ok) };
}

export function matchFormat(state: EventState, match: Match): MatchFormat {
	return state.stages[match.stageId]?.format ?? state.defaultFormat;
}

// Кто где играет: игрок → номер корта
export function playerCourts(state: EventState): Map<string, number> {
	const courts = new Map<string, number>();
	for (const match of Object.values(state.matches)) {
		if (match.status !== 'on_court' || match.court === null) continue;
		for (const id of matchPlayerIds(state, match)) courts.set(id, match.court);
	}
	return courts;
}

export type SideState =
	{ kind: 'busy'; playerId: string; court: number } | { kind: 'rest'; since: string | null }; // since — конец последнего матча; null — не играл

// Сторона матча в очереди: кто-то из игроков на корте или сколько отдыхает
// (у пары — по последнему сыгравшему из двух)
export function sideState(
	state: EventState,
	entryId: string,
	courts: ReadonlyMap<string, number>
): SideState {
	const players = state.entries[entryId]?.players ?? [];
	for (const { playerId } of players) {
		const court = courts.get(playerId);
		if (court !== undefined) return { kind: 'busy', playerId, court };
	}
	let since: string | null = null;
	for (const { playerId } of players) {
		const last = lastFinishedAt(state, playerId);
		if (last && (!since || last > since)) since = last;
	}
	return { kind: 'rest', since };
}

// Счёт по партиям глазами стороны side: «21:15, 18:21»
export function gamesText(games: readonly GameScore[], side: Side = 'A'): string {
	return games.map(([a, b]) => (side === 'A' ? `${a}:${b}` : `${b}:${a}`)).join(', ');
}

// Результат в списке матчей (глазами стороны A): «21:15, 18:21, 21:19», «н/я Петров»,
// «21:15, 11:8 · отказ Петров»
export function resultText(state: EventState, lookup: NameLookup, match: Match): string {
	const result = match.result;
	if (!result) return '';
	const loser = entrySurnames(state, lookup, result.winner === 'A' ? match.sideB : match.sideA);
	const games = gamesText(result.games);
	if (result.kind === 'walkover') return `н/я ${loser}${result.byWithdrawal ? ' (снят)' : ''}`;
	if (result.kind === 'retired') return `${games ? `${games} · ` : ''}отказ ${loser}`;
	return games;
}

// Ячейка шахматки глазами строки: счёт партии (матч из одной партии) или счёт по партиям.
// При отказе недоигранная партия в счёт по партиям не входит.
export function cellText(result: MatchResult, rowSide: Side, format: MatchFormat): string {
	if (result.kind === 'walkover') return 'н/я';
	const games = rowSide === 'A' ? result.games : result.games.map(([a, b]): GameScore => [b, a]);
	if (format.bestOf === 1 && games.length === 1) {
		return result.kind === 'retired' ? `${gamesText(games)} отк.` : gamesText(games);
	}
	const counted =
		result.kind === 'retired'
			? games.filter((g, i) => classifyGame(g, gamePointsAt(format, i)).kind === 'complete')
			: games;
	const won = counted.filter(([own, rival]) => own > rival).length;
	const score = counted.length > 0 ? `${won}:${counted.length - won}` : '';
	return result.kind === 'retired' ? `${score} отк.`.trim() : score;
}

export function groupStandings(state: EventState, group: Group): Standings {
	const format = state.stages[group.stageId]?.format ?? state.defaultFormat;
	return computeStandings({
		entryIds: group.entryIds,
		withdrawn: new Set(group.entryIds.filter((id) => state.entries[id]?.status === 'withdrawn')),
		matches: groupMatches(state, group.id).map((m) => ({
			sideA: m.sideA,
			sideB: m.sideB,
			result: m.status === 'finished' ? m.result : null
		})),
		format,
		lots: group.lots
	});
}

// Жребии, которые сейчас решают равенство: без жребия этот набор остался бы равным
export function activeLots(state: EventState, group: Group): string[][] {
	return group.lots.filter((lot) =>
		groupStandings(state, { ...group, lots: group.lots.filter((l) => l !== lot) }).unresolved.some(
			(block) => block.length === lot.length && block.every((id) => lot.includes(id))
		)
	);
}
