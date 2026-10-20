<script lang="ts">
	import { resolve } from '$app/paths';
	import { type Match, matchOnCourt, matchPlayerIds, suggestForCourts } from '@volan/domain';
	import { playerCourts } from '#lib/event-view.js';
	import { MATCHES, plural } from '#lib/format.js';
	import ResultDialog from '#lib/ui/ResultDialog.svelte';
	import CourtBoard from '#lib/ui/courts/CourtBoard.svelte';
	import CourtCard from '#lib/ui/courts/CourtCard.svelte';
	import QueueList from '#lib/ui/courts/QueueList.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const store = $derived(data.store);
	const guest = $derived(data.guest);
	const ev = $derived((store ?? guest)?.view ?? null);

	const busyPlayers = $derived(ev ? playerCourts(ev) : new Map<string, number>());
	const suggestions = $derived(ev ? suggestForCourts(ev) : new Map<number, Match>());
	const freeCourts = $derived(
		ev ? ev.courts.filter((c) => c.enabled && !matchOnCourt(ev, c.number)).map((c) => c.number) : []
	);
	const available = $derived(
		ev
			? ev.queue.flatMap((id) => {
					const m = ev.matches[id];
					return m && !matchPlayerIds(ev, m).some((p) => busyPlayers.has(p)) ? [m] : [];
				})
			: []
	);
	const enabled = $derived(ev?.courts.filter((c) => c.enabled).length ?? 0);
	const busy = $derived(ev?.courts.filter((c) => matchOnCourt(ev, c.number)).length ?? 0);

	// Телефон: корты и очередь — переключателем (D61)
	let pane = $state<'courts' | 'queue'>('courts');
	let resultFor = $state<string | null>(null);
</script>

<svelte:head>
	<title>{store ? 'Пульт' : 'Корты'} — {ev?.title ?? 'событие'}</title>
</svelte:head>

{#if guest && ev}
	{#if ev.progress === 'setup'}
		<p class="muted">Турнир ещё не начат.</p>
	{:else if ev.progress === 'finished'}
		<p class="muted">
			Турнир завершён. Итоги — в <a href={resolve('/e/[id]/table', { id: guest.id })}>таблице</a>.
		</p>
	{:else}
		<CourtBoard {ev} lookup={guest.name} />
	{/if}
{:else if store && ev}
	{#if ev.progress === 'setup'}
		<p class="muted">
			Турнир ещё не начат. Подготовка и старт — в
			<a href={resolve('/e/[id]/settings', { id: store.id })}>настройках</a>.
		</p>
	{:else if ev.progress === 'finished'}
		<p class="muted">
			Турнир завершён. Итоги — в <a href={resolve('/e/[id]/table', { id: store.id })}>таблице</a>;
			чтобы исправить их, верните турнир в работу в настройках.
		</p>
	{:else}
		<div class="switch" role="tablist">
			<button role="tab" aria-selected={pane === 'courts'} onclick={() => (pane = 'courts')}>
				Корты ({busy}/{enabled})
			</button>
			<button role="tab" aria-selected={pane === 'queue'} onclick={() => (pane = 'queue')}>
				Очередь ({ev.queue.length})
			</button>
		</div>

		<section class="courts" class:phone-hidden={pane !== 'courts'}>
			{#each ev.courts as court (court.number)}
				<CourtCard
					{store}
					{court}
					match={matchOnCourt(ev, court.number)}
					suggestion={suggestions.get(court.number)}
					{available}
					{freeCourts}
					queueEmpty={ev.queue.length === 0}
					onresult={(id) => (resultFor = id)}
				/>
			{/each}
		</section>

		<section class:phone-hidden={pane !== 'queue'}>
			<h2 class="queue-title">Очередь · {plural(ev.queue.length, MATCHES)}</h2>
			<QueueList {store} {freeCourts} onresult={(id) => (resultFor = id)} />
		</section>
	{/if}

	{#if resultFor}
		<ResultDialog {store} matchId={resultFor} onclose={() => (resultFor = null)} />
	{/if}
{/if}

<style>
	.courts {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
		gap: 12px;
		margin-bottom: 24px;
	}
	.queue-title {
		font-size: 13px;
		font-weight: 600;
		color: var(--text-2);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.switch {
		display: none;
	}
	@media (max-width: 640px) {
		.switch {
			display: grid;
			grid-template-columns: 1fr 1fr;
			margin-bottom: 12px;
			border: 1px solid var(--border-strong);
			border-radius: var(--radius);
			overflow: hidden;
		}
		.switch button {
			padding: 8px;
			border: none;
			background: var(--surface);
			color: var(--text-2);
			font: inherit;
		}
		.switch button[aria-selected='true'] {
			background: var(--accent-soft);
			color: var(--text);
			font-weight: 600;
		}
		.phone-hidden {
			display: none;
		}
		.courts {
			grid-template-columns: 1fr;
			gap: 8px;
		}
	}
</style>
