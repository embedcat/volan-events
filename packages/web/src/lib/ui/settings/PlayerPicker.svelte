<script lang="ts">
	import { type RegistryPlayer, registry } from '../../registry.svelte.js';
	import NewPlayerForm from './NewPlayerForm.svelte';

	let {
		gender,
		exclude,
		label,
		onpick
	}: {
		gender: 'M' | 'F' | null;
		exclude: ReadonlySet<string>; // уже заявленные в категорию или выбранные рядом
		label: string;
		onpick: (player: RegistryPlayer) => void;
	} = $props();

	let query = $state('');
	let creating = $state(false);

	const found = $derived(
		registry
			.search(query)
			.filter((p) => !exclude.has(p.id) && (gender === null || p.gender === gender))
			.slice(0, 8)
	);
</script>

<div class="picker">
	<label class="field">
		<span>{label}</span>
		<input bind:value={query} placeholder="Фамилия, имя или клуб" autocomplete="off" />
	</label>
	{#if creating}
		<NewPlayerForm
			{gender}
			initialName={query}
			oncreated={(p) => {
				creating = false;
				query = '';
				onpick(p);
			}}
			oncancel={() => (creating = false)}
		/>
	{:else if query.trim()}
		<ul class="found">
			{#each found as player (player.id)}
				<li>
					<button
						type="button"
						onclick={() => {
							query = '';
							onpick(player);
						}}
					>
						<strong>{player.lastName} {player.firstName}</strong>
						<span class="muted">
							{player.club ?? ''}{player.rating !== null ? ` · ${player.rating}` : ''}
						</span>
					</button>
				</li>
			{:else}
				<li class="muted empty">
					{registry.loaded ? 'Никого не нашлось' : 'Справочник загружается…'}
				</li>
			{/each}
		</ul>
		<button type="button" class="btn small" onclick={() => (creating = true)}>
			Новый игрок «{query.trim()}»
		</button>
	{/if}
</div>

<style>
	.picker {
		flex: 1;
		min-width: 240px;
	}
	.found {
		list-style: none;
		margin: -6px 0 8px;
		padding: 0;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
		max-height: 260px;
		overflow: auto;
	}
	.found button {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		width: 100%;
		padding: 6px 10px;
		border: none;
		border-bottom: 1px solid var(--border);
		background: none;
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	.found button:hover {
		background: var(--accent-soft);
	}
	.empty {
		padding: 6px 10px;
	}
</style>
