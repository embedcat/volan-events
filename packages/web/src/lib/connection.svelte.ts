// Есть ли связь с сервером: по ответам на запросы и по событиям браузера online/offline
class Connection {
	online = $state(typeof navigator === 'undefined' ? true : navigator.onLine);

	constructor() {
		if (typeof window === 'undefined') return;
		window.addEventListener('online', () => (this.online = true));
		window.addEventListener('offline', () => (this.online = false));
	}
}

export const connection = new Connection();
