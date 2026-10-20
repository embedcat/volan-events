<script lang="ts">
	import type { Match } from '@volan/domain';
	import { MediaQuery } from 'svelte/reactivity';
	import { clock } from '../../clock.svelte.js';
	import type { EventStore } from '../../event-store.svelte.js';
	import { type SideState, playerCourts, sideState } from '../../event-view.js';
	import { formatMinutes, minutesSince } from '../../format.js';
	import { entryName } from '../../names.js';
	import Menu from '../Menu.svelte';

	let {
		store,
		freeCourts,
		onresult
	}: { store: EventStore; freeCourts: number[]; onresult: (matchId: string) => void } = $props();

	const ev = $derived(store.view);
	const courts = $derived(ev ? playerCourts(ev) : new Map<string, number>());
	const matches = $derived(
		ev ? ev.queue.flatMap((id) => (ev.matches[id] ? [ev.matches[id]] : [])) : []
	);

	// Перетаскивание — только мышью; на телефоне — пункты меню
	const mouse = new MediaQuery('(pointer: fine)');
	let dragId = $state<string | null>(null);
	let overIndex = $state<number | null>(null);
	const dragFrom = $derived(dragId ? matches.findIndex((m) => m.id === dragId) : -1);

	const name = (entryId: string) => (ev ? entryName(ev, store.name, entryId) : '');

	function restText(side: SideState): string {
		if (side.kind === 'busy') return '';
		return side.since ? formatMinutes(minutesSince(side.since, clock.now)) : '—';
	}

	function stateOf(m: Match): { busy: boolean; text: string } {
		if (!ev) return { busy: false, text: '' };
		const sides = [sideState(ev, m.sideA, courts), sideState(ev, m.sideB, courts)];
		const busy = sides.filter((s) => s.kind === 'busy');
		if (busy.length > 0) {
			return {
				busy: true,
				text: busy
					.map((s) => `${store.name(s.playerId)?.lastName ?? 'Игрок'} на корте ${s.court}`)
					.join(', ')
			};
		}
		const [a, b] = sides as [SideState, SideState];
		if (a.kind === 'rest' && b.kind === 'rest' && !a.since && !b.since) {
			return { busy: false, text: 'ещё не играли' };
		}
		return { busy: false, text: `отдых ${restText(a)} / ${restText(b)}` };
	}

	function move(m: Match, toIndex: number) {
		const index = Math.max(0, Math.min(matches.length - 1, toIndex));
		if (matches[index]?.id === m.id) return;
		store.run(
			{ type: 'queue.move', payload: { matchId: m.id, toIndex: index } },
			`№${m.number} — ${index + 1}-й в очереди`
		);
	}

	function call(m: Match, court: number) {
		store.run(
			{ type: 'match.call', payload: { matchId: m.id, court } },
			`№${m.number} вызван на корт ${court}`
		);
	}

	function moveTo(event: SubmitEvent, m: Match) {
		event.preventDefault();
		const position = Number(new FormData(event.currentTarget as HTMLFormElement).get('position'));
		if (Number.isInteger(position) && position >= 1) move(m, position - 1);
	}

	function endDrag() {
		dragId = null;
		overIndex = null;
	}
</script>

{#if matches.length === 0}
	<p class="muted">Очередь пуста.</p>
{:else}
	<ol class="queue">
		{#each matches as m, index (m.id)}
			{@const info = stateOf(m)}
			<li
				draggable={mouse.current}
				class:dragging={dragId === m.id}
				class:drop-before={overIndex === index && dragFrom > index}
				class:drop-after={overIndex === index && dragFrom >= 0 && dragFrom < index}
				ondragstart={(e) => {
					dragId = m.id;
					e.dataTransfer?.setData('text/plain', m.id);
					if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
				}}
				ondragover={(e) => {
					if (!dragId) return;
					e.preventDefault();
					overIndex = index;
				}}
				ondrop={(e) => {
					e.preventDefault();
					const dragged = matches[dragFrom];
					if (dragged && dragged.id !== m.id) move(dragged, index);
					endDrag();
				}}
				ondragend={endDrag}
			>
				<span class="num">№{m.number}</span>
				<span class="round muted">тур {m.round}</span>
				<span class="sides">{name(m.sideA)} – {name(m.sideB)}</span>
				<span class="state" class:muted={!info.busy} class:busy={info.busy}>{info.text}</span>
				<span class="actions">
					<Menu
						label="На корт ▾"
						title={info.busy
							? 'Кто-то из игроков на корте'
							: freeCourts.length === 0
								? 'Свободных кортов нет'
								: 'Вызвать на корт'}
						variant="plain"
						disabled={info.busy || freeCourts.length === 0}
					>
						{#each freeCourts as court (court)}
							<button class="menu-item" onclick={() => call(m, court)}>Корт {court}</button>
						{/each}
					</Menu>
					<Menu title="Действия с матчем">
						<button class="menu-item" disabled={index === 0} onclick={() => move(m, 0)}>
							В начало
						</button>
						<button class="menu-item" disabled={index === 0} onclick={() => move(m, index - 1)}>
							Выше
						</button>
						<button
							class="menu-item"
							disabled={index === matches.length - 1}
							onclick={() => move(m, index + 1)}
						>
							Ниже
						</button>
						<button
							class="menu-item"
							disabled={index === matches.length - 1}
							onclick={() => move(m, matches.length - 1)}
						>
							В конец
						</button>
						<form class="position" onsubmit={(e) => moveTo(e, m)}>
							<label for="pos-{m.id}">На место</label>
							<input
								id="pos-{m.id}"
								name="position"
								type="number"
								min="1"
								max={matches.length}
								inputmode="numeric"
								placeholder={String(index + 1)}
							/>
							<button class="btn small">ОК</button>
						</form>
						<hr class="menu-sep" />
						<button class="menu-item" onclick={() => onresult(m.id)}>
							Результат без вызова (неявка)…
						</button>
					</Menu>
				</span>
			</li>
		{/each}
	</ol>
{/if}

<style>
	.queue {
		list-style: none;
		margin: 0;
		padding: 0;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
	}
	.queue li {
		display: grid;
		grid-template-columns: 52px 52px minmax(0, 1fr) minmax(140px, 280px) auto;
		align-items: center;
		gap: 8px;
		padding: 6px 8px 6px 12px;
		border-bottom: 1px solid var(--border);
	}
	.queue li:last-child {
		border-bottom: none;
	}
	.queue li[draggable='true'] {
		cursor: grab;
	}
	.dragging {
		opacity: 0.4;
	}
	.drop-before {
		box-shadow: inset 0 2px 0 var(--accent);
	}
	.drop-after {
		box-shadow: inset 0 -2px 0 var(--accent);
	}
	.num {
		font-weight: 600;
	}
	.state {
		font-size: 13px;
	}
	.state.busy {
		color: var(--warn);
	}
	.actions {
		display: flex;
		gap: 4px;
		justify-content: flex-end;
	}
	.position {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 10px;
	}
	.position input {
		width: 64px;
		min-height: 28px;
		padding: 2px 6px;
	}
	/* Узкий экран: номер и действия — сверху, участники и состояние — под ними */
	@media (max-width: 760px) {
		.queue li {
			grid-template-columns: auto auto 1fr;
			grid-template-areas:
				'num round actions'
				'sides sides sides'
				'state state state';
			row-gap: 2px;
		}
		.num {
			grid-area: num;
		}
		.round {
			grid-area: round;
		}
		.sides {
			grid-area: sides;
		}
		.state {
			grid-area: state;
		}
		.actions {
			grid-area: actions;
		}
	}
</style>
