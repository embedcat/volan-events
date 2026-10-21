import { dev } from '$app/env';
import { toasts } from './toasts.svelte.js';

const UPDATE_CHECK = 60 * 60 * 1000;

// Service worker (D148): только в сборке. Новая версия — плашка «Обновить» (D149); не нажали —
// включится при следующем запуске. Открытое весь день приложение проверяет обновление раз в час.
export function registerServiceWorker(): void {
	if (dev || !('serviceWorker' in navigator)) return;
	let updating = false;
	let offered = false;

	const offer = (worker: ServiceWorker | null) => {
		// Без controller — первая установка: обновлять нечего
		if (!worker || !navigator.serviceWorker.controller || offered) return;
		offered = true;
		toasts.show('Вышла новая версия приложения', {
			sticky: true,
			action: {
				label: 'Обновить',
				run: () => {
					updating = true;
					worker.postMessage('skip-waiting');
				}
			}
		});
	};

	// Новая версия взяла управление по нажатию «Обновить» — перезагрузить страницу
	navigator.serviceWorker.addEventListener('controllerchange', () => {
		if (updating) location.reload();
	});

	navigator.serviceWorker
		.register('/service-worker.js')
		.then((registration) => {
			offer(registration.waiting);
			registration.addEventListener('updatefound', () => {
				const worker = registration.installing;
				worker?.addEventListener('statechange', () => {
					if (worker.state === 'installed') offer(worker);
				});
			});
			setInterval(() => void registration.update().catch(() => undefined), UPDATE_CHECK);
		})
		.catch(() => undefined);
}
