<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import type { MatchFormat } from '@volan/domain';
	import { connection } from '#lib/connection.svelte.js';
	import { openEvent } from '#lib/event-store.svelte.js';
	import { todayIso } from '#lib/format.js';
	import { uuidv7 } from '#lib/ids.js';
	import { domainErrorText } from '#lib/messages.js';
	import { session } from '#lib/session.svelte.js';
	import FormatFields from '#lib/ui/FormatFields.svelte';

	let title = $state('');
	let date = $state(todayIso());
	let venue = $state('');
	let courts = $state(4);
	let format = $state<MatchFormat>({ points: 21, bestOf: 1, deciderPoints: 21 });
	let error = $state<string | null>(null);
	let waiting = $state(false);

	// Событие создаётся сразу на устройстве (без сети — тоже, D31) и уходит на сервер через очередь
	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (!session.user) return;
		error = null;
		waiting = true;
		const id = uuidv7();
		const result = openEvent(id).dispatch({
			type: 'event.create',
			payload: {
				title: title.trim(),
				date,
				venue: venue.trim() || null,
				courts,
				// Решающая короче — только при игре до 21
				defaultFormat: {
					...format,
					deciderPoints: format.points === 15 ? 15 : format.deciderPoints
				},
				ownerId: session.user.id
			}
		});
		waiting = false;
		if (!result.ok) {
			error = domainErrorText(result.error);
			return;
		}
		await goto(resolve('/e/[id]/settings', { id }));
	}
</script>

<svelte:head>
	<title>Новое событие — volan-events</title>
</svelte:head>

<form class="card create" onsubmit={submit}>
	<h1>Новое событие</h1>
	<label class="field">
		<span>Название</span>
		<input bind:value={title} required maxlength="200" placeholder="Осенний турнир клуба" />
	</label>
	<div class="row two">
		<label class="field">
			<span>Дата</span>
			<input type="date" bind:value={date} required />
		</label>
		<label class="field">
			<span>Кортов</span>
			<input type="number" bind:value={courts} min="1" max="50" required />
		</label>
	</div>
	<label class="field">
		<span>Место</span>
		<input bind:value={venue} maxlength="200" placeholder="Зал, адрес" />
	</label>
	<FormatFields bind:format />
	{#if error}
		<p class="error-text">{error}</p>
	{/if}
	{#if !connection.online}
		<p class="muted">Нет связи — событие создастся на этом устройстве и уйдёт на сервер позже.</p>
	{/if}
	<div class="row">
		<button class="btn primary" type="submit" disabled={waiting}>Создать</button>
		<a class="btn ghost" href={resolve('/my')}>Отмена</a>
	</div>
</form>

<style>
	.create {
		max-width: 520px;
	}
	.two > .field {
		flex: 1;
		min-width: 140px;
	}
</style>
