import type { DomainError, EventCommand, PlayerCommand, PlayerError } from '@volan/domain';
import { ApiError, api } from './api.js';

export type AnyCommand = EventCommand | PlayerCommand;

// Итог команды на сервере (см. docs/commands.md)
export type Outcome =
	| { status: 'applied'; seq?: number; revision?: number }
	| { status: 'duplicate'; seq: number | null }
	| { status: 'invalid'; issues: unknown[] }
	| { status: 'forbidden' }
	| { status: 'rejected'; error: DomainError | PlayerError };

export type OutboxStatus = 'idle' | 'sending' | 'offline' | 'unauthorized';

type Sender = (commands: AnyCommand[]) => Promise<Outcome[]>;
type Listener = (command: AnyCommand, outcome: Outcome) => void;

const BATCH = 200;
const RETRY_MIN = 1000;
const RETRY_MAX = 30_000;

// Очередь команд на отправку. Команда остаётся в очереди, пока сервер не ответит по ней;
// без связи — повтор с нарастающей паузой, при истёкшей сессии — стоп до нового входа.
// В шаге 8 очередь переедет в IndexedDB.
export class Outbox {
	pending = $state.raw<AnyCommand[]>([]);
	status = $state<OutboxStatus>('idle');

	// Служебные структуры, на экран не выводятся — реактивность им не нужна
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	private readonly listeners = new Set<Listener>();
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	private readonly waiters = new Map<string, (outcome: Outcome) => void>();
	private retryTimer: ReturnType<typeof setTimeout> | null = null;
	private retryDelay = RETRY_MIN;

	constructor(private readonly sender: Sender) {}

	enqueue(command: AnyCommand): Promise<Outcome> {
		this.pending = [...this.pending, command];
		const outcome = new Promise<Outcome>((resolve) => this.waiters.set(command.id, resolve));
		void this.flush();
		return outcome;
	}

	subscribe(listener: Listener): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	async flush(): Promise<void> {
		if (this.status === 'sending' || this.status === 'unauthorized') return;
		if (this.pending.length === 0) {
			this.status = 'idle';
			return;
		}
		this.status = 'sending';
		const batch = this.pending.slice(0, BATCH);
		let outcomes: Outcome[];
		try {
			outcomes = await this.sender(batch);
		} catch (error) {
			if (error instanceof ApiError && error.status === 401) {
				this.status = 'unauthorized';
			} else {
				this.status = 'offline';
				this.scheduleRetry();
			}
			return;
		}

		this.retryDelay = RETRY_MIN;
		this.pending = this.pending.filter((c) => !batch.includes(c));
		batch.forEach((command, i) => {
			const outcome = outcomes[i] ?? { status: 'invalid', issues: [] };
			this.waiters.get(command.id)?.(outcome);
			this.waiters.delete(command.id);
			for (const listener of this.listeners) listener(command, outcome);
		});
		this.status = 'idle';
		if (this.pending.length > 0) await this.flush();
	}

	// После нового входа или появления сети — отправить сразу
	resume(): void {
		if (this.retryTimer) clearTimeout(this.retryTimer);
		this.retryTimer = null;
		this.retryDelay = RETRY_MIN;
		this.status = 'idle';
		void this.flush();
	}

	private scheduleRetry(): void {
		if (this.retryTimer) return;
		this.retryTimer = setTimeout(() => {
			this.retryTimer = null;
			this.status = 'idle';
			void this.flush();
		}, this.retryDelay);
		this.retryDelay = Math.min(this.retryDelay * 2, RETRY_MAX);
	}
}

export const outbox = new Outbox(
	async (commands) =>
		(await api<{ results: Outcome[] }>('/commands', { body: { commands } })).results
);
