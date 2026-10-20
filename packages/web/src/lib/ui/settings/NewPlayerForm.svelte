<script lang="ts">
	import { untrack } from 'svelte';
	import { uuidv7 } from '../../ids.js';
	import { type RegistryPlayer, registry } from '../../registry.svelte.js';
	import { session } from '../../session.svelte.js';

	let {
		gender: fixedGender,
		initialName = '',
		oncreated,
		oncancel
	}: {
		gender: 'M' | 'F' | null; // пол задан разрядом — выбирать не нужно
		initialName?: string;
		oncreated: (player: RegistryPlayer) => void;
		oncancel: () => void;
	} = $props();

	// «Иванов Иван» из строки поиска — сразу в фамилию и имя (только начальные значения формы)
	const [initialLast = '', initialFirst = ''] = untrack(() => initialName)
		.trim()
		.split(/\s+/);
	let lastName = $state(initialLast);
	let firstName = $state(initialFirst);
	let gender = $state<'M' | 'F'>(untrack(() => fixedGender) ?? 'M');
	let club = $state('');
	let rating = $state<number | null>(null);
	let birthYear = $state<number | null>(null);
	let contact = $state('');

	function submit(event: SubmitEvent) {
		event.preventDefault();
		const user = session.user;
		if (!user) return;
		const id = uuidv7();
		const done = registry.dispatch(
			{
				type: 'player.create',
				payload: {
					id,
					lastName: lastName.trim(),
					firstName: firstName.trim(),
					gender: fixedGender ?? gender,
					club: club.trim() || null,
					rating: rating === null || Number.isNaN(rating) ? null : Math.round(rating),
					birthYear: birthYear === null || Number.isNaN(birthYear) ? null : Math.round(birthYear),
					contact: contact.trim() || null,
					externalId: null,
					createdBy: user.id
				}
			},
			{ userId: user.id, role: user.role }
		);
		const player = registry.get(id);
		if (done && player) oncreated(player);
	}
</script>

<form class="new-player" onsubmit={submit}>
	<div class="row">
		<label class="field grow">
			<span>Фамилия</span>
			<input bind:value={lastName} required maxlength="100" />
		</label>
		<label class="field grow">
			<span>Имя</span>
			<input bind:value={firstName} required maxlength="100" />
		</label>
		{#if !fixedGender}
			<label class="field">
				<span>Пол</span>
				<select bind:value={gender}>
					<option value="M">М</option>
					<option value="F">Ж</option>
				</select>
			</label>
		{/if}
	</div>
	<div class="row">
		<label class="field grow">
			<span>Клуб / город</span>
			<input bind:value={club} maxlength="200" />
		</label>
		<label class="field">
			<span>Рейтинг</span>
			<input type="number" bind:value={rating} size="6" />
		</label>
	</div>
	<div class="row">
		<label class="field">
			<span>Год рождения</span>
			<input type="number" bind:value={birthYear} min="1900" max="2100" size="6" />
		</label>
		<label class="field grow">
			<span>Контакт (видите только вы и суперюзер)</span>
			<input bind:value={contact} maxlength="200" />
		</label>
	</div>
	<div class="row">
		<button class="btn primary small" type="submit">Создать игрока</button>
		<button class="btn ghost small" type="button" onclick={oncancel}>Отмена</button>
	</div>
</form>

<style>
	.new-player {
		border: 1px dashed var(--border-strong);
		border-radius: var(--radius);
		padding: 12px;
		margin-top: 8px;
	}
</style>
