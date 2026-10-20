import {
	type DomainError,
	type EventCommand,
	type EventCommandDraft,
	type EventState,
	applyCommand,
	invertCommand
} from '@volan/domain';
import { ApiError, api } from './api.js';
import { eventCommand } from './commands.js';
import { applyRemote, rebase } from './event-sync.js';
import { domainErrorText } from './messages.js';
import type { PlayerName } from './names.js';
import { type AnyCommand, type Outcome, outbox } from './outbox.svelte.js';
import { registry } from './registry.svelte.js';
import { toasts } from './toasts.svelte.js';

type LoadState = 'loading' | 'ready' | 'notFound' | 'forbidden' | 'offline';

// Событие в браузере (организатор): подтверждённое сервером состояние, свои команды поверх,
// изменения с других устройств — по SSE. См. docs/architecture.md, «Изменения как команды».
export class EventStore {
	readonly id: string;
	confirmed = $state.raw<EventState | null>(null);
	version = $state(0);
	local = $state.raw<EventCommand[]>([]); // свои команды, ещё не пришедшие обратно по SSE
	names = $state.raw<Record<string, PlayerName>>({});
	loadState = $state<LoadState>('loading');
	live = $state(false); // поток SSE подключён
	view = $derived(rebase(this.confirmed, this.local));

	private source: EventSource | null = null;
	private readonly unsubscribe: () => void;

	constructor(id: string) {
		this.id = id;
		this.unsubscribe = outbox.subscribe((command, outcome) => this.onOutcome(command, outcome));
	}

	async load(): Promise<void> {
		try {
			const result = await api<{
				state: EventState;
				version: number;
				players: Record<string, PlayerName>;
			}>(`/events/${this.id}`);
			this.confirmed = result.state;
			this.version = result.version;
			this.names = result.players;
			this.loadState = 'ready';
		} catch (error) {
			if (this.loadState === 'ready') return; // уже есть что показать
			this.loadState =
				error instanceof ApiError && error.status === 404
					? 'notFound'
					: error instanceof ApiError && error.status === 403
						? 'forbidden'
						: 'offline';
		}
	}

	connect(): void {
		if (this.source) return;
		// after — догон с загруженной версии; при переподключении браузер сам передаёт Last-Event-ID
		const source = new EventSource(`/api/events/${this.id}/stream?after=${this.version}`);
		source.addEventListener('hello', () => (this.live = true));
		source.addEventListener('command', (event) => {
			this.onRemote(Number(event.lastEventId), JSON.parse(event.data) as EventCommand);
		});
		source.onerror = () => (this.live = false);
		this.source = source;
	}

	destroy(): void {
		this.source?.close();
		this.source = null;
		this.unsubscribe();
	}

	// Имя игрока: из справочника (там и только что созданные), иначе из ответа сервера
	name = (playerId: string): PlayerName | undefined =>
		registry.get(playerId) ?? this.names[playerId];

	// Команда: проверка правилами здесь же, затем в очередь. Ошибка — сразу, без отправки.
	dispatch(
		draft: EventCommandDraft
	): { ok: true; undo: EventCommandDraft[] } | { ok: false; error: DomainError } {
		const state = this.view;
		const command = eventCommand(this.id, draft, this.version);
		const result = applyCommand(state, command);
		if (!result.ok) return { ok: false, error: result.error };
		const undo = invertCommand(state, command);
		this.local = [...this.local, command];
		void outbox.enqueue(command);
		return { ok: true, undo };
	}

	// То же для интерфейса: ошибка — плашкой; успех — плашкой с «Отменить», если задан текст
	run(draft: EventCommandDraft, message?: string): boolean {
		const result = this.dispatch(draft);
		if (!result.ok) {
			toasts.error(domainErrorText(result.error));
			return false;
		}
		if (message) {
			const { undo } = result;
			toasts.show(message, {
				action:
					undo.length > 0
						? { label: 'Отменить', run: () => undo.forEach((d) => this.run(d)) }
						: undefined
			});
		}
		return true;
	}

	private onRemote(seq: number, command: EventCommand): void {
		const step = applyRemote(this.confirmed, this.version, seq, command);
		if (step.kind === 'apply') {
			this.confirmed = step.state;
			this.version = step.version;
		} else if (step.kind === 'reload') {
			void this.load();
		}
		if (this.local.some((c) => c.id === command.id)) {
			this.local = this.local.filter((c) => c.id !== command.id);
		}
	}

	private onOutcome(command: AnyCommand, outcome: Outcome): void {
		if (command.scope !== 'event' || command.eventId !== this.id) return;
		if (outcome.status === 'applied' || outcome.status === 'duplicate') {
			// Обычно команда вернётся по SSE. Если поток не подключён — перечитать состояние.
			if (!this.live) {
				this.local = this.local.filter((c) => c.id !== command.id);
				void this.load();
			}
			return;
		}
		this.local = this.local.filter((c) => c.id !== command.id);
		toasts.error(
			outcome.status === 'rejected'
				? `Не принято: ${domainErrorText(outcome.error)}`
				: 'Сервер не принял изменение'
		);
	}
}

// Вкладки события работают с одним хранилищем
// eslint-disable-next-line svelte/prefer-svelte-reactivity
const stores = new Map<string, EventStore>();

export function openEvent(id: string): EventStore {
	let store = stores.get(id);
	if (!store) {
		store = new EventStore(id);
		stores.set(id, store);
	}
	return store;
}

export function closeEvent(id: string): void {
	stores.get(id)?.destroy();
	stores.delete(id);
}
