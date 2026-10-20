import {
	type Category,
	type Discipline,
	type Entry,
	type EventState,
	type Group,
	type Match,
	categoryCode
} from '@volan/domain';
import { MATCHES, ROUNDS, plural } from './format.js';

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
