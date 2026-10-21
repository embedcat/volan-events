import { uuidv7 } from './ids.js';
import { localDb } from './local-db.js';

const LEGACY_KEY = 'volan.deviceId';
let cached: string | null = null;

// ID установки приложения в этом браузере: в командах и в списке сессий. Хранится в IndexedDB
// (D123); прежний — из localStorage — переносится.
export async function initDevice(): Promise<void> {
	let id = await localDb.getMeta<string>('deviceId');
	if (!id) {
		id = legacyId() ?? uuidv7();
		await localDb.setMeta('deviceId', id);
	}
	cached = id;
}

export function deviceId(): string {
	cached ??= legacyId() ?? uuidv7();
	return cached;
}

function legacyId(): string | null {
	try {
		return localStorage.getItem(LEGACY_KEY);
	} catch {
		return null;
	}
}
