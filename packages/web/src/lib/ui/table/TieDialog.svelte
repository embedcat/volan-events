<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import type { EventStore } from '../../event-store.svelte.js';
	import { entryName } from '../../names.js';

	let {
		store,
		groupId,
		entryIds,
		firstPlace,
		onclose
	}: {
		store: EventStore;
		groupId: string;
		entryIds: string[]; // равные участники в нынешнем порядке
		firstPlace: number; // место, с которого начинается набор
		onclose: () => void;
	} = $props();

	let order = $state(untrack(() => [...entryIds]));
	let dialog = $state<HTMLDialogElement>();

	onMount(() => dialog?.showModal());

	function swap(i: number, j: number) {
		const next = [...order];
		[next[i], next[j]] = [next[j] as string, next[i] as string];
		order = next;
	}

	function save() {
		const ok = store.run(
			{ type: 'group.resolveTie', payload: { groupId, order } },
			'Места по жребию расставлены'
		);
		if (ok) dialog?.close();
	}
</script>

<dialog bind:this={dialog} class="tie" {onclose}>
	<h2>Жребий</h2>
	<p class="muted">
		Участники равны по всем показателям. Проведите жребий и расставьте их по местам.
	</p>
	<ol class="order">
		{#each order as id, i (id)}
			<li>
				<span class="place">{firstPlace + i}</span>
				<span class="who">{store.view ? entryName(store.view, store.name, id) : ''}</span>
				<button
					class="btn small"
					aria-label="Выше"
					disabled={i === 0}
					onclick={() => swap(i, i - 1)}
				>
					↑
				</button>
				<button
					class="btn small"
					aria-label="Ниже"
					disabled={i === order.length - 1}
					onclick={() => swap(i, i + 1)}
				>
					↓
				</button>
			</li>
		{/each}
	</ol>
	<div class="row actions">
		<button class="btn" onclick={() => dialog?.close()}>Отмена</button>
		<button class="btn primary" onclick={save}>Сохранить</button>
	</div>
</dialog>

<style>
	.tie {
		width: min(480px, calc(100vw - 32px));
		padding: 20px;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius);
		background: var(--surface);
		color: var(--text);
	}
	.tie::backdrop {
		background: rgb(0 0 0 / 0.4);
	}
	.order {
		list-style: none;
		margin: 0 0 16px;
		padding: 0;
	}
	.order li {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 0;
		border-bottom: 1px solid var(--border);
	}
	.place {
		width: 24px;
		font-weight: 600;
	}
	.who {
		flex: 1;
	}
	.actions {
		justify-content: flex-end;
	}
</style>
