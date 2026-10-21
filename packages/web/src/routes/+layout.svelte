<script lang="ts">
	import '../app.css';
	import { resolve } from '$app/paths';
	import { conflicts } from '#lib/conflicts.svelte.js';
	import { logout } from '#lib/logout.js';
	import { session } from '#lib/session.svelte.js';
	import { theme } from '#lib/theme.svelte.js';
	import Menu from '#lib/ui/Menu.svelte';
	import SyncIndicator from '#lib/ui/SyncIndicator.svelte';
	import Toasts from '#lib/ui/Toasts.svelte';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	const THEME_LABEL = {
		system: 'Тема: как в системе',
		light: 'Тема: светлая',
		dark: 'Тема: тёмная'
	};

	// Отклонённые команды со всех устройств — при входе (индикатор «▲ конфликты»)
	$effect(() => {
		if (session.user) void conflicts.load();
		else conflicts.clear();
	});
</script>

<header class="top no-print">
	<div class="container bar">
		<a class="brand" href={resolve('/')}>volan-events</a>
		<nav>
			{#if session.user}
				<a href={resolve('/my')}>Мои события</a>
				<a href={resolve('/players')}>Игроки</a>
			{/if}
		</nav>
		<div class="right">
			{#if session.user}
				<SyncIndicator />
				<!-- Разделы пользователя — меню под именем (D140) -->
				<Menu label="{session.user.displayName} ▾" title="Меню пользователя">
					<a class="menu-item" href={resolve('/account')}>Аккаунт и устройства</a>
					<a class="menu-item" href={resolve('/sync')}>Синхронизация</a>
					{#if session.user.role === 'superuser'}
						<a class="menu-item" href={resolve('/admin/users')}>Пользователи</a>
					{/if}
					<hr class="menu-sep" />
					<button class="menu-item" onclick={logout}>Выйти</button>
				</Menu>
			{:else}
				<button class="btn ghost small" onclick={() => theme.next()} title="Сменить тему">
					{THEME_LABEL[theme.mode]}
				</button>
				<a class="btn small" href={resolve('/login')}>Войти</a>
			{/if}
		</div>
	</div>
</header>

<main class="container">
	{@render children()}
</main>

<Toasts />

<style>
	.top {
		background: var(--surface);
		border-bottom: 1px solid var(--border);
	}
	/* Не помещается в строку (телефон) — правая часть уходит на вторую */
	.bar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 4px 16px;
		padding-top: 8px;
		padding-bottom: 8px;
	}
	.brand {
		font-weight: 700;
		color: var(--text);
	}
	nav {
		display: flex;
		gap: 12px;
		flex: 1;
	}
	.right {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-left: auto;
	}
</style>
