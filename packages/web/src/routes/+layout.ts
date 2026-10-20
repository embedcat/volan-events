import { session } from '#lib/session.svelte.js';

// SPA без серверного рендеринга: приложение должно работать без сети из кеша браузера
export const ssr = false;

export async function load() {
	if (!session.loaded) await session.load();
}
