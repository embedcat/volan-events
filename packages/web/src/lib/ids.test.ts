import { describe, expect, it } from 'vitest';
import { groupEvents, type EventSummary } from './events.js';
import { uuidv7 } from './ids.js';

describe('uuidv7', () => {
	it('формат UUID версии 7, начало — время', () => {
		const id = uuidv7(Date.UTC(2026, 9, 26));
		expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
		const later = uuidv7(Date.UTC(2026, 9, 27));
		expect(later > id).toBe(true);
	});
});

describe('groupEvents', () => {
	const event = (id: string, date: string, progress: EventSummary['progress']): EventSummary => ({
		id,
		title: id,
		date,
		venue: null,
		visibility: 'published',
		progress,
		ownerId: 'u',
		updatedAt: ''
	});

	it('идут, предстоят (ближайшие сверху), прошли (последние сверху)', () => {
		const groups = groupEvents(
			[
				event('old', '2026-09-01', 'finished'),
				event('later', '2026-12-01', 'setup'),
				event('now', '2026-10-20', 'running'),
				event('soon', '2026-11-01', 'setup'),
				event('forgotten', '2026-10-01', 'setup')
			],
			'2026-10-20'
		);
		expect(groups.running.map((e) => e.id)).toEqual(['now']);
		expect(groups.upcoming.map((e) => e.id)).toEqual(['soon', 'later']);
		expect(groups.past.map((e) => e.id)).toEqual(['forgotten', 'old']);
	});
});
