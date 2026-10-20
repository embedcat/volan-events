import { conflicts } from '#lib/conflicts.svelte.js';
import { requireLogin } from '#lib/guard.js';
import { registry } from '#lib/registry.svelte.js';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ parent, url }) => {
	await parent();
	requireLogin(url);
	await Promise.all([conflicts.load(), registry.loaded ? null : registry.sync().catch(() => null)]);
};
