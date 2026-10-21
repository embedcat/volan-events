import { resolve } from '$app/paths';
import { outbox } from './outbox.svelte.js';
import { session } from './session.svelte.js';
import { toasts } from './toasts.svelte.js';

// Выход стирает данные устройства (общие устройства). Неотправленные изменения пропадут —
// поэтому при них выход только по второй кнопке на плашке.
export async function logout(): Promise<void> {
	const waiting = outbox.pending.length;
	if (waiting > 0) {
		toasts.show(`Не отправлено изменений: ${waiting} — после выхода они пропадут`, {
			kind: 'error',
			action: { label: 'Выйти всё равно', run: () => void finish() }
		});
		return;
	}
	await finish();
}

async function finish(): Promise<void> {
	await session.logout();
	// Полная перезагрузка: в памяти не остаётся событий и очереди прежнего пользователя
	location.assign(resolve('/'));
}
