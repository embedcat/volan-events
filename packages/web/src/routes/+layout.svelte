<script lang="ts">
	import '../app.css';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { session } from '#lib/session.svelte.js';
	import { theme } from '#lib/theme.svelte.js';
	import SyncIndicator from '#lib/ui/SyncIndicator.svelte';
	import Toasts from '#lib/ui/Toasts.svelte';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	const THEME_LABEL = {
		system: 'Тема: как в системе',
		light: 'Тема: светлая',
		dark: 'Тема: тёмная'
	};

	async function logout() {
		await session.logout();
		await goto(resolve('/'));
	}
</script>

<header class="top">
	<div class="container bar">
		<a class="brand" href={resolve('/')}>volan-events</a>
		<nav>
			{#if session.user}
				<a href={resolve('/my')}>Мои события</a>
			{/if}
		</nav>
		<div class="right">
			<button class="btn ghost small" onclick={() => theme.next()} title="Сменить тему">
				{THEME_LABEL[theme.mode]}
			</button>
			{#if session.user}
				<SyncIndicator />
				<span class="muted user">{session.user.displayName}</span>
				<button class="btn small" onclick={logout}>Выйти</button>
			{:else}
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
	.bar {
		display: flex;
		align-items: center;
		gap: 16px;
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
	}
	@media (max-width: 600px) {
		.user {
			display: none;
		}
	}
</style>
