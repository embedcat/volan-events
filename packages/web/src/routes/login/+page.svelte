<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { apiErrorText } from '#lib/messages.js';
	import { outbox } from '#lib/outbox.svelte.js';
	import { session } from '#lib/session.svelte.js';

	let login = $state('');
	let password = $state('');
	let error = $state<string | null>(null);
	let busy = $state(false);

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		error = null;
		try {
			const { switched } = await session.login(login.trim(), password);
			const next = page.url.searchParams.get('next');
			// Возврат на страницу, с которой отправили на вход; путь проверен — только свой сайт
			const target = next?.startsWith('/') && !next.startsWith('//') ? next : resolve('/my');
			if (switched) {
				// Другой пользователь: данные прежнего стёрты — начать с чистой памяти
				location.assign(target);
				return;
			}
			outbox.resume(); // если команды ждали нового входа
			// eslint-disable-next-line svelte/no-navigation-without-resolve
			await goto(target);
		} catch (e) {
			error = apiErrorText(e);
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head>
	<title>Вход — volan-events</title>
</svelte:head>

<form class="card login" onsubmit={submit}>
	<h1>Вход</h1>
	<label class="field">
		<span>Логин</span>
		<input bind:value={login} autocomplete="username" required />
	</label>
	<label class="field">
		<span>Пароль</span>
		<input type="password" bind:value={password} autocomplete="current-password" required />
	</label>
	{#if error}
		<p class="error-text">{error}</p>
	{/if}
	<button class="btn primary" type="submit" disabled={busy}>Войти</button>
</form>

<style>
	.login {
		max-width: 360px;
		margin: 40px auto;
	}
	.login .btn {
		width: 100%;
	}
</style>
