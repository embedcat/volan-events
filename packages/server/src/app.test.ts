import { STATE_VERSION } from '@volan/domain';
import { afterEach, describe, expect, it } from 'vitest';
import { createTestApp } from './test-app';

let ctx: Awaited<ReturnType<typeof createTestApp>>;
afterEach(() => ctx?.close());

describe('GET /api/health', () => {
	it('отвечает ok и версией формы состояния', async () => {
		ctx = await createTestApp();
		const response = await ctx.app.inject({ method: 'GET', url: '/api/health' });
		expect(response.statusCode).toBe(200);
		expect(response.json()).toEqual({ status: 'ok', stateVersion: STATE_VERSION });
	});
});

describe('вход и сессии', () => {
	it('верный пароль — cookie httpOnly и пользователь; неверный — 401', async () => {
		ctx = await createTestApp();
		await ctx.createUser('anna');
		const ok = await ctx.app.inject({
			method: 'POST',
			url: '/api/auth/login',
			payload: { login: 'anna', password: 'anna-password', deviceId: 'd1' }
		});
		expect(ok.statusCode).toBe(200);
		expect(ok.json().user).toMatchObject({ login: 'anna', role: 'organizer' });
		expect(ok.cookies[0]).toMatchObject({ name: 'volan_session', httpOnly: true, sameSite: 'Lax' });

		const bad = await ctx.app.inject({
			method: 'POST',
			url: '/api/auth/login',
			payload: { login: 'anna', password: 'wrong', deviceId: 'd1' }
		});
		expect(bad.statusCode).toBe(401);
		expect(bad.json()).toEqual({ error: { code: 'auth.invalid' } });
	});

	it('me с сессией и без', async () => {
		ctx = await createTestApp();
		const { cookie } = await ctx.userWithSession('anna');
		const me = await ctx.app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
		expect(me.json().user).toMatchObject({ login: 'anna' });
		expect((await ctx.app.inject({ method: 'GET', url: '/api/auth/me' })).statusCode).toBe(401);
	});

	it('выход отзывает сессию', async () => {
		ctx = await createTestApp();
		const { cookie } = await ctx.userWithSession('anna');
		await ctx.app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie } });
		const me = await ctx.app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
		expect(me.statusCode).toBe(401);
	});

	it('список своих устройств и выход на другом', async () => {
		ctx = await createTestApp();
		await ctx.createUser('anna');
		const phone = await ctx.login('anna');
		const laptop = await ctx.login('anna');
		const list = await ctx.app.inject({
			method: 'GET',
			url: '/api/auth/sessions',
			headers: { cookie: laptop }
		});
		const sessions = list.json().sessions as { id: string; current: boolean }[];
		expect(sessions).toHaveLength(2);
		const other = sessions.find((s) => !s.current)!;
		await ctx.app.inject({
			method: 'DELETE',
			url: `/api/auth/sessions/${other.id}`,
			headers: { cookie: laptop }
		});
		expect(
			(await ctx.app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: phone } }))
				.statusCode
		).toBe(401);
		expect(
			(await ctx.app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: laptop } }))
				.statusCode
		).toBe(200);
	});

	it('смена пароля: старый перестаёт подходить, другие устройства выходят', async () => {
		ctx = await createTestApp();
		await ctx.createUser('anna');
		const phone = await ctx.login('anna');
		const laptop = await ctx.login('anna');
		const changed = await ctx.app.inject({
			method: 'POST',
			url: '/api/auth/password',
			headers: { cookie: laptop },
			payload: { currentPassword: 'anna-password', newPassword: 'new-secret-1' }
		});
		expect(changed.statusCode).toBe(200);
		expect(
			(await ctx.app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: phone } }))
				.statusCode
		).toBe(401);
		await expect(ctx.login('anna')).rejects.toThrow();
		await expect(ctx.login('anna', 'new-secret-1')).resolves.toContain('volan_session=');
	});

	it('запрос с телом text/plain отклоняется (защита от подделки запросов)', async () => {
		ctx = await createTestApp();
		const response = await ctx.app.inject({
			method: 'POST',
			url: '/api/auth/login',
			headers: { 'content-type': 'text/plain' },
			payload: '{"login":"a","password":"b","deviceId":"c"}'
		});
		expect(response.statusCode).toBe(415);
	});
});

describe('пользователи', () => {
	it('суперюзер создаёт организатора, организатор — нет', async () => {
		ctx = await createTestApp();
		const admin = await ctx.userWithSession('root', 'superuser');
		const created = await ctx.app.inject({
			method: 'POST',
			url: '/api/users',
			headers: { cookie: admin.cookie },
			payload: { login: 'boris', displayName: 'Борис', password: 'boris-secret' }
		});
		expect(created.statusCode).toBe(201);
		const boris = await ctx.login('boris', 'boris-secret');
		const forbidden = await ctx.app.inject({
			method: 'POST',
			url: '/api/users',
			headers: { cookie: boris },
			payload: { login: 'x', displayName: 'X', password: 'xxxxxxxx' }
		});
		expect(forbidden.statusCode).toBe(403);
	});

	it('занятый логин — 409', async () => {
		ctx = await createTestApp();
		const admin = await ctx.userWithSession('root', 'superuser');
		const response = await ctx.app.inject({
			method: 'POST',
			url: '/api/users',
			headers: { cookie: admin.cookie },
			payload: { login: 'root', displayName: 'Ещё', password: 'xxxxxxxx' }
		});
		expect(response.statusCode).toBe(409);
	});

	it('блокировка выводит со всех устройств и не даёт войти', async () => {
		ctx = await createTestApp();
		const admin = await ctx.userWithSession('root', 'superuser');
		const anna = await ctx.userWithSession('anna');
		await ctx.app.inject({
			method: 'PATCH',
			url: `/api/users/${anna.id}`,
			headers: { cookie: admin.cookie },
			payload: { isActive: false }
		});
		expect(
			(
				await ctx.app.inject({
					method: 'GET',
					url: '/api/auth/me',
					headers: { cookie: anna.cookie }
				})
			).statusCode
		).toBe(401);
		await expect(ctx.login('anna')).rejects.toThrow();
	});
});
