import { applyCommand, type EventCommand, type EventState } from '@volan/domain';

// Показываемое состояние: подтверждённое сервером + свои ещё не подтверждённые команды поверх.
// Команда, которая поверх нового состояния уже не применяется, пропускается — сервер её
// отклонит, и она попадёт в конфликты.
export function rebase(
	confirmed: EventState | null,
	local: readonly EventCommand[]
): EventState | null {
	let state = confirmed;
	for (const command of local) {
		const result = applyCommand(state, command);
		if (result.ok) state = result.state;
	}
	return state;
}

export type RemoteStep =
	| { kind: 'apply'; state: EventState; version: number }
	| { kind: 'skip' } // уже применена
	| { kind: 'reload' }; // пропуск в номерах или команда не применилась — перечитать с сервера

// Команда с сервера (SSE): применяется строго по порядку номеров
export function applyRemote(
	confirmed: EventState | null,
	version: number,
	seq: number,
	command: EventCommand
): RemoteStep {
	if (seq <= version) return { kind: 'skip' };
	if (seq !== version + 1) return { kind: 'reload' };
	const result = applyCommand(confirmed, command);
	return result.ok ? { kind: 'apply', state: result.state, version: seq } : { kind: 'reload' };
}
