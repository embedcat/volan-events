import { uuidv7 } from './ids.js';

const KEY = 'volan.deviceId';
let cached: string | null = null;

// ID установки приложения в этом браузере: в командах и в списке сессий
export function deviceId(): string {
	if (cached) return cached;
	try {
		cached = localStorage.getItem(KEY);
		if (!cached) {
			cached = uuidv7();
			localStorage.setItem(KEY, cached);
		}
	} catch {
		cached ??= uuidv7();
	}
	return cached;
}
