<script lang="ts">
	import type { PlayerFields } from '@volan/domain';
	import { untrack } from 'svelte';
	import type { RegistryPlayer } from '../../registry.svelte.js';

	let {
		player,
		onsave,
		oncancel
	}: {
		player: RegistryPlayer;
		// Только изменённые поля и их прежние значения — для защиты от чужой правки
		onsave: (changes: Partial<PlayerFields>, expected: Partial<PlayerFields>) => void;
		oncancel: () => void;
	} = $props();

	const initial = untrack(() => player);
	const hasPrivate = 'contact' in initial; // закрытые поля видны автору и суперюзеру (D107)
	let lastName = $state(initial.lastName);
	let firstName = $state(initial.firstName);
	let gender = $state(initial.gender);
	let club = $state(initial.club ?? '');
	let rating = $state<number | null>(initial.rating);
	let birthYear = $state<number | null>(initial.birthYear ?? null);
	let contact = $state(initial.contact ?? '');

	const numberOrNull = (n: number | null) => (n === null || Number.isNaN(n) ? null : Math.round(n));

	function submit(event: SubmitEvent) {
		event.preventDefault();
		const next: Partial<PlayerFields> = {
			lastName: lastName.trim(),
			firstName: firstName.trim(),
			gender,
			club: club.trim() || null,
			rating: numberOrNull(rating),
			...(hasPrivate && { birthYear: numberOrNull(birthYear), contact: contact.trim() || null })
		};
		const changes: Partial<PlayerFields> = {};
		const expected: Partial<PlayerFields> = {};
		for (const key of Object.keys(next) as (keyof PlayerFields)[]) {
			const before = initial[key] ?? null;
			if (next[key] !== before) {
				Object.assign(changes, { [key]: next[key] });
				Object.assign(expected, { [key]: before });
			}
		}
		if (Object.keys(changes).length === 0) oncancel();
		else onsave(changes, expected);
	}
</script>

<form class="edit" onsubmit={submit}>
	<div class="row">
		<label class="field grow">
			<span>Фамилия</span>
			<input bind:value={lastName} required maxlength="100" />
		</label>
		<label class="field grow">
			<span>Имя</span>
			<input bind:value={firstName} required maxlength="100" />
		</label>
		<label class="field">
			<span>Пол</span>
			<select bind:value={gender}>
				<option value="M">М</option>
				<option value="F">Ж</option>
			</select>
		</label>
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
		{#if hasPrivate}
			<label class="field">
				<span>Год рождения</span>
				<input type="number" bind:value={birthYear} min="1900" max="2100" size="6" />
			</label>
			<label class="field grow">
				<span>Контакт (видят автор и суперюзер)</span>
				<input bind:value={contact} maxlength="200" />
			</label>
		{/if}
	</div>
	<div class="row">
		<button class="btn primary small" type="submit">Сохранить</button>
		<button class="btn ghost small" type="button" onclick={oncancel}>Отмена</button>
	</div>
</form>

<style>
	.edit {
		padding: 12px;
		border: 1px solid var(--accent);
		border-radius: var(--radius);
		background: var(--surface);
	}
</style>
