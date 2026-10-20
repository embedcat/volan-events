import {
	type EventCommand,
	type EventState,
	type PublicPlayer,
	STATE_VERSION
} from '@volan/domain';

// Выгрузка события в файл (D147, формат — docs/data-model.md, «Выгрузка события»)
export type EventExport = {
	format: 'volan-event';
	formatVersion: 1;
	exportedAt: string;
	stateVersion: number;
	version: number;
	event: EventState;
	players: PublicPlayer[];
	commands: { seq: number; command: EventCommand }[];
};

// Все игроки события: заявки и фактические составы сыгранных матчей
export function eventPlayerIds(state: EventState): string[] {
	const ids = new Set<string>();
	for (const entry of Object.values(state.entries)) {
		for (const p of entry.players) ids.add(p.playerId);
	}
	for (const match of Object.values(state.matches)) {
		for (const id of [...(match.lineupA ?? []), ...(match.lineupB ?? [])]) ids.add(id);
	}
	return [...ids];
}

// Только открытые поля: файл могут передать дальше (закрытые поля — D107)
function openFields(player: PublicPlayer & Record<string, unknown>): PublicPlayer {
	const { id, lastName, firstName, gender, club, rating, mergedIntoId, createdBy } = player;
	return { id, lastName, firstName, gender, club, rating, mergedIntoId, createdBy };
}

export function buildExport(input: {
	state: EventState;
	version: number;
	players: (PublicPlayer & Record<string, unknown>)[];
	commands: { seq: number; command: EventCommand }[];
	exportedAt: string;
}): EventExport {
	return {
		format: 'volan-event',
		formatVersion: 1,
		exportedAt: input.exportedAt,
		stateVersion: STATE_VERSION,
		version: input.version,
		event: input.state,
		players: input.players.map(openFields).sort((a, b) => a.id.localeCompare(b.id)),
		commands: [...input.commands].sort((a, b) => a.seq - b.seq)
	};
}

// «2026-10-26 Кубок клуба Волан.json»: без символов, которые не любят файловые системы
export function exportFileName(state: Pick<EventState, 'date' | 'title'>): string {
	const title = state.title
		.replace(/[\\/:*?"<>|«»]/g, '')
		.replace(/\s+/g, ' ')
		.trim();
	return `${state.date} ${title || 'событие'}.json`;
}
