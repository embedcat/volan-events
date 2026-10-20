import type { EventState } from '@volan/domain';

export type PlayerName = { lastName: string; firstName: string };
export type NameLookup = (playerId: string) => PlayerName | undefined;

// Имена везде — «Фамилия Имя» (D68)
export function playerName(lookup: NameLookup, playerId: string): string {
	const name = lookup(playerId);
	return name ? `${name.lastName} ${name.firstName}` : 'Игрок';
}

// Пара — «Иванов Иван / Сидоров Сергей»
export function entryName(state: EventState, lookup: NameLookup, entryId: string): string {
	const entry = state.entries[entryId];
	if (!entry) return '—';
	return entry.players.map((p) => playerName(lookup, p.playerId)).join(' / ');
}

// Коротко, только фамилии: «Петров», «Иванов / Сидоров»
export function entrySurnames(state: EventState, lookup: NameLookup, entryId: string): string {
	const entry = state.entries[entryId];
	if (!entry) return '—';
	return entry.players.map((p) => lookup(p.playerId)?.lastName ?? 'Игрок').join(' / ');
}

// Поиск без учёта регистра и разницы «е/ё»
export function normalize(text: string): string {
	return text.toLocaleLowerCase('ru').replaceAll('ё', 'е').trim();
}
