<script lang="ts">
	import { resolve } from '$app/paths';
	import type { EventSummary } from '../events.js';
	import { PROGRESS_LABEL, VISIBILITY_LABEL, formatDate } from '../format.js';

	let {
		events,
		showVisibility = false
	}: {
		events: EventSummary[];
		showVisibility?: boolean;
	} = $props();
</script>

<ul class="list">
	{#each events as event (event.id)}
		<li>
			<a class="title" href={resolve('/e/[id]', { id: event.id })}>{event.title}</a>
			<span class="muted">{formatDate(event.date)}{event.venue ? ` · ${event.venue}` : ''}</span>
			<span class="badges">
				{#if showVisibility && event.visibility === 'draft'}
					<span class="badge draft">{VISIBILITY_LABEL.draft}</span>
				{/if}
				<span class="badge" class:running={event.progress === 'running'}>
					{PROGRESS_LABEL[event.progress]}
				</span>
			</span>
		</li>
	{/each}
</ul>

<style>
	.list {
		list-style: none;
		margin: 0;
		padding: 0;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
	}
	li {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 4px 12px;
		padding: 10px 14px;
		border-bottom: 1px solid var(--border);
	}
	li:last-child {
		border-bottom: none;
	}
	.title {
		font-weight: 600;
	}
	.badges {
		margin-left: auto;
		display: flex;
		gap: 6px;
	}
</style>
