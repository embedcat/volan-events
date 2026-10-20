import type { DomainError, PlayerError } from '@volan/domain';
import { api } from './api.js';
import { type AnyCommand, outbox } from './outbox.svelte.js';

// Отклонённая сервером команда — со всех устройств пользователя (docs/screens.md, «/sync»)
export type Rejected = {
	id: string;
	scope: 'event' | 'registry';
	eventId: string | null;
	command: AnyCommand;
	reason: DomainError | PlayerError;
	deviceId: string;
	issuedAt: string;
	receivedAt: string;
};

class Conflicts {
	items = $state.raw<Rejected[]>([]);
	loaded = $state(false);

	constructor() {
		// Новая отклонённая команда с этого устройства — перечитать список
		outbox.subscribe((_, outcome) => {
			if (outcome.status === 'rejected') void this.load();
		});
	}

	async load(): Promise<void> {
		try {
			this.items = (await api<{ rejected: Rejected[] }>('/rejected')).rejected;
			this.loaded = true;
		} catch {
			// нет связи или сессии — покажем, что было
		}
	}

	async resolve(id: string, resolution: 'discarded' | 'reapplied'): Promise<void> {
		await api(`/rejected/${id}/resolve`, { body: { resolution } });
		this.items = this.items.filter((r) => r.id !== id);
	}

	clear(): void {
		this.items = [];
		this.loaded = false;
	}
}

export const conflicts = new Conflicts();
