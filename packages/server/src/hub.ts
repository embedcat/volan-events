import type { EventCommand } from '@volan/domain';

export type Subscriber = {
	// owner — устройства владельца получают сами команды; guest — только сигнал «изменилось»
	mode: 'owner' | 'guest';
	send: (chunk: string) => void;
};

export function sseMessage(fields: { id?: number; event: string; data: unknown }): string {
	const id = fields.id === undefined ? '' : `id: ${fields.id}\n`;
	return `${id}event: ${fields.event}\ndata: ${JSON.stringify(fields.data)}\n\n`;
}

// Рассылка применённых команд по открытым SSE-потокам событий (в памяти процесса)
export class EventHub {
	private readonly subscribers = new Map<string, Set<Subscriber>>();

	subscribe(eventId: string, subscriber: Subscriber): () => void {
		let set = this.subscribers.get(eventId);
		if (!set) {
			set = new Set();
			this.subscribers.set(eventId, set);
		}
		set.add(subscriber);
		return () => {
			set.delete(subscriber);
			if (set.size === 0) this.subscribers.delete(eventId);
		};
	}

	publish(eventId: string, seq: number, command: EventCommand): void {
		const set = this.subscribers.get(eventId);
		if (!set) return;
		const forOwner = sseMessage({ id: seq, event: 'command', data: command });
		const forGuest = sseMessage({ event: 'changed', data: { version: seq } });
		for (const subscriber of set)
			subscriber.send(subscriber.mode === 'owner' ? forOwner : forGuest);
	}

	count(eventId: string): number {
		return this.subscribers.get(eventId)?.size ?? 0;
	}
}
