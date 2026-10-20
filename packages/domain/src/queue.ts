import type { EventState, Match } from './state';

export function entryPlayerIds(state: EventState, entryId: string): string[] {
	return state.entries[entryId]?.players.map((p) => p.playerId) ?? [];
}

export function matchPlayerIds(state: EventState, match: Match): string[] {
	return [...entryPlayerIds(state, match.sideA), ...entryPlayerIds(state, match.sideB)];
}

// Игроки, которые сейчас на кортах (в любой категории события)
export function busyPlayerIds(state: EventState): Set<string> {
	const busy = new Set<string>();
	for (const match of Object.values(state.matches)) {
		if (match.status === 'on_court') matchPlayerIds(state, match).forEach((id) => busy.add(id));
	}
	return busy;
}

export function matchOnCourt(state: EventState, court: number): Match | undefined {
	return Object.values(state.matches).find((m) => m.status === 'on_court' && m.court === court);
}

// Подсказка на освободившийся корт: первый матч очереди, где никто из игроков не на корте
export function suggestMatch(state: EventState): Match | undefined {
	const busy = busyPlayerIds(state);
	for (const id of state.queue) {
		const match = state.matches[id];
		if (match && !matchPlayerIds(state, match).some((p) => busy.has(p))) return match;
	}
	return undefined;
}

// Подсказки сразу для всех свободных включённых кортов: по порядку номеров каждому —
// первый матч очереди, где никто не на корте и не в подсказке для корта раньше
export function suggestForCourts(state: EventState): Map<number, Match> {
	const taken = busyPlayerIds(state);
	const suggestions = new Map<number, Match>();
	for (const court of state.courts) {
		if (!court.enabled || matchOnCourt(state, court.number)) continue;
		const match = state.queue
			.map((id) => state.matches[id])
			.find((m) => m && !matchPlayerIds(state, m).some((p) => taken.has(p)));
		if (!match) break; // остальным кортам подходящего матча тоже нет
		suggestions.set(court.number, match);
		matchPlayerIds(state, match).forEach((p) => taken.add(p));
	}
	return suggestions;
}

// Когда игрок закончил последний матч — для показа времени отдыха
export function lastFinishedAt(state: EventState, playerId: string): string | null {
	let last: string | null = null;
	for (const match of Object.values(state.matches)) {
		if (match.status !== 'finished' || !match.finishedAt) continue;
		const players = [...(match.lineupA ?? []), ...(match.lineupB ?? [])];
		if (players.includes(playerId) && (!last || match.finishedAt > last)) last = match.finishedAt;
	}
	return last;
}
