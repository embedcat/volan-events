<script lang="ts">
	import type { Match } from '@volan/domain';
	import { clock } from '#lib/clock.svelte.js';
	import { resultText } from '#lib/event-view.js';
	import { formatMinutes, formatTime, minutesSince } from '#lib/format.js';
	import { entryName } from '#lib/names.js';
	import Menu from '#lib/ui/Menu.svelte';
	import ResultDialog from '#lib/ui/ResultDialog.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const store = $derived(data.store); // владелец: ввод и правка результатов
	const reader = $derived(data.store ?? data.guest);
	const ev = $derived(reader?.view ?? null);
	const running = $derived(!!store && ev?.progress === 'running');

	type Filter = 'all' | 'pending' | 'on_court' | 'finished';
	const FILTERS: { id: Filter; label: string }[] = [
		{ id: 'all', label: 'Все' },
		{ id: 'pending', label: 'Ожидают' },
		{ id: 'on_court', label: 'На кортах' },
		{ id: 'finished', label: 'Сыграны' }
	];
	let filter = $state<Filter>('all');

	const all = $derived(ev ? Object.values(ev.matches).sort((a, b) => a.number - b.number) : []);
	const count = (f: Filter) =>
		f === 'all' ? all.length : all.filter((m) => m.status === f).length;
	const rounds = $derived.by(() => {
		const shown = all.filter((m) => filter === 'all' || m.status === filter);
		const byRound = Map.groupBy(shown, (m) => m.round);
		return [...byRound].sort(([a], [b]) => a - b);
	});

	const name = (entryId: string) => (ev && reader ? entryName(ev, reader.name, entryId) : '');

	function status(m: Match): string {
		if (!ev || !reader) return '';
		if (m.status === 'pending') return `в очереди, ${ev.queue.indexOf(m.id) + 1}-й`;
		if (m.status === 'on_court') {
			const minutes = m.calledAt ? ` · ${formatMinutes(minutesSince(m.calledAt, clock.now))}` : '';
			return `на корте ${m.court}${minutes}`;
		}
		return resultText(ev, reader.name, m);
	}

	// Где и когда играли: «корт 1 · 12:05 · 16 мин»
	function details(m: Match): string {
		if (m.status !== 'finished' || !m.calledAt || !m.finishedAt) return '';
		const duration = minutesSince(m.calledAt, Date.parse(m.finishedAt));
		return `корт ${m.court} · ${formatTime(m.calledAt)} · ${formatMinutes(duration)}`;
	}

	function clear(m: Match) {
		if (!m.result) return;
		store?.run(
			{ type: 'match.clearResult', payload: { matchId: m.id, expectedResult: m.result } },
			`Результат №${m.number} стёрт, матч в начале очереди`
		);
	}

	let resultFor = $state<string | null>(null);
</script>

<svelte:head>
	<title>Матчи — {ev?.title ?? 'событие'}</title>
</svelte:head>

{#if reader && ev}
	<div class="filters" role="tablist">
		{#each FILTERS as f (f.id)}
			<button role="tab" aria-selected={filter === f.id} onclick={() => (filter = f.id)}>
				{f.label} <span class="muted">{count(f.id)}</span>
			</button>
		{/each}
	</div>

	{#if all.length === 0}
		<p class="muted">Расписание ещё не составлено.</p>
	{:else if rounds.length === 0}
		<p class="muted">Таких матчей нет.</p>
	{/if}

	{#each rounds as [round, matches] (round)}
		<h3 class="round">Тур {round}</h3>
		<ul class="matches">
			{#each matches as m (m.id)}
				<li class={m.status}>
					<span class="num">№{m.number}</span>
					<span class="sides">{name(m.sideA)} – {name(m.sideB)}</span>
					<span class="status">{status(m)}</span>
					<span class="details muted">{details(m)}</span>
					<span class="actions">
						{#if running && m.status !== 'finished'}
							<button class="btn small" onclick={() => (resultFor = m.id)}>Результат</button>
						{:else if running && !m.result?.byWithdrawal}
							<button class="btn small" onclick={() => (resultFor = m.id)}>Изменить</button>
							<Menu title="Действия с результатом">
								<button class="menu-item" onclick={() => clear(m)}>Стереть результат</button>
							</Menu>
						{/if}
					</span>
				</li>
			{/each}
		</ul>
	{/each}

	{#if store && resultFor}
		<ResultDialog {store} matchId={resultFor} onclose={() => (resultFor = null)} />
	{/if}
{/if}

<style>
	.filters {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		margin-bottom: 12px;
	}
	.filters button {
		padding: 4px 12px;
		border: 1px solid var(--border-strong);
		border-radius: 999px;
		background: var(--surface);
		color: var(--text);
		font: inherit;
		cursor: pointer;
	}
	.filters button[aria-selected='true'] {
		background: var(--accent-soft);
		border-color: var(--accent);
		font-weight: 600;
	}
	.round {
		margin: 16px 0 6px;
		font-size: 13px;
		color: var(--text-2);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.matches {
		list-style: none;
		margin: 0;
		padding: 0;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
	}
	.matches li {
		display: grid;
		/* Колонка действий фиксированной ширины — туры выровнены между собой */
		grid-template-columns: 52px minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 0.8fr) 132px;
		align-items: center;
		gap: 8px;
		min-height: 44px;
		padding: 6px 8px 6px 12px;
		border-bottom: 1px solid var(--border);
	}
	.matches li:last-child {
		border-bottom: none;
	}
	.num {
		font-weight: 600;
	}
	.on_court .status {
		color: var(--accent);
	}
	.pending .status {
		color: var(--text-2);
	}
	.finished .status {
		font-weight: 500;
	}
	.details {
		font-size: 13px;
	}
	.actions {
		display: flex;
		gap: 4px;
		justify-content: flex-end;
	}
	@media (max-width: 760px) {
		.matches li {
			grid-template-columns: auto 1fr auto;
			grid-template-areas:
				'num status actions'
				'sides sides sides'
				'details details details';
			row-gap: 2px;
		}
		.num {
			grid-area: num;
		}
		.sides {
			grid-area: sides;
		}
		.status {
			grid-area: status;
		}
		.details {
			grid-area: details;
		}
		.details:empty {
			display: none;
		}
		.actions {
			grid-area: actions;
		}
	}
</style>
