import { applyCommand } from './apply';
import type { EventCommand, EventCommandDraft, PayloadOf } from './commands';
import type { EventState } from './state';
import { deepEqual } from './util';

// Обратные команды для «Отменить»: по состоянию до команды строим команды, которые вернут его.
// Пустой список — отменять нечего (команда ничего не изменила) или отмена не предусмотрена.
export function invertCommand(
	before: EventState | null,
	command: EventCommand
): EventCommandDraft[] {
	const applied = applyCommand(before, command);
	if (!before || !applied.ok || deepEqual(before, applied.state)) return [];
	const after = applied.state;

	switch (command.type) {
		case 'event.create':
			return []; // удаление события — отдельный запрос с подтверждением

		case 'event.update': {
			const p = command.payload;
			const prev: PayloadOf<'event.update'> = {};
			if (p.title !== undefined) prev.title = before.title;
			if (p.date !== undefined) prev.date = before.date;
			if (p.venue !== undefined) prev.venue = before.venue;
			if (p.defaultFormat !== undefined) prev.defaultFormat = before.defaultFormat;
			return [{ type: 'event.update', payload: prev }];
		}

		case 'event.setVisibility':
			return [{ type: 'event.setVisibility', payload: { visibility: before.visibility } }];

		case 'event.setCourts':
			return [
				{
					type: 'event.setCourts',
					payload: { count: before.courts.length, enabled: before.courts.map((c) => c.enabled) }
				}
			];

		case 'court.setEnabled': {
			const court = command.payload.court;
			const enabled = before.courts[court - 1]?.enabled ?? true;
			return [{ type: 'court.setEnabled', payload: { court, enabled } }];
		}

		case 'event.start':
			return [{ type: 'event.backToSetup', payload: {} }];
		case 'event.backToSetup':
			return [{ type: 'event.start', payload: {} }];
		case 'event.finish':
			return [{ type: 'event.reopen', payload: {} }];
		case 'event.reopen':
			return [{ type: 'event.finish', payload: {} }];

		case 'category.create':
			return [{ type: 'category.delete', payload: { categoryId: command.payload.id } }];

		case 'category.update': {
			const p = command.payload;
			const category = before.categories[p.categoryId];
			if (!category) return [];
			const prev: PayloadOf<'category.update'> = { categoryId: category.id };
			if (p.discipline !== undefined) prev.discipline = category.discipline;
			if (p.level !== undefined) prev.level = category.level;
			if (p.customName !== undefined) prev.customName = category.customName;
			if (p.ratingMin !== undefined) prev.ratingMin = category.ratingMin;
			if (p.ratingMax !== undefined) prev.ratingMax = category.ratingMax;
			const stage = before.stages[category.stageIds[0] ?? ''];
			if (p.format !== undefined && stage) prev.format = stage.format;
			return [{ type: 'category.update', payload: prev }];
		}

		case 'category.delete': {
			const category = before.categories[command.payload.categoryId];
			if (!category) return [];
			const inCategory = (stageId: string) => category.stageIds.includes(stageId);
			const matches = Object.values(before.matches).filter((m) => inCategory(m.stageId));
			return [
				{
					type: 'category.restore',
					payload: {
						category,
						stages: category.stageIds.flatMap((id) => before.stages[id] ?? []),
						groups: Object.values(before.groups).filter((g) => inCategory(g.stageId)),
						entries: Object.values(before.entries).filter((e) => e.categoryId === category.id),
						matches,
						queue: queuePositions(
							before,
							matches.map((m) => m.id)
						)
					}
				}
			];
		}

		case 'category.restore':
			return [{ type: 'category.delete', payload: { categoryId: command.payload.category.id } }];

		case 'entry.add':
			return [{ type: 'entry.remove', payload: { entryId: command.payload.id } }];

		case 'entry.update': {
			const entry = before.entries[command.payload.entryId];
			return entry
				? [{ type: 'entry.update', payload: { entryId: entry.id, players: entry.players } }]
				: [];
		}

		case 'entry.remove': {
			const entry = before.entries[command.payload.entryId];
			if (!entry) return [];
			const group = Object.values(before.groups).find((g) => g.entryIds.includes(entry.id));
			const position = group?.entryIds.indexOf(entry.id);
			return [
				{
					type: 'entry.add',
					payload: {
						id: entry.id,
						categoryId: entry.categoryId,
						players: entry.players,
						...(position !== undefined && position >= 0 ? { position } : {})
					}
				}
			];
		}

		case 'entry.withdraw': {
			const entryId = command.payload.entryId;
			const pending = Object.values(before.matches)
				.filter((m) => m.status === 'pending' && (m.sideA === entryId || m.sideB === entryId))
				.map((m) => m.id);
			return [
				{ type: 'entry.reinstate', payload: { entryId, queue: queuePositions(before, pending) } }
			];
		}

		case 'entry.reinstate':
			return [{ type: 'entry.withdraw', payload: { entryId: command.payload.entryId } }];

		case 'group.generateSchedule': {
			const seed = before.groups[command.payload.groupId]?.scheduleSeed ?? null;
			const groupId = command.payload.groupId;
			return seed === null
				? [{ type: 'group.clearSchedule', payload: { groupId } }]
				: [{ type: 'group.generateSchedule', payload: { groupId, seed } }];
		}

		case 'group.clearSchedule': {
			const groupId = command.payload.groupId;
			const seed = before.groups[groupId]?.scheduleSeed ?? null;
			return seed === null ? [] : [{ type: 'group.generateSchedule', payload: { groupId, seed } }];
		}

		case 'group.resolveTie': {
			const { groupId, order } = command.payload;
			const prev = findLot(before, groupId, order);
			return prev
				? [{ type: 'group.resolveTie', payload: { groupId, order: prev } }]
				: [{ type: 'group.clearTie', payload: { groupId, entryIds: order } }];
		}

		case 'group.clearTie': {
			const { groupId, entryIds } = command.payload;
			const prev = findLot(before, groupId, entryIds);
			return prev ? [{ type: 'group.resolveTie', payload: { groupId, order: prev } }] : [];
		}

		case 'queue.move': {
			const matchId = command.payload.matchId;
			return [{ type: 'queue.move', payload: { matchId, toIndex: before.queue.indexOf(matchId) } }];
		}

		case 'match.call':
		case 'match.uncall':
		case 'match.moveCourt':
		case 'match.recordResult':
		case 'match.clearResult':
			return restoreMatch(before, after, command.payload.matchId);

		case 'match.restore':
			return restoreMatch(before, after, command.payload.match.id);
	}
}

// Вернуть матч целиком — с временем вызова и местом в очереди, если до этого его никто не тронет
function restoreMatch(before: EventState, after: EventState, matchId: string): EventCommandDraft[] {
	const match = before.matches[matchId];
	const expected = after.matches[matchId];
	if (!match || !expected) return [];
	const index = before.queue.indexOf(matchId);
	return [
		{
			type: 'match.restore',
			payload: { match, queueIndex: index >= 0 ? index : null, expected }
		}
	];
}

function queuePositions(state: EventState, matchIds: string[]) {
	return matchIds
		.map((matchId) => ({ matchId, index: state.queue.indexOf(matchId) }))
		.filter(({ index }) => index >= 0);
}

function findLot(state: EventState, groupId: string, ids: string[]): string[] | undefined {
	return state.groups[groupId]?.lots.find(
		(lot) => lot.length === ids.length && ids.every((id) => lot.includes(id))
	);
}
