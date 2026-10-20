<script lang="ts">
	import { type MatchFormat, type Side, gamePointsAt } from '@volan/domain';
	import { onMount, tick, untrack } from 'svelte';
	import { clock } from '../clock.svelte.js';
	import type { EventStore } from '../event-store.svelte.js';
	import { gamesText, matchFormat } from '../event-view.js';
	import { formatLabel, formatMinutes, minutesSince } from '../format.js';
	import { scoreIssueText } from '../messages.js';
	import { entryName } from '../names.js';
	import {
		type ResultMode,
		assess,
		enterScore,
		entryFromResult,
		nextField,
		otherSide,
		scoreComplete,
		visibleRows
	} from '../score-entry.js';

	let { store, matchId, onclose }: { store: EventStore; matchId: string; onclose: () => void } =
		$props();

	const ev = $derived(store.view);
	const match = $derived(ev?.matches[matchId]);
	const fallback: MatchFormat = { points: 21, bestOf: 1, deciderPoints: 21 };
	const format = $derived(ev && match ? matchFormat(ev, match) : fallback);

	// Что было видно при открытии: если результат успеют изменить с другого устройства,
	// сохранение станет конфликтом, а не молчаливой перезаписью
	const initial = untrack(() => store.view?.matches[matchId]?.result ?? null);
	let mode = $state<ResultMode>(untrack(() => initial?.kind ?? 'played'));
	let loser = $state<Side | null>(
		untrack(() => (initial && initial.kind !== 'played' ? otherSide(initial.winner) : null))
	);
	let entry = $state(untrack(() => entryFromResult(initial)));

	const visible = $derived(visibleRows(entry.rows, format, mode));
	const verdict = $derived(assess(entry.rows, format, mode, loser));
	const touched = $derived(entry.rows.some((r) => r[0] !== '' || r[1] !== ''));

	const sideName = (side: Side) =>
		ev && match ? entryName(ev, store.name, side === 'A' ? match.sideA : match.sideB) : '';

	const winnerText = $derived.by(() => {
		const result = verdict.result;
		if (!result) return null;
		if (result.kind === 'walkover') return 'неявка соперника';
		if (result.kind === 'retired') return 'отказ соперника';
		if (format.bestOf === 1 && result.games.length === 1)
			return gamesText(result.games, result.winner);
		const won = result.games.filter(([a, b]) => (result.winner === 'A' ? a > b : b > a)).length;
		return `${won}:${result.games.length - won}`;
	});

	let dialog = $state<HTMLDialogElement>();
	let saveButton = $state<HTMLButtonElement>();
	const inputs: (HTMLInputElement | undefined)[][] = $state([[], [], []]);

	onMount(() => {
		dialog?.showModal();
		if (mode !== 'walkover' && !touched) inputs[0]?.[0]?.focus();
	});

	// Матч убрали (например, с другого устройства) — закрыть окно
	$effect(() => {
		if (!match) dialog?.close();
	});

	function oninput(event: Event, game: number, side: 0 | 1) {
		const input = event.currentTarget as HTMLInputElement;
		const value = input.value.replace(/\D/g, '').slice(0, 2);
		input.value = value;
		const points = gamePointsAt(format, game);
		const final = scoreComplete(value, points);
		entry = enterScore(entry, game, side, value, points, final);
		if (final) void advance(game, side);
	}

	// Поле покинуто — число считается дописанным
	function onchange(event: Event, game: number, side: 0 | 1) {
		const value = (event.currentTarget as HTMLInputElement).value;
		entry = enterScore(entry, game, side, value, gamePointsAt(format, game), true);
	}

	async function advance(game: number, side: 0 | 1) {
		await tick();
		const next = nextField(entry.rows, visible, game, side);
		if (next) inputs[next.game]?.[next.side]?.focus();
		else saveButton?.focus();
	}

	function onkeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' && verdict.result) {
			event.preventDefault();
			save();
		}
	}

	function toggleMode(next: ResultMode) {
		mode = mode === next ? 'played' : next;
		loser = null;
	}

	function save() {
		const result = verdict.result;
		if (!match || !result) return;
		const games = result.games.map(([a, b]): [number, number] => [a, b]);
		const ok = store.run(
			{
				type: 'match.recordResult',
				payload: { matchId: match.id, result: { ...result, games }, expectedResult: initial }
			},
			`Результат №${match.number} сохранён`
		);
		if (ok) dialog?.close();
	}
</script>

<dialog
	bind:this={dialog}
	class="result"
	{onclose}
	onclick={(e) => {
		if (e.target === dialog) dialog?.close();
	}}
>
	{#if ev && match}
		<header>
			<h2>Матч №{match.number}</h2>
			<span class="muted">
				{#if match.status === 'on_court' && match.calledAt}
					Корт {match.court} · {formatMinutes(minutesSince(match.calledAt, clock.now))} ·
				{:else if match.status === 'pending'}
					без вызова на корт ·
				{/if}
				{formatLabel(format)}
			</span>
		</header>

		{#if mode === 'walkover' || mode === 'retired'}
			<div class="who">
				<span class="muted">{mode === 'walkover' ? 'Кто не явился?' : 'Кто отказался?'}</span>
				<div class="row">
					{#each ['A', 'B'] as const as side (side)}
						<button
							type="button"
							class="btn"
							class:primary={loser === side}
							onclick={() => (loser = side)}
						>
							{sideName(side)}
						</button>
					{/each}
				</div>
			</div>
		{/if}

		{#if mode !== 'walkover'}
			<div class="scores">
				<span></span>
				<span class="name">{sideName('A')}</span>
				<span class="name">{sideName('B')}</span>
				{#each Array.from({ length: visible }, (_, i) => i) as game (game)}
					<span class="muted label">
						Партия {game + 1}{format.bestOf === 3 && game === 2
							? ` (до ${format.deciderPoints})`
							: ''}
					</span>
					{#each [0, 1] as const as side (side)}
						<input
							bind:this={inputs[game]![side]}
							class="score"
							class:suggested={entry.suggested[game]?.[side]}
							inputmode="numeric"
							autocomplete="off"
							aria-label="Партия {game + 1}, {sideName(side === 0 ? 'A' : 'B')}"
							value={entry.rows[game]?.[side] ?? ''}
							oninput={(e) => oninput(e, game, side)}
							onchange={(e) => onchange(e, game, side)}
							onfocus={(e) => e.currentTarget.select()}
							{onkeydown}
						/>
					{/each}
				{/each}
			</div>
		{/if}

		<div class="verdict">
			{#if verdict.result && winnerText}
				<p>
					Победитель: <strong>{sideName(verdict.result.winner)}</strong> · {winnerText}
				</p>
			{/if}
			{#if verdict.missing && verdict.missing !== 'loser' && touched}
				<p class="muted">
					Партия {verdict.missing.game + 1}: {verdict.missing.partial
						? 'введите оба числа'
						: 'введите счёт'}
				</p>
			{/if}
			{#if verdict.issues.length > 0 && (touched || mode !== 'played')}
				<ul class="issues">
					{#each verdict.issues as issue, i (i)}
						<li>{scoreIssueText(issue)}</li>
					{/each}
				</ul>
				{#if verdict.nonStandard}
					<p class="warn-text">Счёт не по правилам — его можно сохранить как есть.</p>
				{/if}
			{/if}
		</div>

		<footer>
			<div class="row">
				<button
					type="button"
					class="btn small"
					class:primary={mode === 'walkover'}
					onclick={() => toggleMode('walkover')}
				>
					Неявка…
				</button>
				<button
					type="button"
					class="btn small"
					class:primary={mode === 'retired'}
					onclick={() => toggleMode('retired')}
				>
					Отказ…
				</button>
			</div>
			<div class="row">
				<button type="button" class="btn" onclick={() => dialog?.close()}>Отмена</button>
				<button
					bind:this={saveButton}
					type="button"
					class="btn primary"
					disabled={!verdict.result}
					onclick={save}
				>
					{verdict.nonStandard ? 'Сохранить как есть' : 'Сохранить'}
				</button>
			</div>
		</footer>
	{/if}
</dialog>

<style>
	.result {
		width: min(620px, calc(100vw - 32px));
		padding: 20px;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius);
		background: var(--surface);
		color: var(--text);
		box-shadow: 0 12px 40px rgb(0 0 0 / 0.25);
	}
	.result::backdrop {
		background: rgb(0 0 0 / 0.4);
	}
	header {
		margin-bottom: 16px;
	}
	header h2 {
		margin-bottom: 2px;
	}
	.who {
		display: flex;
		flex-direction: column;
		gap: 6px;
		margin-bottom: 16px;
	}
	.who .btn {
		white-space: normal;
		text-align: left;
	}
	.scores {
		display: grid;
		grid-template-columns: max-content 1fr 1fr;
		gap: 8px 12px;
		align-items: center;
	}
	.name {
		font-weight: 600;
		overflow-wrap: anywhere;
	}
	.label {
		font-size: 13px;
	}
	.score {
		width: 72px;
		font-size: 20px;
		text-align: center;
	}
	.score.suggested {
		color: var(--text-2);
		border-style: dashed;
	}
	.verdict {
		min-height: 48px;
		margin: 16px 0;
	}
	.verdict p {
		margin: 0 0 6px;
	}
	.issues {
		margin: 0 0 6px;
		padding-left: 18px;
		color: var(--danger);
	}
	footer {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: 8px;
	}
	footer .row:last-child {
		margin-left: auto;
	}
	/* Телефон: на весь экран (D62) */
	@media (max-width: 640px) {
		.result {
			width: 100vw;
			max-width: none;
			height: 100dvh;
			max-height: none;
			margin: 0;
			border: none;
			border-radius: 0;
			display: flex;
			flex-direction: column;
		}
		.result:not([open]) {
			display: none;
		}
		.verdict {
			flex: 1;
		}
		.score {
			width: 100%;
		}
	}
</style>
