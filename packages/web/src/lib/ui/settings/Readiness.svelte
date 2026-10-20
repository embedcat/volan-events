<script lang="ts">
	import type { EventStore } from '../../event-store.svelte.js';
	import { readiness } from '../../event-view.js';

	let { store }: { store: EventStore } = $props();
	const check = $derived(store.view ? readiness(store.view) : null);
</script>

{#if check && store.view?.progress === 'setup'}
	<section class="card">
		<h2>Готовность к старту</h2>
		<ul class="checklist">
			{#each check.items as item (item.text)}
				<li class:ok={item.ok}>
					<span class="mark">{item.ok ? '✓' : '✗'}</span>
					{item.text}
				</li>
			{/each}
		</ul>
		<button
			class="btn primary"
			disabled={!check.ready}
			onclick={() => store.run({ type: 'event.start', payload: {} }, 'Турнир начат')}
		>
			Начать турнир
		</button>
	</section>
{/if}

<style>
	.checklist {
		list-style: none;
		margin: 0 0 12px;
		padding: 0;
	}
	li {
		padding: 2px 0;
		color: var(--danger);
	}
	li.ok {
		color: var(--text);
	}
	.mark {
		display: inline-block;
		width: 18px;
		font-weight: 700;
	}
	li.ok .mark {
		color: var(--ok);
	}
</style>
