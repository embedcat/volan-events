import { ApiError, api } from '#lib/api.js';
import { type EventSummary, pendingSummary } from '#lib/events.js';
import { requireLogin } from '#lib/guard.js';
import { localDb } from '#lib/local-db.js';
import { apiErrorText } from '#lib/messages.js';
import { outbox } from '#lib/outbox.svelte.js';
import type { PageLoad } from './$types';

// Без сети — список с прошлой загрузки; созданные здесь и не отправленные — тоже в списке
export const load: PageLoad = async ({ parent, url }) => {
	await parent();
	requireLogin(url);
	let events: EventSummary[];
	let offline = false;
	try {
		events = (await api<{ events: EventSummary[] }>('/events?owner=me')).events;
		void localDb.setMeta('myEvents', events);
	} catch (e) {
		if (!(e instanceof ApiError && e.offline)) {
			return { events: [] as EventSummary[], error: apiErrorText(e), offline };
		}
		events = (await localDb.getMeta<EventSummary[]>('myEvents')) ?? [];
		offline = true;
	}
	const known = new Set(events.map((e) => e.id));
	const created = outbox.pending.flatMap((c) => {
		const summary = c.scope === 'event' ? pendingSummary(c) : null;
		return summary && !known.has(summary.id) ? [summary] : [];
	});
	return { events: [...created, ...events], error: null, offline };
};
