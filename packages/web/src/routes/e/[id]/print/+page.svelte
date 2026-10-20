<script lang="ts">
	import { type Category, entryRating } from '@volan/domain';
	import {
		DISCIPLINE_LABEL,
		categoryGroup,
		categoryTitle,
		activeLots,
		groupMatches,
		groupStandings,
		resultText
	} from '#lib/event-view.js';
	import { formatDate, formatLabel, formatMinutes, formatTime, minutesSince } from '#lib/format.js';
	import { entryName } from '#lib/names.js';
	import GroupTable from '#lib/ui/table/GroupTable.svelte';
	import type { PageProps } from './$types';

	// Итоговый протокол (docs/screens.md, «Итоговый протокол»): печать из браузера, PDF — через неё
	let { data }: PageProps = $props();
	const reader = $derived(data.store ?? data.guest);
	const ev = $derived(reader?.view ?? null);

	const category = $derived(
		ev ? (Object.values(ev.categories)[0] as Category | undefined) : undefined
	);
	const group = $derived(ev && category ? categoryGroup(ev, category.id) : undefined);
	const stage = $derived(ev && group ? ev.stages[group.stageId] : undefined);
	const standings = $derived(ev && group ? groupStandings(ev, group) : null);
	const lotIds = $derived(new Set(ev && group ? activeLots(ev, group).flat() : []));
	const matches = $derived(ev && group ? groupMatches(ev, group.id) : []);
	const rounds = $derived([...Map.groupBy(matches, (m) => m.round)].sort(([a], [b]) => a - b));

	// Начало — первый вызов на корт, окончание — последний результат
	const started = $derived(
		matches.flatMap((m) => (m.calledAt ? [m.calledAt] : [])).sort()[0] ?? null
	);
	const finished = $derived(
		matches
			.flatMap((m) => (m.finishedAt ? [m.finishedAt] : []))
			.sort()
			.at(-1) ?? null
	);

	const name = (entryId: string) => (ev && reader ? entryName(ev, reader.name, entryId) : '');
	const club = (entryId: string) =>
		[...new Set(ev?.entries[entryId]?.players.map((p) => p.club).filter(Boolean))].join(', ');
	const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');
</script>

<svelte:head>
	<title>Протокол — {ev?.title ?? 'событие'}</title>
</svelte:head>

{#if reader && ev}
	<div class="toolbar no-print">
		<button class="btn primary" onclick={() => print()}>Печать</button>
		<span class="muted">Откроется окно печати браузера; там же можно сохранить PDF.</span>
	</div>

	<article class="protocol">
		<h1>{ev.title}</h1>
		<p>
			{formatDate(ev.date)}{ev.venue ? ` · ${ev.venue}` : ''} · кортов: {ev.courts.length}
			{#if started}· начало {formatTime(started)}{/if}
			{#if finished && ev.progress === 'finished'}· окончание {formatTime(finished)}{/if}
		</p>

		{#if category && group && standings && stage}
			<h2>
				{categoryTitle(category)} — {DISCIPLINE_LABEL[category.discipline].toLowerCase()} разряд
			</h2>
			<p>Формат: {formatLabel(stage.format)}. Группа {group.name}, круговая система.</p>
			{#if !standings.complete}
				<p class="warn-text">Сыграны не все матчи — места предварительные.</p>
			{/if}

			<GroupTable {ev} lookup={reader.name} {group} {standings} {lotIds} />

			<h3>Места</h3>
			<table class="table">
				<thead>
					<tr>
						<th class="num">Место</th>
						<th>Участник</th>
						<th>Клуб / город</th>
						<th class="num">Рейтинг</th>
						<th class="num">П-П</th>
						<th class="num">Партии</th>
						<th class="num">Очки</th>
					</tr>
				</thead>
				<tbody>
					{#each standings.rows as row (row.entryId)}
						<tr>
							<td class="num">
								{row.place === row.placeTo ? row.place : `${row.place}–${row.placeTo}`}{lotIds.has(
									row.entryId
								)
									? ' (жребий)'
									: ''}
							</td>
							<td>{name(row.entryId)}{row.withdrawn ? ' (снят)' : ''}</td>
							<td>{club(row.entryId) || '—'}</td>
							<td class="num">{entryRating(ev.entries[row.entryId]?.players ?? []) ?? '—'}</td>
							<td class="num">{row.wins}-{row.losses}</td>
							<td class="num">{row.gamesWon}:{row.gamesLost}</td>
							<td class="num">{signed(row.pointsWon - row.pointsLost)}</td>
						</tr>
					{/each}
				</tbody>
			</table>

			<h3>Матчи</h3>
			<table class="table matches">
				<thead>
					<tr>
						<th class="num">№</th>
						<th>Участники</th>
						<th>Счёт</th>
						<th class="num">Корт</th>
						<th class="num">Начало</th>
						<th class="num">Длит.</th>
					</tr>
				</thead>
				{#each rounds as [round, list] (round)}
					<tbody>
						<tr class="round"><th colspan="6">Тур {round}</th></tr>
						{#each list as m (m.id)}
							<tr>
								<td class="num">{m.number}</td>
								<td>{name(m.sideA)} – {name(m.sideB)}</td>
								<td>
									{m.status === 'finished'
										? resultText(ev, reader.name, m)
										: m.status === 'on_court'
											? 'идёт'
											: 'не сыгран'}
								</td>
								<td class="num">{m.court ?? ''}</td>
								<td class="num">{m.calledAt ? formatTime(m.calledAt) : ''}</td>
								<td class="num">
									{m.calledAt && m.finishedAt
										? formatMinutes(minutesSince(m.calledAt, Date.parse(m.finishedAt)))
										: ''}
								</td>
							</tr>
						{/each}
					</tbody>
				{/each}
			</table>
			<p class="muted legend">
				н/я — неявка, отказ — участник прекратил матч по ходу, снят — участник выбыл из турнира.
			</p>
		{:else}
			<p class="muted">Категория ещё не создана.</p>
		{/if}
	</article>
{/if}

<style>
	.toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 12px;
		margin-bottom: 16px;
	}
	.protocol {
		max-width: 960px;
	}
	.protocol h1 {
		margin-bottom: 4px;
	}
	.protocol h2 {
		margin-top: 20px;
	}
	.protocol h3 {
		margin-top: 20px;
	}
	.protocol p {
		margin: 0 0 8px;
	}
	.round th {
		text-align: left;
		background: var(--surface-2);
	}
	.legend {
		margin-top: 8px;
		font-size: 12px;
	}
	@media print {
		.protocol {
			max-width: none;
		}
		.protocol :global(.table th),
		.protocol :global(.table td) {
			padding: 3px 6px;
		}
		.protocol :global(.scroll) {
			overflow: visible;
		}
		tbody {
			break-inside: avoid;
		}
	}
</style>
