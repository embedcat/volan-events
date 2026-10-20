<script lang="ts">
	import type { PayloadOf } from '@volan/domain';
	import type { EventStore } from '../../event-store.svelte.js';
	import { VISIBILITY_LABEL, formatDate } from '../../format.js';

	let { store }: { store: EventStore } = $props();
	const ev = $derived(store.view);

	let editing = $state(false);
	let title = $state('');
	let date = $state('');
	let venue = $state('');

	function edit() {
		if (!ev) return;
		title = ev.title;
		date = ev.date;
		venue = ev.venue ?? '';
		editing = true;
	}

	function save(event: SubmitEvent) {
		event.preventDefault();
		if (!ev) return;
		const payload: PayloadOf<'event.update'> = {};
		if (title.trim() !== ev.title) payload.title = title.trim();
		if (date !== ev.date) payload.date = date;
		if ((venue.trim() || null) !== ev.venue) payload.venue = venue.trim() || null;
		if (Object.keys(payload).length > 0) {
			store.run({ type: 'event.update', payload }, 'Событие изменено');
		}
		editing = false;
	}

	function toggleVisibility() {
		if (!ev) return;
		const published = ev.visibility === 'published';
		store.run(
			{ type: 'event.setVisibility', payload: { visibility: published ? 'draft' : 'published' } },
			published ? 'Событие снято с публикации' : 'Событие опубликовано'
		);
	}
</script>

{#if ev}
	<section class="card">
		<h2>Событие</h2>
		{#if editing}
			<form onsubmit={save}>
				<label class="field">
					<span>Название</span>
					<input bind:value={title} required maxlength="200" />
				</label>
				<div class="row">
					<label class="field grow">
						<span>Дата</span>
						<input type="date" bind:value={date} required />
					</label>
					<label class="field grow">
						<span>Место</span>
						<input bind:value={venue} maxlength="200" />
					</label>
				</div>
				<div class="row">
					<button class="btn primary" type="submit">Сохранить</button>
					<button class="btn ghost" type="button" onclick={() => (editing = false)}>Отмена</button>
				</div>
			</form>
		{:else}
			<dl class="props">
				<dt>Название</dt>
				<dd>{ev.title}</dd>
				<dt>Дата</dt>
				<dd>{formatDate(ev.date)}</dd>
				<dt>Место</dt>
				<dd>{ev.venue ?? '—'}</dd>
				<dt>Видимость</dt>
				<dd>{VISIBILITY_LABEL[ev.visibility]}</dd>
			</dl>
			<div class="row">
				<button class="btn" onclick={edit}>Изменить</button>
				<button class="btn" onclick={toggleVisibility}>
					{ev.visibility === 'published' ? 'Снять с публикации' : 'Опубликовать'}
				</button>
			</div>
		{/if}
	</section>
{/if}
