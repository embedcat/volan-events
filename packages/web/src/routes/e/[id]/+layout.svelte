<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { closeEvent } from '#lib/event-store.svelte.js';
	import { PROGRESS_LABEL, VISIBILITY_LABEL, formatDate, formatTime } from '#lib/format.js';
	import { closePublicEvent } from '#lib/public-event.svelte.js';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();
	const store = $derived(data.store);
	const guest = $derived(data.guest);
	const ev = $derived((store ?? guest)?.view ?? null);
	const loadState = $derived((store ?? guest)?.loadState ?? 'loading');

	// Поток изменений — пока открыта любая вкладка события
	$effect(() => {
		if (store?.loadState === 'ready') {
			store.connect();
			const id = store.id;
			return () => closeEvent(id);
		}
		if (guest?.loadState === 'ready') {
			guest.connect();
			const id = guest.id;
			return () => closePublicEvent(id);
		}
	});

	const id = $derived(page.params.id ?? '');
	// Гость видит те же разделы без настроек; «Корты» у него — без кнопок (docs/screens.md)
	const tabs = $derived([
		{ href: resolve('/e/[id]/courts', { id }), label: store ? 'Пульт' : 'Корты' },
		{ href: resolve('/e/[id]/table', { id }), label: 'Таблица' },
		{ href: resolve('/e/[id]/matches', { id }), label: 'Матчи' },
		{ href: resolve('/e/[id]/entries', { id }), label: 'Участники' },
		...(store ? [{ href: resolve('/e/[id]/settings', { id }), label: 'Настройки' }] : [])
	]);
</script>

{#if loadState === 'notFound'}
	<p class="error-text">
		Событие не найдено{store ? '' : ' или ещё не опубликовано'}.
	</p>
{:else if loadState === 'forbidden'}
	<p class="error-text">Это событие другого организатора.</p>
{:else if loadState === 'offline' || !ev}
	<p class="error-text">Нет связи с сервером — событие не загружено.</p>
{:else}
	<header class="event no-print">
		<div>
			<h1>{ev.title}</h1>
			<span class="muted">{formatDate(ev.date)}{ev.venue ? ` · ${ev.venue}` : ''}</span>
		</div>
		<div class="badges">
			{#if guest?.updatedAt}
				<span class="muted updated" title={guest.live ? 'Обновляется само' : 'Нет связи'}>
					{guest.live ? '●' : '○'} обновлено в {formatTime(guest.updatedAt)}
				</span>
			{/if}
			{#if ev.visibility === 'draft'}
				<span class="badge draft">{VISIBILITY_LABEL.draft}</span>
			{/if}
			<span class="badge" class:running={ev.progress === 'running'}>
				{PROGRESS_LABEL[ev.progress]}
			</span>
		</div>
	</header>

	<nav class="tabs no-print">
		{#each tabs as tab (tab.href)}
			<a href={tab.href} class:active={page.url.pathname === tab.href}>{tab.label}</a>
		{/each}
	</nav>

	<div class="content">
		{@render children()}
	</div>
{/if}

<style>
	.event {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		justify-content: space-between;
		gap: 8px;
		margin-bottom: 12px;
	}
	.event h1 {
		margin-bottom: 2px;
	}
	.badges {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.updated {
		font-size: 13px;
	}
	.tabs {
		display: flex;
		gap: 4px;
		border-bottom: 1px solid var(--border);
		margin-bottom: 16px;
	}
	.tabs a {
		padding: 8px 14px;
		color: var(--text-2);
		border-bottom: 2px solid transparent;
		margin-bottom: -1px;
	}
	.tabs a:hover {
		color: var(--text);
		text-decoration: none;
	}
	.tabs a.active {
		color: var(--text);
		border-bottom-color: var(--accent);
		font-weight: 600;
	}
	/* Телефон: разделы — панелью внизу (D67) */
	@media (max-width: 640px) {
		.tabs {
			position: fixed;
			left: 0;
			right: 0;
			bottom: 0;
			z-index: 40;
			margin: 0;
			background: var(--surface);
			border-top: 1px solid var(--border);
			border-bottom: none;
			justify-content: space-around;
			padding-bottom: env(safe-area-inset-bottom);
		}
		.tabs a {
			flex: 1;
			text-align: center;
			padding: 10px 2px;
			font-size: 13px;
			border-bottom: none;
			border-top: 2px solid transparent;
			margin: 0;
		}
		.tabs a.active {
			border-top-color: var(--accent);
		}
		.content {
			padding-bottom: 64px;
		}
	}
</style>
