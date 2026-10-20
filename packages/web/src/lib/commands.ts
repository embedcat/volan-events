import type {
	EventCommand,
	EventCommandDraft,
	PlayerCommand,
	PlayerCommandDraft
} from '@volan/domain';
import { deviceId } from './device.js';
import { uuidv7 } from './ids.js';

// Конверт команды события: ID, время и устройство добавляются здесь
export function eventCommand(
	eventId: string,
	draft: EventCommandDraft,
	baseVersion?: number
): EventCommand {
	return {
		...draft,
		id: uuidv7(),
		scope: 'event',
		eventId,
		issuedAt: new Date().toISOString(),
		deviceId: deviceId(),
		schemaVersion: 1,
		...(baseVersion === undefined ? {} : { baseVersion })
	} as EventCommand;
}

export function playerCommand(draft: PlayerCommandDraft): PlayerCommand {
	return {
		...draft,
		id: uuidv7(),
		scope: 'registry',
		issuedAt: new Date().toISOString(),
		deviceId: deviceId(),
		schemaVersion: 1
	} as PlayerCommand;
}
