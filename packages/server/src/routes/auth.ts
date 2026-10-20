import { and, desc, eq, gt, isNull } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { hashPassword, verifyPassword } from '../auth/password';
import { createSession, deviceLabel, revokeSession } from '../auth/sessions';
import type { AppDeps } from '../app';
import { sessions, users } from '../db/schema';
import { HttpError, parseWith, requireUser } from '../http';

export const SESSION_COOKIE = 'volan_session';

const loginBody = z.object({
	login: z.string().trim().min(1).max(100),
	password: z.string().min(1).max(200),
	deviceId: z.string().min(1).max(100)
});

const passwordBody = z.object({
	currentPassword: z.string().min(1).max(200),
	newPassword: z.string().min(8).max(200)
});

export function setSessionCookie(reply: FastifyReply, token: string, deps: AppDeps): void {
	reply.setCookie(SESSION_COOKIE, token, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: deps.config.cookieSecure,
		maxAge: deps.config.sessionTtlDays * 24 * 60 * 60
	});
}

export function authRoutes(app: FastifyInstance, deps: AppDeps): void {
	const { db, config } = deps;

	app.post('/api/auth/login', async (request, reply) => {
		const body = parseWith(loginBody, request.body);
		const user = db.select().from(users).where(eq(users.login, body.login)).get();
		const valid = user?.isActive && (await verifyPassword(body.password, user.passwordHash));
		if (!user || !valid) throw new HttpError(401, 'auth.invalid');

		const token = createSession(
			db,
			user.id,
			{ id: body.deviceId, label: deviceLabel(request.headers['user-agent']) },
			config.sessionTtlDays
		);
		setSessionCookie(reply, token, deps);
		return {
			user: { id: user.id, login: user.login, displayName: user.displayName, role: user.role }
		};
	});

	app.post('/api/auth/logout', async (request, reply) => {
		if (request.user) revokeSession(db, request.user.sessionId);
		reply.clearCookie(SESSION_COOKIE, { path: '/' });
		return { ok: true };
	});

	app.get('/api/auth/me', async (request) => {
		const { sessionId: _s, ...user } = requireUser(request);
		return { user };
	});

	app.get('/api/auth/sessions', async (request) => {
		const user = requireUser(request);
		const rows = db
			.select()
			.from(sessions)
			.where(
				and(
					eq(sessions.userId, user.id),
					isNull(sessions.revokedAt),
					gt(sessions.expiresAt, new Date())
				)
			)
			.orderBy(desc(sessions.lastSeenAt))
			.all();
		return {
			sessions: rows.map((s) => ({
				id: s.id,
				deviceLabel: s.deviceLabel,
				createdAt: s.createdAt,
				lastSeenAt: s.lastSeenAt,
				current: s.id === user.sessionId
			}))
		};
	});

	app.delete<{ Params: { id: string } }>('/api/auth/sessions/:id', async (request) => {
		const user = requireUser(request);
		const session = db.select().from(sessions).where(eq(sessions.id, request.params.id)).get();
		if (!session || session.userId !== user.id) throw new HttpError(404, 'session.notFound');
		revokeSession(db, session.id);
		return { ok: true };
	});

	app.post('/api/auth/password', async (request) => {
		const user = requireUser(request);
		const body = parseWith(passwordBody, request.body);
		const row = db.select().from(users).where(eq(users.id, user.id)).get();
		if (!row || !(await verifyPassword(body.currentPassword, row.passwordHash))) {
			throw new HttpError(400, 'auth.wrongPassword');
		}
		const passwordHash = await hashPassword(body.newPassword, config.scrypt);
		db.update(users).set({ passwordHash }).where(eq(users.id, user.id)).run();
		// Остальные устройства выходят, текущее остаётся
		const others = db
			.select({ id: sessions.id })
			.from(sessions)
			.where(and(eq(sessions.userId, user.id), isNull(sessions.revokedAt)))
			.all();
		for (const s of others) if (s.id !== user.sessionId) revokeSession(db, s.id);
		return { ok: true };
	});
}
