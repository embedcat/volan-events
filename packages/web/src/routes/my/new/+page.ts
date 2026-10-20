import { requireLogin } from '#lib/guard.js';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ parent, url }) => {
	await parent();
	requireLogin(url);
};
