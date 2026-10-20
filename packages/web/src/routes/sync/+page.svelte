<script lang="ts">
	import { conflicts } from '#lib/conflicts.svelte.js';
	import { formatTime } from '#lib/format.js';
	import { outbox } from '#lib/outbox.svelte.js';
	import ConflictCard from '#lib/ui/ConflictCard.svelte';

	// Синхронизация и конфликты (docs/screens.md, «/sync»)
	const STATUS = {
		idle: 'онлайн',
		sending: 'отправка…',
		offline: 'нет связи',
		unauthorized: 'вход истёк — войдите снова'
	} as const;
</script>

<svelte:head>
	<title>Синхронизация — volan-events</title>
</svelte:head>

<h1>Синхронизация</h1>

<section class="card status">
	<p>
		Состояние: <strong>{STATUS[outbox.status]}</strong>
		{#if outbox.lastSyncAt}
			· последняя отправка {formatTime(outbox.lastSyncAt)}
		{/if}
		· ждут отправки: {outbox.pending.length}
	</p>
	{#if outbox.pending.length > 0 && outbox.status !== 'sending'}
		<button class="btn small" onclick={() => outbox.resume()}>Отправить сейчас</button>
	{/if}
</section>

<h2>Конфликты</h2>
{#if conflicts.items.length === 0}
	<p class="muted">Конфликтов нет: все изменения со всех ваших устройств приняты сервером.</p>
{:else}
	<p class="muted">
		Эти изменения сервер не принял: пока вы работали, то же место изменили с другого устройства или
		действие стало недопустимым. Решите по каждому — применить своё или отбросить.
	</p>
	<div class="list">
		{#each conflicts.items as item (item.id)}
			<ConflictCard {item} />
		{/each}
	</div>
{/if}

<style>
	.status {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		margin-bottom: 24px;
	}
	.status p {
		margin: 0;
	}
	.list {
		display: flex;
		flex-direction: column;
		gap: 12px;
		max-width: 760px;
	}
</style>
