<script lang="ts">
	import { entryRating } from '@volan/domain';
	import type { EventStore } from '../../event-store.svelte.js';
	import { categoryEntries, isDoubles, slotGender } from '../../event-view.js';
	import { uuidv7 } from '../../ids.js';
	import { entryName, playerName } from '../../names.js';
	import type { RegistryPlayer } from '../../registry.svelte.js';
	import Menu from '../Menu.svelte';
	import PlayerPicker from './PlayerPicker.svelte';

	let { store }: { store: EventStore } = $props();
	const ev = $derived(store.view);
	const category = $derived(ev ? Object.values(ev.categories)[0] : undefined);
	const entries = $derived(ev && category ? categoryEntries(ev, category.id) : []);
	const slots = $derived(category && isDoubles(category.discipline) ? 2 : 1);

	let picked = $state<(RegistryPlayer | null)[]>([null, null]);

	// Уже заявленные в категорию и выбранные в соседней позиции
	const taken = $derived(
		new Set([
			...entries.flatMap((e) => e.players.map((p) => p.playerId)),
			...picked.flatMap((p) => (p ? [p.id] : []))
		])
	);
	const ready = $derived(picked.slice(0, slots).every((p) => p !== null));
	const pickedRating = $derived(
		ready ? entryRating(picked.slice(0, slots).map((p) => ({ rating: p?.rating ?? null }))) : null
	);
	const outOfRange = $derived(
		!!category &&
			pickedRating !== null &&
			((category.ratingMin !== null && pickedRating < category.ratingMin) ||
				(category.ratingMax !== null && pickedRating > category.ratingMax))
	);

	function add() {
		if (!category || !ready) return;
		const players = picked.slice(0, slots).map((p) => ({
			playerId: p!.id,
			gender: p!.gender,
			rating: p!.rating,
			club: p!.club
		}));
		const ok = store.run(
			{ type: 'entry.add', payload: { id: uuidv7(), categoryId: category.id, players } },
			'Участник добавлен'
		);
		if (ok) picked = [null, null];
	}

	function remove(entryId: string) {
		store.run({ type: 'entry.remove', payload: { entryId } }, 'Участник удалён');
	}

	// Сыгранные матчи участника: с ними его можно только снять, не удалить
	const hasResults = (entryId: string) =>
		!!ev &&
		Object.values(ev.matches).some(
			(m) => m.status === 'finished' && (m.sideA === entryId || m.sideB === entryId)
		);

	// Замена игрока в паре (docs/screens.md, «Участники»): какой позиции ищем замену
	let replacing = $state<{ entryId: string; slot: number } | null>(null);
	const replacingEntry = $derived(replacing && ev ? ev.entries[replacing.entryId] : undefined);

	function replace(player: RegistryPlayer) {
		if (!replacing || !replacingEntry) return;
		const players = replacingEntry.players.map((p, i) =>
			i === replacing?.slot
				? { playerId: player.id, gender: player.gender, rating: player.rating, club: player.club }
				: p
		);
		const ok = store.run(
			{ type: 'entry.update', payload: { entryId: replacingEntry.id, players } },
			'Состав пары изменён'
		);
		if (ok) replacing = null;
	}

	const snapshotRating = (players: { rating: number | null }[]) => entryRating(players) ?? '—';
	const snapshotClub = (players: { club: string | null }[]) =>
		[...new Set(players.map((p) => p.club).filter(Boolean))].join(', ') || '—';
</script>

{#if ev && category}
	<section class="card">
		<h2>Участники · {entries.length}</h2>
		{#if entries.length > 0}
			<table class="table">
				<thead>
					<tr>
						<th class="num">№</th>
						<th>Участник</th>
						<th>Клуб / город</th>
						<th class="num">Рейтинг</th>
						<th></th>
					</tr>
				</thead>
				<tbody>
					{#each entries as entry, i (entry.id)}
						<tr>
							<td class="num">{i + 1}</td>
							<td>
								{entryName(ev, store.name, entry.id)}
								{#if entry.status === 'withdrawn'}<span class="badge">снят</span>{/if}
							</td>
							<td>{snapshotClub(entry.players)}</td>
							<td class="num">{snapshotRating(entry.players)}</td>
							<td class="num">
								{#if ev.progress !== 'finished'}
									<Menu title="Действия с участником">
										{#if slots === 2}
											{#each entry.players as p, slot (p.playerId)}
												<button
													class="menu-item"
													onclick={() => (replacing = { entryId: entry.id, slot })}
												>
													Заменить: {playerName(store.name, p.playerId)}…
												</button>
											{/each}
										{/if}
										{#if ev.progress === 'running' && entry.status === 'active'}
											<button
												class="menu-item"
												onclick={() =>
													store.run(
														{ type: 'entry.withdraw', payload: { entryId: entry.id } },
														'Участник снят: несыгранные матчи — неявки'
													)}
											>
												Снять с турнира
											</button>
										{/if}
										{#if entry.status === 'withdrawn'}
											<button
												class="menu-item"
												onclick={() =>
													store.run(
														{ type: 'entry.reinstate', payload: { entryId: entry.id } },
														'Участник возвращён'
													)}
											>
												Вернуть
											</button>
										{/if}
										<button
											class="menu-item"
											disabled={hasResults(entry.id)}
											title={hasResults(entry.id)
												? 'Есть сыгранные матчи — можно только снять'
												: ''}
											onclick={() => remove(entry.id)}
										>
											Удалить
										</button>
									</Menu>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{:else}
			<p class="muted">Участников пока нет.</p>
		{/if}

		{#if replacing && replacingEntry}
			{@const current = replacingEntry.players[replacing.slot]}
			<div class="replace">
				<h3>
					Замена в паре {entryName(ev, store.name, replacingEntry.id)}:
					{current ? playerName(store.name, current.playerId) : ''} →
				</h3>
				<div class="row slots">
					<PlayerPicker
						label="Новый игрок пары"
						gender={slotGender(category.discipline, replacing.slot)}
						exclude={taken}
						onpick={replace}
					/>
					<button class="btn ghost" onclick={() => (replacing = null)}>Отмена</button>
				</div>
			</div>
		{/if}

		{#if ev.progress !== 'finished'}
			<h3 class="add-title">Добавить участника</h3>
			<div class="row slots">
				{#each Array.from({ length: slots }, (_, i) => i) as slot (slot)}
					{@const player = picked[slot]}
					{#if player}
						<div class="chosen">
							<span>{player.lastName} {player.firstName}</span>
							<span class="muted">{player.club ?? ''}</span>
							<button class="btn ghost small" onclick={() => (picked[slot] = null)}>×</button>
						</div>
					{:else}
						<PlayerPicker
							label={slots === 2 ? `Игрок ${slot + 1}` : 'Игрок'}
							gender={slotGender(category.discipline, slot)}
							exclude={taken}
							onpick={(p) => (picked[slot] = p)}
						/>
					{/if}
				{/each}
			</div>
			{#if outOfRange}
				<p class="warn-text">
					Рейтинг {pickedRating} вне диапазона категории — добавить всё равно можно.
				</p>
			{/if}
			<button class="btn primary" disabled={!ready} onclick={add}>Добавить</button>
		{/if}
	</section>
{/if}

<style>
	.add-title {
		margin-top: 16px;
	}
	.replace {
		margin-top: 16px;
		padding: 12px;
		border: 1px solid var(--accent);
		border-radius: var(--radius);
	}
	.slots {
		align-items: flex-start;
	}
	.chosen {
		display: flex;
		align-items: center;
		gap: 8px;
		flex: 1;
		min-width: 240px;
		padding: 6px 10px;
		border: 1px solid var(--accent);
		border-radius: var(--radius);
		background: var(--accent-soft);
		margin-bottom: 12px;
	}
	.chosen span:first-child {
		font-weight: 600;
	}
</style>
