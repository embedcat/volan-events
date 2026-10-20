<script lang="ts">
	import { onMount } from 'svelte';
	import { api } from '#lib/api.js';
	import { formatDateTime } from '#lib/format.js';
	import { apiErrorText } from '#lib/messages.js';
	import { session } from '#lib/session.svelte.js';
	import { toasts } from '#lib/toasts.svelte.js';
	import Menu from '#lib/ui/Menu.svelte';

	// Пользователи (docs/screens.md): только суперюзер. Учётные записи — обычные запросы,
	// не команды: работают только со связью.
	type User = {
		id: string;
		login: string;
		displayName: string;
		role: 'superuser' | 'organizer';
		isActive: boolean;
		createdAt: string;
		lastSeenAt: string | null;
	};

	const isSuperuser = $derived(session.user?.role === 'superuser');
	let users = $state<User[] | null>(null);
	let loadError = $state<string | null>(null);

	async function load() {
		try {
			users = (await api<{ users: User[] }>('/users')).users.sort((a, b) =>
				a.login.localeCompare(b.login)
			);
			loadError = null;
		} catch (error) {
			loadError = apiErrorText(error);
		}
	}

	onMount(() => {
		if (isSuperuser) void load();
	});

	async function request(path: string, init: { method?: string; body?: unknown }, done: string) {
		try {
			await api(path, init);
			toasts.show(done);
			await load();
			return true;
		} catch (error) {
			toasts.error(apiErrorText(error));
			return false;
		}
	}

	let login = $state('');
	let displayName = $state('');
	let password = $state('');

	async function create(event: SubmitEvent) {
		event.preventDefault();
		const ok = await request(
			'/users',
			{ body: { login: login.trim(), displayName: displayName.trim(), password } },
			`Организатор «${displayName.trim()}» создан`
		);
		if (ok) login = displayName = password = '';
	}

	// Сброс пароля: новый пароль вводит суперюзер и передаёт организатору
	let resetFor = $state<User | null>(null);
	let resetPassword = $state('');

	async function reset(event: SubmitEvent) {
		event.preventDefault();
		if (!resetFor) return;
		const ok = await request(
			`/users/${resetFor.id}`,
			{ method: 'PATCH', body: { password: resetPassword } },
			`Пароль «${resetFor.login}» сброшен, все его устройства вышли`
		);
		if (ok) {
			resetFor = null;
			resetPassword = '';
		}
	}
</script>

<svelte:head>
	<title>Пользователи — volan-events</title>
</svelte:head>

<h1>Пользователи</h1>

{#if !isSuperuser}
	<p class="muted">Раздел доступен только суперюзеру.</p>
{:else}
	<div class="sections">
		<section class="card">
			{#if loadError}
				<p class="error-text">{loadError}</p>
			{:else if !users}
				<p class="muted">Загрузка…</p>
			{:else}
				<div class="scroll">
					<table class="table">
						<thead>
							<tr>
								<th>Логин</th>
								<th>Имя</th>
								<th>Роль</th>
								<th>Состояние</th>
								<th>Последний раз</th>
								<th></th>
							</tr>
						</thead>
						<tbody>
							{#each users as user (user.id)}
								<tr class:blocked={!user.isActive}>
									<td><strong>{user.login}</strong></td>
									<td>{user.displayName}</td>
									<td>{user.role === 'superuser' ? 'суперюзер' : 'организатор'}</td>
									<td>{user.isActive ? 'активен' : 'заблокирован'}</td>
									<td>{user.lastSeenAt ? formatDateTime(user.lastSeenAt) : '—'}</td>
									<td class="num">
										{#if user.id !== session.user?.id}
											<Menu title="Действия с пользователем">
												<button
													class="menu-item"
													onclick={() =>
														request(
															`/users/${user.id}`,
															{ method: 'PATCH', body: { isActive: !user.isActive } },
															user.isActive
																? `«${user.login}» заблокирован и вышел со всех устройств`
																: `«${user.login}» разблокирован`
														)}
												>
													{user.isActive ? 'Заблокировать' : 'Разблокировать'}
												</button>
												<button class="menu-item" onclick={() => (resetFor = user)}>
													Сбросить пароль…
												</button>
												<button
													class="menu-item"
													onclick={() =>
														request(
															`/users/${user.id}/revoke-sessions`,
															{ method: 'POST' },
															`«${user.login}» вышел со всех устройств`
														)}
												>
													Выйти на всех устройствах
												</button>
											</Menu>
										{/if}
									</td>
								</tr>
								{#if resetFor?.id === user.id}
									<tr>
										<td colspan="6">
											<form class="row reset" onsubmit={reset}>
												<label class="field grow">
													<span>Новый пароль для «{user.login}» (не короче 8 символов)</span>
													<input
														type="text"
														bind:value={resetPassword}
														required
														minlength="8"
														autocomplete="off"
													/>
												</label>
												<button class="btn primary">Сбросить</button>
												<button class="btn ghost" type="button" onclick={() => (resetFor = null)}>
													Отмена
												</button>
											</form>
										</td>
									</tr>
								{/if}
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</section>

		<section class="card">
			<h2>Новый организатор</h2>
			<form onsubmit={create}>
				<div class="row">
					<label class="field grow">
						<span>Логин</span>
						<input bind:value={login} required maxlength="100" autocomplete="off" />
					</label>
					<label class="field grow">
						<span>Имя для показа</span>
						<input bind:value={displayName} required maxlength="200" />
					</label>
					<label class="field grow">
						<span>Пароль (не короче 8 символов)</span>
						<input type="text" bind:value={password} required minlength="8" autocomplete="off" />
					</label>
				</div>
				<button class="btn primary">Создать</button>
			</form>
		</section>
	</div>
{/if}

<style>
	.sections {
		display: flex;
		flex-direction: column;
		gap: 16px;
		max-width: 960px;
	}
	.scroll {
		overflow-x: auto;
	}
	.scroll .table {
		min-width: 620px;
	}
	.blocked td {
		color: var(--text-2);
	}
	.reset {
		align-items: flex-end;
	}
</style>
