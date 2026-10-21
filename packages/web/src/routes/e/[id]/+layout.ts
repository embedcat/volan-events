import { closeEvent, openEvent } from '#lib/event-store.svelte.js';
import { openPublicEvent } from '#lib/public-event.svelte.js';
import { registry } from '#lib/registry.svelte.js';
import { session } from '#lib/session.svelte.js';
import type { LayoutLoad } from './$types';

// Чужие события, на которые сервер уже ответил «нет прав», — повторно не спрашиваем
const foreign = new Set<string>();

// Владелец (и суперюзер) работает с событием через хранилище с командами; гость и чужой
// организатор смотрят опубликованное событие только для чтения (D64)
export const load: LayoutLoad = async ({ params, parent }) => {
	await parent();
	if (session.user && !foreign.has(`${session.user.id}/${params.id}`)) {
		const store = openEvent(params.id);
		if (store.loadState !== 'ready') await store.load();
		if (store.loadState !== 'forbidden') {
			void registry.sync().catch(() => undefined); // дельта по ревизии — дёшево
			return { store, guest: null };
		}
		foreign.add(`${session.user.id}/${params.id}`);
		closeEvent(params.id);
	}
	const guest = openPublicEvent(params.id);
	if (guest.loadState !== 'ready') await guest.load();
	return { store: null, guest };
};
