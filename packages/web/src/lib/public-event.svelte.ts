import type { EventState } from '@volan/domain';
import { ApiError, api } from './api.js';
import { nowIso } from './format.js';
import type { NameLookup, PlayerName } from './names.js';

type LoadState = 'loading' | 'ready' | 'notFound' | 'offline';

// Что показывает страница события: владельцу — EventStore с командами, остальным —
// PublicEvent только для чтения. Обоим хватает этого.
export type EventReader = {
	readonly id: string;
	readonly view: EventState | null;
	readonly name: NameLookup;
};

const RELOAD_DELAY = 500;

// Опубликованное событие для гостя и чужого организатора (D64): состояние без владельца,
// по SSE приходит только «изменилось» — тогда состояние перечитывается целиком
export class PublicEvent implements EventReader {
	readonly id: string;
	view = $state.raw<EventState | null>(null);
	names = $state.raw<Record<string, PlayerName>>({});
	loadState = $state<LoadState>('loading');
	updatedAt = $state<string | null>(null); // ISO: когда состояние перечитано
	live = $state(false);
	private version = -1;
	private source: EventSource | null = null;
	private reloadTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(id: string) {
		this.id = id;
	}

	async load(): Promise<void> {
		try {
			const result = await api<{
				state: Omit<EventState, 'ownerId'>;
				version: number;
				players: Record<string, PlayerName>;
			}>(`/public/events/${this.id}`);
			this.view = { ...result.state, ownerId: '' };
			this.version = result.version;
			this.names = result.players;
			this.updatedAt = nowIso();
			this.loadState = 'ready';
		} catch (error) {
			if (this.loadState === 'ready') return;
			this.loadState = error instanceof ApiError && error.status === 404 ? 'notFound' : 'offline';
		}
	}

	connect(): void {
		if (this.source) return;
		const source = new EventSource(`/api/events/${this.id}/stream`);
		const onVersion = (event: MessageEvent<string>) => {
			const { version } = JSON.parse(event.data) as { version: number };
			if (version !== this.version) this.scheduleReload();
		};
		source.addEventListener('hello', (event) => {
			this.live = true;
			onVersion(event);
		});
		source.addEventListener('changed', onVersion);
		source.onerror = () => (this.live = false);
		this.source = source;
	}

	destroy(): void {
		this.source?.close();
		this.source = null;
		if (this.reloadTimer) clearTimeout(this.reloadTimer);
	}

	name = (playerId: string): PlayerName | undefined => this.names[playerId];

	// Несколько изменений подряд (ввод результата, вызов) — одно перечитывание
	private scheduleReload(): void {
		if (this.reloadTimer) return;
		this.reloadTimer = setTimeout(() => {
			this.reloadTimer = null;
			void this.load();
		}, RELOAD_DELAY);
	}
}

// eslint-disable-next-line svelte/prefer-svelte-reactivity
const views = new Map<string, PublicEvent>();

export function openPublicEvent(id: string): PublicEvent {
	let view = views.get(id);
	if (!view) {
		view = new PublicEvent(id);
		views.set(id, view);
	}
	return view;
}

export function closePublicEvent(id: string): void {
	views.get(id)?.destroy();
	views.delete(id);
}
