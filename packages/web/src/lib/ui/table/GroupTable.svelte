<script lang="ts">
	import type { EventState, Group, Match, Standings } from '@volan/domain';
	import { cellText, groupMatches } from '../../event-view.js';
	import { type NameLookup, entryName, entrySurnames } from '../../names.js';

	let {
		ev,
		lookup,
		group,
		standings,
		lotIds,
		onmatch
	}: {
		ev: EventState;
		lookup: NameLookup;
		group: Group;
		standings: Standings;
		lotIds: ReadonlySet<string>; // места по жребию
		onmatch?: (matchId: string) => void; // нажатие на ячейку матча — у владельца
	} = $props();

	const format = $derived(ev.stages[group.stageId]?.format ?? ev.defaultFormat);
	const rows = $derived(new Map(standings.rows.map((r) => [r.entryId, r])));
	// Выделяются равные, которых решит только жребий: пока сыграно не всё, равенство обычное
	const tied = $derived(new Set(standings.complete ? standings.unresolved.flat() : []));
	const byPair = $derived(
		new Map(groupMatches(ev, group.id).map((m) => [pairKey(m.sideA, m.sideB), m]))
	);

	function pairKey(a: string, b: string): string {
		return a < b ? `${a}|${b}` : `${b}|${a}`;
	}

	// Число со знаком: «+2», «−3», «0»
	function signed(n: number): string {
		return n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0';
	}

	function cell(row: string, match: Match | undefined) {
		if (!match) return { text: '', kind: '' };
		if (match.status === 'on_court') return { text: `корт ${match.court}`, kind: 'live' };
		if (match.status !== 'finished' || !match.result) return { text: '', kind: '' };
		const side = match.sideA === row ? 'A' : 'B';
		return {
			text: cellText(match.result, side, format),
			kind: match.result.winner === side ? 'win' : 'loss'
		};
	}
</script>

<div class="scroll">
	<table class="grid">
		<thead>
			<tr>
				<th class="name">Участник</th>
				{#each group.entryIds as col (col)}
					<th class="head" title={entryName(ev, lookup, col)}>{entrySurnames(ev, lookup, col)}</th>
				{/each}
				<th class="num" title="Победы — поражения">П-П</th>
				<th class="num" title="Разница партий">Парт.</th>
				<th class="num" title="Разница очков">Очки</th>
				<th class="num">Место</th>
			</tr>
		</thead>
		<tbody>
			{#each group.entryIds as row (row)}
				{@const stats = rows.get(row)}
				<tr class:tied={tied.has(row)}>
					<th class="name" scope="row">
						{entryName(ev, lookup, row)}
						{#if ev.entries[row]?.status === 'withdrawn'}<span class="badge">снят</span>{/if}
					</th>
					{#each group.entryIds as col (col)}
						{#if col === row}
							<td class="diag"></td>
						{:else}
							{@const match = byPair.get(pairKey(row, col))}
							{@const c = cell(row, match)}
							<td class="cell {c.kind}">
								{#if match && onmatch && c.text}
									<button
										type="button"
										title="Матч №{match.number}"
										onclick={() => onmatch(match.id)}
									>
										{c.text}
									</button>
								{:else}
									{c.text}
								{/if}
							</td>
						{/if}
					{/each}
					{#if stats}
						<td class="num">{stats.wins}-{stats.losses}</td>
						<td class="num">{signed(stats.gamesWon - stats.gamesLost)}</td>
						<td class="num">{signed(stats.pointsWon - stats.pointsLost)}</td>
						<td class="num place">
							{stats.place === stats.placeTo ? stats.place : `${stats.place}–${stats.placeTo}`}
							{#if lotIds.has(row)}<span class="lot" title="По жребию">ж</span>{/if}
						</td>
					{:else}
						<td></td><td></td><td></td><td></td>
					{/if}
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<style>
	/* Телефон: прокрутка вбок, колонка имён закреплена (D65) */
	.scroll {
		overflow-x: auto;
		border: 1px solid var(--border);
		border-radius: var(--radius);
	}
	.grid {
		border-collapse: collapse;
		background: var(--surface);
		width: 100%;
	}
	.grid th,
	.grid td {
		padding: 6px 8px;
		border: 1px solid var(--border);
		text-align: center;
		white-space: nowrap;
	}
	.grid thead th {
		font-size: 12px;
		font-weight: 600;
		color: var(--text-2);
		background: var(--surface-2);
	}
	.head {
		max-width: 80px;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.name {
		position: sticky;
		left: 0;
		z-index: 1;
		text-align: left !important;
		font-weight: 500;
		background: var(--surface);
	}
	thead .name {
		background: var(--surface-2);
	}
	.diag {
		background: var(--surface-2);
		background-image: repeating-linear-gradient(
			45deg,
			transparent 0 4px,
			color-mix(in srgb, var(--border-strong) 50%, transparent) 4px 5px
		);
	}
	.cell {
		min-width: 64px;
	}
	.cell button {
		border: none;
		background: none;
		color: inherit;
		font: inherit;
		cursor: pointer;
		padding: 0;
		text-decoration: underline dotted;
		text-underline-offset: 3px;
	}
	.win {
		font-weight: 600;
		color: var(--ok);
	}
	.loss {
		color: var(--text-2);
	}
	.live {
		color: var(--accent);
		font-size: 12px;
	}
	.num {
		text-align: right !important;
	}
	.place {
		font-weight: 600;
	}
	.tied th,
	.tied td {
		background: var(--warn-soft);
	}
	.lot {
		margin-left: 4px;
		font-size: 11px;
		font-weight: 400;
		color: var(--text-2);
	}
</style>
