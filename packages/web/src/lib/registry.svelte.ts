import {
	type Actor,
	type Player,
	type PlayerCommandDraft,
	type PublicPlayer,
	applyPlayerCommand,
	invertPlayerCommand
} from '@volan/domain';
import { api } from './api.js';
import { playerCommand } from './commands.js';
import { domainErrorText } from './messages.js';
import { normalize } from './names.js';
import { outbox } from './outbox.svelte.js';
import { toasts } from './toasts.svelte.js';

// Закрытые поля есть только у своих записей (D107)
export type RegistryPlayer = PublicPlayer &
	Partial<Pick<Player, 'birthYear' | 'contact' | 'externalId'>>;

type ServerPlayer = RegistryPlayer | { id: string; deleted: true };

// Справочник игроков в браузере: синхронизация по ревизии (D109), правки — командами через очередь
class Registry {
	players = $state.raw<Record<string, RegistryPlayer>>({});
	loaded = $state(false);
	private revision = 0;
	private syncing: Promise<void> | null = null;

	sync(): Promise<void> {
		this.syncing ??= (async () => {
			try {
				const result = await api<{ revision: number; players: ServerPlayer[] }>(
					`/players?since=${this.revision}`
				);
				const next = { ...this.players };
				for (const player of result.players) {
					if ('deleted' in player) delete next[player.id];
					else next[player.id] = player;
				}
				this.players = next;
				this.revision = result.revision;
				this.loaded = true;
			} finally {
				this.syncing = null;
			}
		})();
		return this.syncing;
	}

	get(id: string): RegistryPlayer | undefined {
		const player = this.players[id];
		// Объединённая запись показывается по основной
		return player?.mergedIntoId ? (this.players[player.mergedIntoId] ?? player) : player;
	}

	// Поиск по фамилии, имени и клубу: все слова запроса должны найтись
	search(query: string, limit = 20): RegistryPlayer[] {
		const words = normalize(query).split(/\s+/).filter(Boolean);
		if (words.length === 0) return [];
		return Object.values(this.players)
			.filter((p) => !p.mergedIntoId)
			.filter((p) => {
				const haystack = normalize(`${p.lastName} ${p.firstName} ${p.club ?? ''}`);
				return words.every((w) => haystack.includes(w));
			})
			.sort((a, b) => a.lastName.localeCompare(b.lastName, 'ru'))
			.slice(0, limit);
	}

	// Команда справочника: сразу в браузере, затем на сервер. Возвращает обратные команды.
	dispatch(draft: PlayerCommandDraft, actor: Actor): PlayerCommandDraft[] | null {
		const command = playerCommand(draft);
		const lookup = (id: string) => this.players[id] as Player | undefined;
		const result = applyPlayerCommand(lookup, command, actor);
		if (!result.ok) {
			toasts.error(domainErrorText(result.error));
			return null;
		}
		const undo = invertPlayerCommand(lookup, command);
		const next = { ...this.players };
		for (const player of result.upsert) next[player.id] = player;
		for (const id of result.deleted) delete next[id];
		this.players = next;

		void outbox.enqueue(command).then((outcome) => {
			if (outcome.status === 'applied' || outcome.status === 'duplicate') return;
			toasts.error(
				outcome.status === 'rejected'
					? `Не принято: ${domainErrorText(outcome.error)}`
					: 'Сервер не принял изменение справочника'
			);
			// Откатить свою правку — перечитать справочник целиком
			this.revision = 0;
			this.players = {};
			void this.sync();
		});
		return undo;
	}
}

export const registry = new Registry();
