<script lang="ts">
	import type { Match, PlayerFields, ResultInput } from '@volan/domain';
	import { onMount } from 'svelte';
	import { type Rejected, conflicts } from '../conflicts.svelte.js';
	import { deviceId } from '../device.js';
	import { openEvent } from '../event-store.svelte.js';
	import { resultText } from '../event-view.js';
	import { formatTime } from '../format.js';
	import { apiErrorText, commandLabel, domainErrorText } from '../messages.js';
	import { registry } from '../registry.svelte.js';
	import { session } from '../session.svelte.js';
	import { toasts } from '../toasts.svelte.js';

	// Отклонённая команда: что хотели, почему не вышло, что сейчас на сервере (docs/screens.md, «/sync»)
	let { item }: { item: Rejected } = $props();

	const command = $derived(item.command);
	const store = $derived(command.scope === 'event' ? openEvent(command.eventId) : null);
	const ev = $derived(store?.view ?? null);

	onMount(() => {
		if (store && store.loadState !== 'ready') void store.load();
	});

	const FIELD: Record<keyof PlayerFields, string> = {
		lastName: 'фамилия',
		firstName: 'имя',
		gender: 'пол',
		club: 'клуб',
		rating: 'рейтинг',
		birthYear: 'год рождения',
		contact: 'контакт',
		externalId: 'внешний ID'
	};

	const payload = $derived(command.payload as Record<string, unknown>);
	const match = $derived<Match | undefined>(
		ev && typeof payload.matchId === 'string' ? ev.matches[payload.matchId] : undefined
	);
	const playerId = $derived(
		[payload.playerId, payload.sourceId, payload.id].find((v) => typeof v === 'string') as
			string | undefined
	);
	const player = $derived(
		command.scope === 'registry' && playerId ? registry.players[playerId] : undefined
	);

	const title = $derived(
		[
			match ? `Матч №${match.number}` : null,
			player ? `${player.lastName} ${player.firstName}` : null,
			commandLabel(command.type).toLowerCase()
		]
			.filter(Boolean)
			.join(': ')
			.replace(/^./, (c) => c.toUpperCase())
	);
	const where = $derived(command.scope === 'event' ? (ev?.title ?? 'событие') : 'справочник');

	// Результат из команды — тем же текстом, что в списке матчей
	function resultLine(result: ResultInput | null): string {
		if (!result || !ev || !store || !match) return 'нет результата';
		return resultText(ev, store.name, { ...match, result: { ...result, byWithdrawal: false } });
	}

	function fieldsLine(fields: Partial<PlayerFields>): string {
		return Object.entries(fields)
			.map(([key, value]) => `${FIELD[key as keyof PlayerFields]}: ${value ?? '—'}`)
			.join(', ');
	}

	const comparison = $derived.by(() => {
		if (command.type === 'match.recordResult' && match) {
			return {
				mine: resultLine(command.payload.result),
				server: match.status === 'finished' ? resultLine(match.result) : 'нет результата'
			};
		}
		if (command.type === 'player.update' && player) {
			const { changes } = command.payload;
			const current = Object.fromEntries(
				Object.keys(changes).map((k) => [k, player[k as keyof PlayerFields] ?? null])
			);
			return { mine: fieldsLine(changes), server: fieldsLine(current) };
		}
		return null;
	});

	// «Применить моё» — только там, где конфликт — чужая правка того же значения
	const canReapply = $derived(
		(item.reason.code === 'match.resultChanged' &&
			!!match &&
			(command.type === 'match.recordResult' ||
				(command.type === 'match.clearResult' && match.status === 'finished'))) ||
			(item.reason.code === 'player.changed' && command.type === 'player.update' && !!player)
	);

	const when = $derived.by(() => {
		const date = new Date(item.issuedAt);
		const today = date.toDateString() === new Date().toDateString();
		return `${formatTime(item.issuedAt)}${today ? '' : `, ${date.toLocaleDateString('ru')}`}`;
	});
	const device = $derived(item.deviceId === deviceId() ? 'это устройство' : 'другое устройство');

	let busy = $state(false);

	async function settle(resolution: 'discarded' | 'reapplied') {
		busy = true;
		try {
			await conflicts.resolve(item.id, resolution);
		} catch (error) {
			toasts.error(apiErrorText(error));
		} finally {
			busy = false;
		}
	}

	function reapply() {
		let ok = false;
		if (command.type === 'match.recordResult' && store && match) {
			ok = store.run(
				{
					type: 'match.recordResult',
					payload: {
						matchId: match.id,
						result: command.payload.result,
						expectedResult: match.status === 'finished' ? match.result : null
					}
				},
				`Результат №${match.number} заменён вашим`
			);
		} else if (command.type === 'match.clearResult' && store && match?.result) {
			ok = store.run(
				{ type: 'match.clearResult', payload: { matchId: match.id, expectedResult: match.result } },
				`Результат №${match.number} стёрт`
			);
		} else if (command.type === 'player.update' && player && session.user) {
			const { changes } = command.payload;
			const expected = Object.fromEntries(
				Object.keys(changes).map((k) => [k, player[k as keyof PlayerFields] ?? null])
			);
			ok =
				registry.dispatch(
					{ type: 'player.update', payload: { playerId: player.id, changes, expected } },
					{ userId: session.user.id, role: session.user.role }
				) !== null;
		}
		if (ok) void settle('reapplied');
	}
</script>

<div class="conflict">
	<div class="title">
		<strong>▲ {title}</strong>
		<span class="muted">· {where}</span>
	</div>
	<p class="reason">{domainErrorText(item.reason)}</p>
	{#if comparison}
		<dl class="props">
			<dt>у вас ({device}, {when})</dt>
			<dd>{comparison.mine}</dd>
			<dt>на сервере</dt>
			<dd>{comparison.server}</dd>
		</dl>
	{:else}
		<p class="muted">{device}, {when}</p>
	{/if}
	<div class="row">
		{#if canReapply}
			<button class="btn primary small" disabled={busy} onclick={reapply}>Применить моё</button>
		{/if}
		<button class="btn small" disabled={busy} onclick={() => settle('discarded')}>
			Отбросить
		</button>
	</div>
</div>

<style>
	.conflict {
		padding: 12px;
		border: 1px solid color-mix(in srgb, var(--warn) 50%, var(--border));
		border-radius: var(--radius);
		background: var(--surface);
	}
	.title {
		margin-bottom: 4px;
	}
	.title strong {
		color: var(--warn);
	}
	.reason {
		margin: 0 0 8px;
	}
</style>
