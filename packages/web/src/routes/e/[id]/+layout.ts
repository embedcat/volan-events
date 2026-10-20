import { openEvent } from '#lib/event-store.svelte.js';
import { registry } from '#lib/registry.svelte.js';
import { session } from '#lib/session.svelte.js';
import type { LayoutLoad } from './$types';

// Организатор работает с событием через хранилище; гостевой просмотр — порция 7d
export const load: LayoutLoad = async ({ params, parent }) => {
	await parent();
	if (!session.user) return { store: null };
	const store = openEvent(params.id);
	if (store.loadState !== 'ready') await store.load();
	if (!registry.loaded) void registry.sync().catch(() => undefined);
	return { store };
};
