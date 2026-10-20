<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { api } from '#lib/api.js';
	import { formatDateTime } from '#lib/format.js';
	import { apiErrorText } from '#lib/messages.js';
	import { session } from '#lib/session.svelte.js';
	import { type ThemeMode, theme } from '#lib/theme.svelte.js';
	import { toasts } from '#lib/toasts.svelte.js';

	type Device = {
		id: string;
		deviceLabel: string | null;
		createdAt: string;
		lastSeenAt: string;
		current: boolean;
	};

	const THEMES: { mode: ThemeMode; label: string }[] = [
		{ mode: 'system', label: 'Как в системе' },
		{ mode: 'light', label: 'Светлая' },
		{ mode: 'dark', label: 'Тёмная' }
	];

	let devices = $state<Device[] | null>(null);
	let devicesError = $state<string | null>(null);

	async function loadDevices() {
		try {
			devices = (await api<{ sessions: Device[] }>('/auth/sessions')).sessions;
			devicesError = null;
		} catch (error) {
			devicesError = apiErrorText(error);
		}
	}

	onMount(loadDevices);

	async function signOut(device: Device) {
		if (device.current) {
			await session.logout();
			await goto(resolve('/'));
			return;
		}
		try {
			await api(`/auth/sessions/${device.id}`, { method: 'DELETE' });
			toasts.show(`Вышли на устройстве «${device.deviceLabel ?? 'без названия'}»`);
			await loadDevices();
		} catch (error) {
			toasts.error(apiErrorText(error));
		}
	}

	let currentPassword = $state('');
	let newPassword = $state('');
	let repeat = $state('');
	let saving = $state(false);
	const mismatch = $derived(repeat !== '' && repeat !== newPassword);

	async function changePassword(event: SubmitEvent) {
		event.preventDefault();
		if (mismatch || newPassword.length < 8) return;
		saving = true;
		try {
			await api('/auth/password', { body: { currentPassword, newPassword } });
			currentPassword = newPassword = repeat = '';
			toasts.show('Пароль изменён, на остальных устройствах выполнен выход');
			await loadDevices();
		} catch (error) {
			toasts.error(apiErrorText(error));
		} finally {
			saving = false;
		}
	}
</script>

<svelte:head>
	<title>Аккаунт — volan-events</title>
</svelte:head>

<h1>Аккаунт</h1>

<div class="sections">
	{#if session.user}
		<section class="card">
			<h2>Учётная запись</h2>
			<dl class="props">
				<dt>Имя</dt>
				<dd>{session.user.displayName}</dd>
				<dt>Логин</dt>
				<dd>{session.user.login}</dd>
				<dt>Роль</dt>
				<dd>{session.user.role === 'superuser' ? 'суперюзер' : 'организатор'}</dd>
			</dl>
		</section>
	{/if}

	<section class="card">
		<h2>Тема</h2>
		<div class="row">
			{#each THEMES as t (t.mode)}
				<button
					class="btn"
					class:primary={theme.mode === t.mode}
					aria-pressed={theme.mode === t.mode}
					onclick={() => theme.set(t.mode)}
				>
					{t.label}
				</button>
			{/each}
		</div>
	</section>

	<section class="card">
		<h2>Мои устройства</h2>
		{#if devicesError}
			<p class="error-text">{devicesError}</p>
		{:else if !devices}
			<p class="muted">Загрузка…</p>
		{:else}
			<table class="table">
				<thead>
					<tr>
						<th>Устройство</th>
						<th>Вход</th>
						<th>Последний раз</th>
						<th></th>
					</tr>
				</thead>
				<tbody>
					{#each devices as device (device.id)}
						<tr>
							<td>
								{device.deviceLabel ?? 'без названия'}
								{#if device.current}<span class="badge running">это устройство</span>{/if}
							</td>
							<td>{formatDateTime(device.createdAt)}</td>
							<td>{formatDateTime(device.lastSeenAt)}</td>
							<td class="num">
								<button class="btn small" onclick={() => signOut(device)}>Выйти</button>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	</section>

	<section class="card">
		<h2>Смена пароля</h2>
		<form class="password" onsubmit={changePassword}>
			<label class="field">
				<span>Текущий пароль</span>
				<input
					type="password"
					bind:value={currentPassword}
					required
					autocomplete="current-password"
				/>
			</label>
			<label class="field">
				<span>Новый пароль (не короче 8 символов)</span>
				<input
					type="password"
					bind:value={newPassword}
					required
					minlength="8"
					autocomplete="new-password"
				/>
			</label>
			<label class="field">
				<span>Новый пароль ещё раз</span>
				<input type="password" bind:value={repeat} required autocomplete="new-password" />
			</label>
			{#if mismatch}<p class="error-text">Пароли не совпадают</p>{/if}
			<p class="muted">После смены пароля на остальных устройствах выполнится выход.</p>
			<button class="btn primary" disabled={saving || mismatch}>Сменить пароль</button>
		</form>
	</section>
</div>

<style>
	.sections {
		display: flex;
		flex-direction: column;
		gap: 16px;
		max-width: 760px;
	}
	.password {
		max-width: 360px;
	}
	.password p {
		margin: 0 0 12px;
	}
</style>
