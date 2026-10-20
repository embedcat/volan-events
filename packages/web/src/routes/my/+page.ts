import { api } from '#lib/api.js';
import type { EventSummary } from '#lib/events.js';
import { requireLogin } from '#lib/guard.js';
import { apiErrorText } from '#lib/messages.js';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ parent, url }) => {
	await parent();
	requireLogin(url);
	try {
		const { events } = await api<{ events: EventSummary[] }>('/events?owner=me');
		return { events, error: null };
	} catch (e) {
		return { events: [] as EventSummary[], error: apiErrorText(e) };
	}
};
