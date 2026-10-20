<script lang="ts">
	import { type EventState, matchOnCourt } from '@volan/domain';
	import { clock } from '../../clock.svelte.js';
	import { formatMinutes, minutesSince } from '../../format.js';
	import { type NameLookup, entryName } from '../../names.js';

	// Корты для гостя и ТВ в зале: без кнопок, плюс первые матчи очереди (docs/screens.md)
	let { ev, lookup }: { ev: EventState; lookup: NameLookup } = $props();

	const NEXT = 5;
	const next = $derived(ev.queue.slice(0, NEXT).flatMap((id) => ev.matches[id] ?? []));
	const name = (entryId: string) => entryName(ev, lookup, entryId);
</script>

<section class="courts">
	{#each ev.courts as court (court.number)}
		{@const match = matchOnCourt(ev, court.number)}
		<div class="court" class:busy={!!match} class:off={!court.enabled}>
			<div class="head">
				<strong>Корт {court.number}</strong>
				{#if match}
					<span class="muted">
						№{match.number} · тур {match.round}{match.calledAt
							? ` · ${formatMinutes(minutesSince(match.calledAt, clock.now))}`
							: ''}
					</span>
				{:else}
					<span class="muted">{court.enabled ? 'свободен' : 'выключен'}</span>
				{/if}
			</div>
			{#if match}
				<div class="players">
					<span>{name(match.sideA)}</span>
					<span>{name(match.sideB)}</span>
				</div>
			{/if}
		</div>
	{/each}
</section>

<h2 class="next-title">Следующие</h2>
{#if next.length === 0}
	<p class="muted">Очередь пуста.</p>
{:else}
	<ol class="next">
		{#each next as m (m.id)}
			<li>
				<span class="num">№{m.number}</span>
				<span class="muted">тур {m.round}</span>
				<span>{name(m.sideA)} – {name(m.sideB)}</span>
			</li>
		{/each}
	</ol>
{/if}

<style>
	.courts {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
		gap: 12px;
		margin-bottom: 24px;
	}
	.court {
		display: flex;
		flex-direction: column;
		gap: 8px;
		min-height: 96px;
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
	.players {
		display: flex;
		flex-direction: column;
		gap: 2px;
		font-size: 17px;
		font-weight: 500;
	}
	.next-title {
		font-size: 13px;
		font-weight: 600;
		color: var(--text-2);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.next {
		list-style: none;
		margin: 0;
		padding: 0;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
	}
	.next li {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 12px;
		padding: 8px 12px;
		border-bottom: 1px solid var(--border);
	}
	.next li:last-child {
		border-bottom: none;
	}
	.num {
		font-weight: 600;
	}
	@media (max-width: 640px) {
		.courts {
			grid-template-columns: 1fr;
			gap: 8px;
		}
	}
</style>
