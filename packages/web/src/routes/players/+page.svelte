<script lang="ts">
	import { type Actor, type Player, type PlayerCommandDraft, canEditPlayer } from '@volan/domain';
	import { type RegistryPlayer, registry } from '#lib/registry.svelte.js';
	import { session } from '#lib/session.svelte.js';
	import { toasts } from '#lib/toasts.svelte.js';
	import Menu from '#lib/ui/Menu.svelte';
	import PlayerEditForm from '#lib/ui/players/PlayerEditForm.svelte';
	import NewPlayerForm from '#lib/ui/settings/NewPlayerForm.svelte';
	import PlayerPicker from '#lib/ui/settings/PlayerPicker.svelte';
	import type { PageProps } from './$types';

	// Справочник игроков (docs/screens.md, «Справочник игроков»)
	let { data }: PageProps = $props();

	const actor = $derived<Actor | null>(
		session.user ? { userId: session.user.id, role: session.user.role } : null
	);
	const LIMIT = 200;

	let query = $state('');
	let creating = $state(false);
	let editing = $state<string | null>(null);
	let merging = $state<string | null>(null);

	const active = $derived(
		Object.values(registry.players)
			.filter((p) => !p.mergedIntoId)
			.sort(
				(a, b) =>
					a.lastName.localeCompare(b.lastName, 'ru') || a.firstName.localeCompare(b.firstName, 'ru')
			)
	);
	const found = $derived(query.trim() ? registry.search(query, 1000) : active);
	const shown = $derived(found.slice(0, LIMIT));
	const mergingPlayer = $derived(merging ? registry.players[merging] : undefined);

	const fullName = (p: RegistryPlayer) => `${p.lastName} ${p.firstName}`;
	// Для однофамильцев: «Козлов Кирилл (Смена, 600)»
	const described = (p: RegistryPlayer) =>
		`${fullName(p)} (${[p.club, p.rating].filter((v) => v !== null).join(', ') || 'без клуба и рейтинга'})`;
	const author = (p: RegistryPlayer) =>
		p.createdBy === session.user?.id ? 'вы' : (data.organizers[p.createdBy] ?? '—');
	const canEdit = (p: RegistryPlayer) => !!actor && canEditPlayer(p as Player, actor);

	// Команда справочника с плашкой «Отменить»
	function run(draft: PlayerCommandDraft, message: string): boolean {
		if (!actor) return false;
		const undo = registry.dispatch(draft, actor);
		if (!undo) return false;
		toasts.show(message, {
			action:
				undo.length > 0
					? { label: 'Отменить', run: () => undo.forEach((d) => registry.dispatch(d, actor)) }
					: undefined
		});
		return true;
	}

	function merge(source: RegistryPlayer, target: RegistryPlayer) {
		const ok = run(
			{ type: 'player.merge', payload: { sourceId: source.id, targetId: target.id } },
			`«${described(source)}» объединён с «${described(target)}»`
		);
		if (ok) merging = null;
	}
</script>

<svelte:head>
	<title>Игроки — volan-events</title>
</svelte:head>

<div class="head">
	<h1>Игроки</h1>
	<button class="btn primary" onclick={() => (creating = !creating)}>Новый игрок</button>
</div>

{#if creating}
	<div class="block">
		<NewPlayerForm
			gender={null}
			initialName={query}
			oncreated={(p) => {
				creating = false;
				toasts.show(`Игрок «${fullName(p)}» добавлен`);
			}}
			oncancel={() => (creating = false)}
		/>
	</div>
{/if}

{#if mergingPlayer}
	<div class="block merge">
		<h3>Объединить «{described(mergingPlayer)}» с другой записью</h3>
		<p class="muted">
			Дубль останется в истории, но заявки и результаты будут показываться по выбранной записи.
			Объединяет суперюзер или автор обеих записей.
		</p>
		<div class="row">
			<PlayerPicker
				label="Основная запись"
				gender={mergingPlayer.gender}
				exclude={new Set([mergingPlayer.id])}
				onpick={(target) => merge(mergingPlayer, target)}
			/>
			<button class="btn ghost" onclick={() => (merging = null)}>Отмена</button>
		</div>
	</div>
{/if}

<div class="search row">
	<input
		class="grow"
		bind:value={query}
		placeholder="Поиск: фамилия, имя или клуб"
		autocomplete="off"
	/>
	<span class="muted">
		{query.trim() ? `найдено ${found.length} из ${active.length}` : `всего ${active.length}`}
	</span>
</div>

{#if !registry.loaded}
	<p class="muted">Справочник загружается…</p>
{:else if shown.length === 0}
	<p class="muted">{query.trim() ? 'Никого не нашлось.' : 'В справочнике пока никого нет.'}</p>
{:else}
	<div class="scroll">
		<table class="table">
			<thead>
				<tr>
					<th>Игрок</th>
					<th>Пол</th>
					<th>Клуб / город</th>
					<th class="num">Рейтинг</th>
					<th>Автор</th>
					<th></th>
				</tr>
			</thead>
			<tbody>
				{#each shown as p (p.id)}
					<tr>
						<td><strong>{fullName(p)}</strong></td>
						<td>{p.gender === 'M' ? 'М' : 'Ж'}</td>
						<td>{p.club ?? '—'}</td>
						<td class="num">{p.rating ?? '—'}</td>
						<td class="muted">{author(p)}</td>
						<td class="num">
							{#if canEdit(p)}
								<Menu title="Действия с игроком">
									<button class="menu-item" onclick={() => (editing = p.id)}>Править</button>
									<button class="menu-item" onclick={() => (merging = p.id)}>
										Объединить с другой записью…
									</button>
									<hr class="menu-sep" />
									<button
										class="menu-item"
										onclick={() =>
											run(
												{ type: 'player.delete', payload: { playerId: p.id } },
												`Игрок «${fullName(p)}» удалён`
											)}
									>
										Удалить
									</button>
								</Menu>
							{/if}
						</td>
					</tr>
					{#if editing === p.id}
						<tr class="editing">
							<td colspan="6">
								<PlayerEditForm
									player={p}
									onsave={(changes, expected) => {
										if (
											run(
												{ type: 'player.update', payload: { playerId: p.id, changes, expected } },
												`Игрок «${fullName(p)}» изменён`
											)
										)
											editing = null;
									}}
									oncancel={() => (editing = null)}
								/>
							</td>
						</tr>
					{/if}
				{/each}
			</tbody>
		</table>
	</div>
	{#if found.length > LIMIT}
		<p class="muted">Показаны первые {LIMIT} — уточните поиск.</p>
	{/if}
{/if}

<style>
	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 12px;
	}
	.head h1 {
		margin: 0;
	}
	.block {
		margin-bottom: 16px;
	}
	.merge {
		padding: 12px;
		border: 1px solid var(--accent);
		border-radius: var(--radius);
		background: var(--surface);
	}
	.search {
		margin-bottom: 12px;
	}
	.scroll {
		overflow-x: auto;
		border: 1px solid var(--border);
		border-radius: var(--radius);
	}
	.scroll .table {
		min-width: 560px;
	}
	.editing td {
		background: var(--surface-2);
	}
</style>
