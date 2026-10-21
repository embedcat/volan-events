import { version } from '$app/env';
import { assets, immutable } from '$app/manifest';
import { self } from '$app/service-worker';

// Приложение открывается без сети (D148): файлы сборки и статика — из кеша, любая страница —
// оболочка SPA (index.html). Запросы к /api не трогаем: данные лежат в IndexedDB.
// Новая версия ждёт, пока организатор нажмёт «Обновить» (D149).

const CACHE = `volan-${version}`;
const SHELL = new URL('./', self.registration.scope).pathname;
// Пути в манифесте — относительно корня приложения; запросы приходят с полным путём
const FILES = [...immutable, ...assets].map(
	(f) => new URL(f.path, self.registration.scope).pathname
);
const CACHED = new Set(FILES);

self.addEventListener('install', (event) => {
	event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll([...FILES, SHELL])));
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
			await self.clients.claim();
		})()
	);
});

// «Обновить» на плашке: новая версия начинает работу сразу
self.addEventListener('message', (event) => {
	if (event.data === 'skip-waiting') void self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
	const { request } = event;
	if (request.method !== 'GET') return;
	const url = new URL(request.url);
	if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

	if (CACHED.has(url.pathname)) {
		event.respondWith(fromCache(request, url.pathname));
	} else if (request.mode === 'navigate') {
		event.respondWith(shell(request));
	}
});

// Файлы сборки неизменны: кеш, а если вдруг нет — сеть
async function fromCache(request: Request, path: string): Promise<Response> {
	return (await caches.match(path, { cacheName: CACHE })) ?? fetch(request);
}

// Страницы: сначала сеть (свежая оболочка), без сети — сохранённая оболочка
async function shell(request: Request): Promise<Response> {
	try {
		const response = await fetch(request);
		if (response.ok) {
			const cache = await caches.open(CACHE);
			await cache.put(SHELL, response.clone());
		}
		return response;
	} catch {
		return (await caches.match(SHELL, { cacheName: CACHE })) ?? Response.error();
	}
}
