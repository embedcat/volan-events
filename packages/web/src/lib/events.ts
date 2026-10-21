import type { EventCommand } from '@volan/domain';

// Краткое описание события в списках (ответ GET /api/events)
export type EventSummary = {
	id: string;
	title: string;
	date: string;
	venue: string | null;
	visibility: 'draft' | 'published';
	progress: 'setup' | 'running' | 'finished';
	ownerId: string;
	updatedAt: string;
};

// Идут → предстоят (ближайшие сверху) → прошли (последние сверху)
export function groupEvents(events: EventSummary[], today: string) {
	const running = events.filter((e) => e.progress === 'running');
	const upcoming = events
		.filter((e) => e.progress === 'setup' && e.date >= today)
		.sort((a, b) => a.date.localeCompare(b.date));
	const past = events
		.filter((e) => e.progress === 'finished' || (e.progress === 'setup' && e.date < today))
		.sort((a, b) => b.date.localeCompare(a.date));
	return { running, upcoming, past };
}

// Событие, созданное на этом устройстве и ещё не дошедшее до сервера
export function pendingSummary(command: EventCommand): EventSummary | null {
	if (command.type !== 'event.create') return null;
	const { title, date, venue, ownerId } = command.payload;
	return {
		id: command.eventId,
		title,
		date,
		venue,
		visibility: 'draft',
		progress: 'setup',
		ownerId,
		updatedAt: command.issuedAt
	};
}
