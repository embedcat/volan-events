<script lang="ts">
	import type { MatchFormat } from '@volan/domain';

	// Формат матча: только до 21 или до 15; 1 партия или до 2 побед; решающая может быть до 15
	let { format = $bindable() }: { format: MatchFormat } = $props();
</script>

<fieldset class="format">
	<legend>Формат матча</legend>
	<div class="row">
		<label><input type="radio" bind:group={format.points} value={21} /> до 21</label>
		<label><input type="radio" bind:group={format.points} value={15} /> до 15</label>
	</div>
	<div class="row">
		<label><input type="radio" bind:group={format.bestOf} value={1} /> 1 партия</label>
		<label><input type="radio" bind:group={format.bestOf} value={3} /> до 2 побед</label>
	</div>
	{#if format.bestOf === 3 && format.points === 21}
		<div class="row">
			<span class="muted">Решающая партия:</span>
			<label><input type="radio" bind:group={format.deciderPoints} value={21} /> до 21</label>
			<label><input type="radio" bind:group={format.deciderPoints} value={15} /> до 15</label>
		</div>
	{/if}
</fieldset>

<style>
	.format {
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 8px 12px 12px;
		margin: 0 0 12px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	legend {
		font-size: 13px;
		color: var(--text-2);
		padding: 0 4px;
	}
	label {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		margin-right: 12px;
	}
</style>
