<script lang="ts">
	import type { Court, Match } from '@volan/domain';
	import { clock } from '../../clock.svelte.js';
	import type { EventStore } from '../../event-store.svelte.js';
	import { formatMinutes, minutesSince } from '../../format.js';
	import { entryName, entrySurnames } from '../../names.js';
	import Menu from '../Menu.svelte';

	let {
		store,
		court,
		match,
		suggestion,
		available,
		freeCourts,
		queueEmpty,
		onresult
	}: {
		store: EventStore;
		court: Court;
		match: Match | undefined; // матч на корте
		suggestion: Match | undefined; // подсказка для свободного корта
		available: Match[]; // матчи очереди со свободными игроками
		freeCourts: number[];
		queueEmpty: boolean;
		onresult: (matchId: string) => void;
	} = $props();

	const ev = $derived(store.view);
	const name = (entryId: string) => (ev ? entryName(ev, store.name, entryId) : '');
	const short = (m: Match) =>
		ev
			? `${entrySurnames(ev, store.name, m.sideA)} – ${entrySurnames(ev, store.name, m.sideB)}`
			: '';

	function call(m: Match) {
		store.run(
			{ type: 'match.call', payload: { matchId: m.id, court: court.number } },
			`№${m.number} вызван на корт ${court.number}`
		);
	}

	function setEnabled(enabled: boolean) {
		store.run(
			{ type: 'court.setEnabled', payload: { court: court.number, enabled } },
			`Корт ${court.number} ${enabled ? 'включён' : 'выключен'}`
		);
	}
</script>

<div class="court" class:busy={!!match} class:off={!court.enabled}>
	<div class="head">
		<strong>Корт {court.number}</strong>
		{#if match}
			<span class="muted">
				№{match.number} · тур {match.round}{match.calledAt
					? ` · ${formatMinutes(minutesSince(match.calledAt, clock.now))}`
					: ''}
			</span>
		{:else if !court.enabled}
			<span class="muted">выключен</span>
		{:else}
			<span class="free">свободен</span>
		{/if}
	</div>

	{#if !court.enabled}
		<div class="actions">
			<button class="btn small" onclick={() => setEnabled(true)}>Включить</button>
		</div>
	{:else if match}
		<div class="players">
			<span>{name(match.sideA)}</span>
			<span>{name(match.sideB)}</span>
		</div>
		<div class="actions">
			<button class="btn primary" onclick={() => onresult(match.id)}>Результат</button>
			<span class="spacer"></span>
			<Menu title="Действия с матчем">
				{#each freeCourts as number (number)}
					<button
						class="menu-item"
						onclick={() =>
							store.run(
								{ type: 'match.moveCourt', payload: { matchId: match.id, court: number } },
								`№${match.number} перенесён на корт ${number}`
							)}
					>
						Перенести на корт {number}
					</button>
				{:else}
					<div class="menu-label">Свободных кортов для переноса нет</div>
				{/each}
				<hr class="menu-sep" />
				<button
					class="menu-item"
					onclick={() =>
						store.run(
							{ type: 'match.uncall', payload: { matchId: match.id } },
							`Вызов №${match.number} отменён`
						)}
				>
					Отменить вызов
				</button>
			</Menu>
		</div>
	{:else}
		{#if suggestion}
			<div class="players">
				<span class="muted next">дальше: №{suggestion.number} · тур {suggestion.round}</span>
				<span>{name(suggestion.sideA)}</span>
				<span>{name(suggestion.sideB)}</span>
			</div>
		{:else}
			<p class="muted hint">
				{queueEmpty
					? 'Очередь пуста'
					: available.length > 0
						? 'Свободные игроки — в подсказках для других кортов'
						: 'Все ожидающие игроки на кортах'}
			</p>
		{/if}
		<div class="actions">
			{#if suggestion}
				<button class="btn primary" onclick={() => call(suggestion)}>Вызвать</button>
			{/if}
			{#if available.length > (suggestion ? 1 : 0)}
				<Menu label="другой матч…" title="Вызвать другой матч" variant="plain">
					{#each available as m (m.id)}
						{#if m.id !== suggestion?.id}
							<button class="menu-item" onclick={() => call(m)}>
								№{m.number} · {short(m)}
							</button>
						{/if}
					{/each}
				</Menu>
			{/if}
			<span class="spacer"></span>
			<Menu title="Действия с кортом">
				<button class="menu-item" onclick={() => setEnabled(false)}>Выключить корт</button>
			</Menu>
		</div>
	{/if}
</div>

<style>
	.court {
		display: flex;
		flex-direction: column;
		gap: 8px;
		min-height: 150px;
		padding: 12px;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
	}
	.court.busy {
		border-color: color-mix(in srgb, var(--accent) 50%, var(--border));
		box-shadow: inset 3px 0 0 var(--accent);
	}
	.court.off {
		min-height: 0;
		background: var(--surface-2);
	}
	.head {
		display: flex;
		justify-content: space-between;
		gap: 8px;
		flex-wrap: wrap;
	}
	.free {
		color: var(--ok);
	}
	.players {
		display: flex;
		flex-direction: column;
		gap: 2px;
		flex: 1;
	}
	.players span:not(.next) {
		font-weight: 500;
	}
	.next {
		font-size: 13px;
	}
	.hint {
		flex: 1;
		margin: 0;
	}
	.actions {
		display: flex;
		align-items: center;
		gap: 6px;
		flex-wrap: wrap;
	}
	.spacer {
		flex: 1;
	}
	.actions :global(.btn.primary) {
		min-width: 110px;
	}
</style>
