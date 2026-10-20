import { redirect } from '@sveltejs/kit';
import { session } from './session.svelte.js';

// Для страниц организатора: без входа — на страницу входа с возвратом обратно
export function requireLogin(url: URL): void {
	if (!session.user) redirect(307, `/login?next=${encodeURIComponent(url.pathname + url.search)}`);
}
