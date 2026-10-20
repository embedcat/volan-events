<script lang="ts">
	import { type EventState, entryRating } from '@volan/domain';
	import { categoryEntries, categoryTitle } from '../event-view.js';
	import { type NameLookup, entryName } from '../names.js';

	// Участники только для чтения — гостю (docs/screens.md, «Участники»)
	let { ev, lookup }: { ev: EventState; lookup: NameLookup } = $props();

	const category = $derived(Object.values(ev.categories)[0]);
	const entries = $derived(category ? categoryEntries(ev, category.id) : []);
	const club = (players: { club: string | null }[]) =>
		[...new Set(players.map((p) => p.club).filter(Boolean))].join(', ') || '—';
</script>

{#if category}
	<section class="card">
		<h2>{categoryTitle(category)} · участников: {entries.length}</h2>
		{#if entries.length === 0}
			<p class="muted">Участников пока нет.</p>
		{:else}
			<table class="table">
				<thead>
					<tr>
						<th class="num">№</th>
						<th>Участник</th>
						<th>Клуб / город</th>
						<th class="num">Рейтинг</th>
					</tr>
				</thead>
				<tbody>
					{#each entries as entry, i (entry.id)}
						<tr>
							<td class="num">{i + 1}</td>
							<td>
								{entryName(ev, lookup, entry.id)}
								{#if entry.status === 'withdrawn'}<span class="badge">снят</span>{/if}
							</td>
							<td>{club(entry.players)}</td>
							<td class="num">{entryRating(entry.players) ?? '—'}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	</section>
{:else}
	<p class="muted">Категория ещё не создана.</p>
{/if}
