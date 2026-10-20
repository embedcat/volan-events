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
