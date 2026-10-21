<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { api } from '../../api.js';
	import { type EventStore, closeEvent } from '../../event-store.svelte.js';
	import { localDb } from '../../local-db.js';
	import { apiErrorText } from '../../messages.js';
	import { toasts } from '../../toasts.svelte.js';

	let { store }: { store: EventStore } = $props();
	const ev = $derived(store.view);
	const anyCalled = $derived(
		ev ? Object.values(ev.matches).some((m) => m.status !== 'pending') : false
	);

	let confirmTitle = $state('');
	let deleting = $state(false);

	// Единственное действие с подтверждением: удаление необратимо (D72)
	async function remove() {
		if (!ev || confirmTitle !== ev.title) return;
		deleting = true;
		try {
			await api(`/events/${store.id}`, { method: 'DELETE' });
			closeEvent(store.id);
			await localDb.deleteEvent(store.id);
			toasts.show(`Событие «${ev.title}» удалено`);
			await goto(resolve('/my'));
		} catch (error) {
			toasts.error(apiErrorText(error));
		} finally {
			deleting = false;
		}
	}
</script>

{#if ev}
	<section class="card">
		<h2>Турнир</h2>
		{#if ev.progress === 'setup'}
			<p class="muted">Турнир начинается кнопкой в «Готовности к старту».</p>
		{:else if ev.progress === 'running'}
			<div class="row">
				<button
					class="btn"
					onclick={() => store.run({ type: 'event.finish', payload: {} }, 'Турнир завершён')}
				>
					Завершить турнир
				</button>
				{#if !anyCalled}
					<button
						class="btn ghost"
						onclick={() =>
							store.run({ type: 'event.backToSetup', payload: {} }, 'Турнир возвращён в настройку')}
					>
						Вернуть в настройку
					</button>
				{/if}
			</div>
		{:else}
			<p class="muted">Турнир завершён. Чтобы исправить итоги, верните его в работу.</p>
			<button
				class="btn"
				onclick={() =>
					store.run({ type: 'event.reopen', payload: {} }, 'Турнир возвращён в работу')}
			>
				Вернуть в работу
			</button>
		{/if}
	</section>

	<section class="card danger-zone">
		<h2>Удаление события</h2>
		<p class="muted">Необратимо. Чтобы подтвердить, введите название события.</p>
		<div class="row">
			<input class="grow" bind:value={confirmTitle} placeholder={ev.title} />
			<button class="btn danger" disabled={confirmTitle !== ev.title || deleting} onclick={remove}>
				Удалить событие
			</button>
		</div>
	</section>
{/if}

<style>
	.danger-zone {
		border-color: color-mix(in srgb, var(--danger) 40%, var(--border));
	}
</style>
