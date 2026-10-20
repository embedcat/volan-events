<script lang="ts">
	import type { EventStore } from '../../event-store.svelte.js';
	import { categoryGroup, groupMatches, scheduleInfo } from '../../event-view.js';
	import { MATCHES, ROUNDS, plural } from '../../format.js';
	import { randomSeed } from '../../ids.js';
	import { entryName } from '../../names.js';

	let { store }: { store: EventStore } = $props();
	const ev = $derived(store.view);
	const category = $derived(ev ? Object.values(ev.categories)[0] : undefined);
	const group = $derived(ev && category ? categoryGroup(ev, category.id) : undefined);
	const info = $derived(ev && group ? scheduleInfo(ev, group) : null);
	const rounds = $derived.by(() => {
		if (!ev || !group) return [];
		const byRound: { round: number; pairs: string[] }[] = [];
		for (const m of groupMatches(ev, group.id)) {
			let round = byRound.find((r) => r.round === m.round);
			if (!round) byRound.push((round = { round: m.round, pairs: [] }));
			round.pairs.push(
				`№${m.number} ${entryName(ev, store.name, m.sideA)} – ${entryName(ev, store.name, m.sideB)}`
			);
		}
		return byRound;
	});

	function generate(message: string) {
		if (group) {
			store.run(
				{ type: 'group.generateSchedule', payload: { groupId: group.id, seed: randomSeed() } },
				message
			);
		}
	}

	function clear() {
		if (group)
			store.run(
				{ type: 'group.clearSchedule', payload: { groupId: group.id } },
				'Расписание убрано'
			);
	}
</script>

{#if ev && group && info}
	<section class="card">
		<h2>Расписание</h2>
		{#if !info.exists}
			<p class="muted">
				Круговая система: каждый с каждым, сильнейшие по рейтингу встречаются в последнем туре.
			</p>
			<button
				class="btn primary"
				disabled={group.entryIds.length < 2}
				onclick={() => generate('Расписание составлено')}
			>
				Составить расписание
			</button>
		{:else}
			<p>{plural(info.matches, MATCHES)}, {plural(info.rounds, ROUNDS)}.</p>
			{#if !info.started}
				<div class="row">
					<button class="btn" onclick={() => generate('Расписание пересобрано')}>Пересобрать</button
					>
					<button class="btn danger" onclick={clear}>Убрать расписание</button>
				</div>
			{:else}
				<p class="muted">Матчи уже вызывались — пересобрать нельзя.</p>
			{/if}
			<details>
				<summary>Матчи по турам</summary>
				{#each rounds as round (round.round)}
					<div class="round">
						<strong>Тур {round.round}</strong>
						{#each round.pairs as pair (pair)}
							<div>{pair}</div>
						{/each}
					</div>
				{/each}
			</details>
		{/if}
	</section>
{/if}

<style>
	details {
		margin-top: 12px;
	}
	summary {
		cursor: pointer;
		color: var(--accent);
	}
	.round {
		margin-top: 8px;
	}
</style>
