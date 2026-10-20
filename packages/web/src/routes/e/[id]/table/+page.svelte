<script lang="ts">
	import type { Category } from '@volan/domain';
	import { activeLots, categoryGroup, categoryTitle, groupStandings } from '#lib/event-view.js';
	import { entrySurnames } from '#lib/names.js';
	import ResultDialog from '#lib/ui/ResultDialog.svelte';
	import GroupTable from '#lib/ui/table/GroupTable.svelte';
	import TieDialog from '#lib/ui/table/TieDialog.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const store = $derived(data.store);
	const ev = $derived(store?.view ?? null);

	// MVP: одна категория, одна группа (D40)
	const category = $derived(
		ev ? (Object.values(ev.categories)[0] as Category | undefined) : undefined
	);
	const group = $derived(ev && category ? categoryGroup(ev, category.id) : undefined);
	const standings = $derived(ev && group ? groupStandings(ev, group) : null);
	const lots = $derived(ev && group ? activeLots(ev, group) : []);
	// Жребий — когда сыграны все матчи (D94); до этого равенство — обычное дело
	const ties = $derived(standings?.complete ? standings.unresolved : []);
	const running = $derived(ev?.progress === 'running');

	const placeOf = (id: string) => standings?.rows.find((r) => r.entryId === id)?.place ?? 0;
	const names = (ids: string[]) =>
		ev && store ? ids.map((id) => entrySurnames(ev, store.name, id)).join(', ') : '';

	let resultFor = $state<string | null>(null);
	let tie = $state<string[] | null>(null);
</script>

<svelte:head>
	<title>Таблица — {ev?.title ?? 'событие'}</title>
</svelte:head>

{#if store && ev}
	{#if !category || !group || !standings}
		<p class="muted">Категория ещё не создана.</p>
	{:else if group.entryIds.length === 0}
		<p class="muted">В группе пока нет участников.</p>
	{:else}
		<div class="title">
			<h2>Группа {group.name} · {categoryTitle(category)}</h2>
			<span class="muted">
				{standings.complete ? 'все матчи сыграны' : 'места предварительные'}
			</span>
		</div>

		<GroupTable
			{ev}
			lookup={store.name}
			{group}
			{standings}
			lotIds={new Set(lots.flat())}
			onmatch={running ? (id) => (resultFor = id) : undefined}
		/>

		{#if ties.length > 0 || lots.length > 0}
			<div class="ties">
				{#each ties as block (block.join())}
					<div class="tie warn">
						<span>Равны по всем показателям: {names(block)}</span>
						{#if running}
							<button class="btn small" onclick={() => (tie = block)}>Жребий</button>
						{/if}
					</div>
				{/each}
				{#each lots as lot (lot.join())}
					<div class="tie">
						<span class="muted">По жребию: {names(lot)}</span>
						{#if running}
							<button class="btn small" onclick={() => (tie = lot)}>Изменить</button>
							<button
								class="btn small ghost"
								onclick={() =>
									store.run(
										{ type: 'group.clearTie', payload: { groupId: group.id, entryIds: lot } },
										'Жребий снят'
									)}
							>
								Снять
							</button>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	{/if}

	{#if resultFor}
		<ResultDialog {store} matchId={resultFor} onclose={() => (resultFor = null)} />
	{/if}
	{#if tie && group}
		<TieDialog
			{store}
			groupId={group.id}
			entryIds={tie}
			firstPlace={Math.min(...tie.map(placeOf))}
			onclose={() => (tie = null)}
		/>
	{/if}
{/if}

<style>
	.title {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-between;
		gap: 8px;
		margin-bottom: 8px;
	}
	.ties {
		display: flex;
		flex-direction: column;
		gap: 6px;
		margin-top: 12px;
	}
	.tie {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
	}
	.tie.warn span {
		color: var(--warn);
	}
</style>
