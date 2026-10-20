import { api } from '#lib/api.js';
import { requireLogin } from '#lib/guard.js';
import { registry } from '#lib/registry.svelte.js';
import type { PageLoad } from './$types';

// Справочник целиком и имена авторов записей (D139)
export const load: PageLoad = async ({ parent, url }) => {
	await parent();
	requireLogin(url);
	const [organizers] = await Promise.all([
		api<{ organizers: { id: string; displayName: string }[] }>('/organizers')
			.then((r) => Object.fromEntries(r.organizers.map((o) => [o.id, o.displayName])))
			.catch(() => ({}) as Record<string, string>),
		registry.sync().catch(() => undefined)
	]);
	return { organizers };
};
