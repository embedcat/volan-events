import { initDevice } from '#lib/device.js';
import { outbox } from '#lib/outbox.svelte.js';
import { registry } from '#lib/registry.svelte.js';
import { session } from '#lib/session.svelte.js';

// SPA без серверного рендеринга: приложение должно работать без сети из кеша браузера
export const ssr = false;

let started: Promise<void> | null = null;

// Запуск: ID устройства, пользователь (без сети — последний вошедший), неотправленные
// команды и справочник из IndexedDB
async function start(): Promise<void> {
	await initDevice();
	await session.load();
	await outbox.restore();
	if (session.user) await registry.restore();
	window.addEventListener('online', () => outbox.resume());
}

export async function load() {
	started ??= start();
	await started;
}
