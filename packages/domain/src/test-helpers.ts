// Помощники для тестов: короткие команды, последовательное применение, типовое событие
import { applyCommand } from './apply';
import type { EventCommand, EventCommandDraft } from './commands';
import type { DomainError } from './errors';
import type { EventState } from './state';

let counter = 0;

export function resetIds(): void {
	counter = 0;
}

// Конверт с предсказуемым ID и временем: каждая команда на минуту позже предыдущей
export function envelope(draft: EventCommandDraft): EventCommand {
	counter += 1;
	const minutes = String(counter % 60).padStart(2, '0');
	const hours = String(10 + Math.floor(counter / 60)).padStart(2, '0');
	return {
		...draft,
		id: `c${counter}`,
		scope: 'event',
		eventId: 'ev',
		issuedAt: `2026-10-26T${hours}:${minutes}:00.000Z`,
		deviceId: 'dev',
		schemaVersion: 1
	} as EventCommand;
}

export function run(state: EventState | null, ...drafts: EventCommandDraft[]): EventState {
	let current = state;
	for (const draft of drafts) {
		const result = applyCommand(current, envelope(draft));
		if (!result.ok) {
			throw new Error(`${draft.type}: ${JSON.stringify(result.error)}`);
		}
		current = result.state;
	}
	if (!current) throw new Error('no state');
	return current;
}

export function failOf(state: EventState | null, draft: EventCommandDraft): DomainError {
	const result = applyCommand(state, envelope(draft));
	if (result.ok) throw new Error(`${draft.type}: ожидалась ошибка`);
	return result.error;
}

export function lastId(): string {
	return `c${counter}`;
}

export const bo1 = { points: 21, bestOf: 1, deciderPoints: 21 } as const;

export function createEvent(courts = 2): EventState {
	return run(null, {
		type: 'event.create',
		payload: {
			title: 'Турнир',
			date: '2026-10-26',
			venue: null,
			courts,
			defaultFormat: bo1,
			ownerId: 'owner'
		}
	});
}

export function player(id: string, rating: number | null = null, gender: 'M' | 'F' = 'M') {
	return { playerId: id, gender, rating, club: null };
}

// Событие с категорией MS из n одиночек: e1 сильнейший (рейтинг по убыванию), игроки p1…pn
export function eventWithEntries(n: number, courts = 2): EventState {
	let state = run(createEvent(courts), {
		type: 'category.create',
		payload: {
			id: 'cat',
			discipline: 'MS',
			level: 'B',
			customName: null,
			ratingMin: null,
			ratingMax: null
		}
	});
	for (let i = 1; i <= n; i++) {
		state = run(state, {
			type: 'entry.add',
			payload: { id: `e${i}`, categoryId: 'cat', players: [player(`p${i}`, 1000 - i * 100)] }
		});
	}
	return state;
}

export const GROUP = 'cat/A';

// Событие с составленным расписанием и начатым турниром
export function runningEvent(n: number, courts = 2): EventState {
	return run(
		eventWithEntries(n, courts),
		{ type: 'group.generateSchedule', payload: { groupId: GROUP, seed: 1 } },
		{ type: 'event.start', payload: {} }
	);
}

export function matchByNumber(state: EventState, number: number) {
	const match = Object.values(state.matches).find((m) => m.number === number);
	if (!match) throw new Error(`нет матча №${number}`);
	return match;
}

export function pairOf(state: EventState, number: number): string {
	const m = matchByNumber(state, number);
	return `${m.sideA}-${m.sideB}`;
}
