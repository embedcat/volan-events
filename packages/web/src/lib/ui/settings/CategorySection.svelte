<script lang="ts">
	import type { Discipline, MatchFormat, PayloadOf } from '@volan/domain';
	import type { EventStore } from '../../event-store.svelte.js';
	import { DISCIPLINES, DISCIPLINE_LABEL, categoryTitle } from '../../event-view.js';
	import { formatLabel } from '../../format.js';
	import { uuidv7 } from '../../ids.js';
	import FormatFields from '../FormatFields.svelte';

	let { store }: { store: EventStore } = $props();
	const ev = $derived(store.view);
	// MVP — одна категория в событии (D40)
	const category = $derived(ev ? Object.values(ev.categories)[0] : undefined);
	const stage = $derived(category && ev ? ev.stages[category.stageIds[0] ?? ''] : undefined);

	let editing = $state(false);
	let discipline = $state<Discipline>('MS');
	let level = $state('');
	let customName = $state('');
	let ratingMin = $state<number | null>(null);
	let ratingMax = $state<number | null>(null);
	let format = $state<MatchFormat>({ points: 21, bestOf: 1, deciderPoints: 21 });

	function start() {
		if (!ev) return;
		discipline = category?.discipline ?? 'MS';
		level = category?.level ?? '';
		customName = category?.customName ?? '';
		ratingMin = category?.ratingMin ?? null;
		ratingMax = category?.ratingMax ?? null;
		format = { ...(stage?.format ?? ev.defaultFormat) };
		editing = true;
	}

	const orNull = (value: string) => value.trim() || null;
	const numberOrNull = (value: number | null) =>
		value === null || Number.isNaN(value) ? null : Math.round(value);

	function save(event: SubmitEvent) {
		event.preventDefault();
		if (!category) {
			store.run(
				{
					type: 'category.create',
					payload: {
						id: uuidv7(),
						discipline,
						level: orNull(level),
						customName: orNull(customName),
						ratingMin: numberOrNull(ratingMin),
						ratingMax: numberOrNull(ratingMax),
						format: { ...format }
					}
				},
				'Категория создана'
			);
		} else {
			const payload: PayloadOf<'category.update'> = { categoryId: category.id };
			if (discipline !== category.discipline) payload.discipline = discipline;
			if (orNull(level) !== category.level) payload.level = orNull(level);
			if (orNull(customName) !== category.customName) payload.customName = orNull(customName);
			if (numberOrNull(ratingMin) !== category.ratingMin)
				payload.ratingMin = numberOrNull(ratingMin);
			if (numberOrNull(ratingMax) !== category.ratingMax)
				payload.ratingMax = numberOrNull(ratingMax);
			if (JSON.stringify(format) !== JSON.stringify(stage?.format)) payload.format = { ...format };
			if (Object.keys(payload).length > 1)
				store.run({ type: 'category.update', payload }, 'Категория изменена');
		}
		editing = false;
	}

	function remove() {
		if (category) {
			store.run(
				{ type: 'category.delete', payload: { categoryId: category.id } },
				'Категория удалена'
			);
		}
	}
</script>

{#if ev}
	<section class="card">
		<h2>Категория</h2>
		{#if editing}
			<form onsubmit={save}>
				<div class="row">
					<label class="field grow">
						<span>Разряд</span>
						<select bind:value={discipline}>
							{#each DISCIPLINES as d (d)}
								<option value={d}>{d} — {DISCIPLINE_LABEL[d]}</option>
							{/each}
						</select>
					</label>
					<label class="field">
						<span>Уровень</span>
						<input bind:value={level} maxlength="20" placeholder="B, B+, B+C" size="8" />
					</label>
				</div>
				<label class="field">
					<span>Название (необязательно, иначе — код)</span>
					<input bind:value={customName} maxlength="200" />
				</label>
				<div class="row">
					<label class="field grow">
						<span>Рейтинг от</span>
						<input type="number" bind:value={ratingMin} />
					</label>
					<label class="field grow">
						<span>Рейтинг до</span>
						<input type="number" bind:value={ratingMax} />
					</label>
				</div>
				<FormatFields bind:format />
				<div class="row">
					<button class="btn primary" type="submit">{category ? 'Сохранить' : 'Создать'}</button>
					<button class="btn ghost" type="button" onclick={() => (editing = false)}>Отмена</button>
				</div>
			</form>
		{:else if category}
			<dl class="props">
				<dt>Категория</dt>
				<dd><strong>{categoryTitle(category)}</strong></dd>
				<dt>Разряд</dt>
				<dd>{DISCIPLINE_LABEL[category.discipline]}</dd>
				<dt>Уровень</dt>
				<dd>{category.level ?? '—'}</dd>
				<dt>Рейтинг</dt>
				<dd>
					{category.ratingMin === null && category.ratingMax === null
						? 'без ограничений'
						: `${category.ratingMin ?? '…'} – ${category.ratingMax ?? '…'}`}
				</dd>
				<dt>Формат</dt>
				<dd>{stage ? formatLabel(stage.format) : '—'}</dd>
			</dl>
			<div class="row">
				<button class="btn" onclick={start}>Изменить</button>
				<button class="btn danger" onclick={remove}>Удалить категорию</button>
			</div>
		{:else}
			<p class="muted">Категории пока нет.</p>
			<button class="btn primary" onclick={start}>Создать категорию</button>
		{/if}
	</section>
{/if}
