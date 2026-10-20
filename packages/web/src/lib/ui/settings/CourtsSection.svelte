<script lang="ts">
	import type { MatchFormat } from '@volan/domain';
	import type { EventStore } from '../../event-store.svelte.js';
	import { formatLabel } from '../../format.js';
	import FormatFields from '../FormatFields.svelte';

	let { store }: { store: EventStore } = $props();
	const ev = $derived(store.view);

	let count = $state(0);
	let editingFormat = $state(false);
	let format = $state<MatchFormat>({ points: 21, bestOf: 1, deciderPoints: 21 });

	// Поле числа кортов следует за состоянием, пока его не трогают
	$effect(() => {
		if (ev) count = ev.courts.length;
	});

	function applyCount() {
		if (!ev || count === ev.courts.length) return;
		store.run({ type: 'event.setCourts', payload: { count } }, `Кортов: ${count}`);
	}

	function toggle(court: number, enabled: boolean) {
		store.run(
			{ type: 'court.setEnabled', payload: { court, enabled } },
			enabled ? `Корт ${court} включён` : `Корт ${court} выключен`
		);
	}

	function editFormat() {
		if (!ev) return;
		format = { ...ev.defaultFormat };
		editingFormat = true;
	}

	function saveFormat() {
		store.run(
			{ type: 'event.update', payload: { defaultFormat: { ...format } } },
			'Формат по умолчанию изменён'
		);
		editingFormat = false;
	}
</script>

{#if ev}
	<section class="card">
		<h2>Корты</h2>
		<div class="row">
			<label class="row">
				<span class="muted">Число кортов</span>
				<input class="count" type="number" min="1" max="50" bind:value={count} />
			</label>
			<button class="btn small" disabled={count === ev.courts.length} onclick={applyCount}>
				Применить
			</button>
		</div>
		<div class="courts">
			{#each ev.courts as court (court.number)}
				<label class="court" class:off={!court.enabled}>
					<input
						type="checkbox"
						checked={court.enabled}
						onchange={(e) => toggle(court.number, e.currentTarget.checked)}
					/>
					Корт {court.number}
				</label>
			{/each}
		</div>

		<h3>Формат матча по умолчанию</h3>
		<p class="muted small">Подставляется в новые категории; у категории формат свой.</p>
		{#if editingFormat}
			<FormatFields bind:format />
			<div class="row">
				<button class="btn primary small" onclick={saveFormat}>Сохранить</button>
				<button class="btn ghost small" onclick={() => (editingFormat = false)}>Отмена</button>
			</div>
		{:else}
			<div class="row">
				<span>{formatLabel(ev.defaultFormat)}</span>
				<button class="btn small" onclick={editFormat}>Изменить</button>
			</div>
		{/if}
	</section>
{/if}

<style>
	.count {
		width: 80px;
	}
	.courts {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin: 12px 0 16px;
	}
	.court {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 4px 10px;
		border: 1px solid var(--border);
		border-radius: var(--radius);
	}
	.court.off {
		color: var(--text-2);
		text-decoration: line-through;
	}
	.small {
		font-size: 13px;
		margin: -8px 0 8px;
	}
</style>
