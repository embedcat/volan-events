import type { DomainError, PlayerError } from '@volan/domain';
import { api } from './api.js';
import { localDb } from './local-db.js';
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
			void localDb.setMeta('rejected', this.items);
		} catch {
			// Нет связи — список с прошлого раза
			if (!this.loaded) this.items = (await localDb.getMeta<Rejected[]>('rejected')) ?? [];
		}
	}

	async resolve(id: string, resolution: 'discarded' | 'reapplied'): Promise<void> {
		await api(`/rejected/${id}/resolve`, { body: { resolution } });
		this.items = this.items.filter((r) => r.id !== id);
		void localDb.setMeta('rejected', this.items);
	}

	clear(): void {
		this.items = [];
		this.loaded = false;
	}
}

export const conflicts = new Conflicts();
