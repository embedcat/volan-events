import { api } from '#lib/api.js';
import type { EventSummary } from '#lib/events.js';

export async function load() {
	try {
		const { events } = await api<{ events: EventSummary[] }>('/events');
		return { events, error: null };
	} catch {
		return { events: [] as EventSummary[], error: 'Нет связи с сервером' };
	}
}
