import { randomUUID } from 'node:crypto';
import { eq, max } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { hashPassword } from '../auth/password';
import { revokeUserSessions } from '../auth/sessions';
import type { AppDeps } from '../app';
import { sessions, users } from '../db/schema';
import { HttpError, parseWith, requireSuperuser } from '../http';

const createBody = z.object({
	login: z.string().trim().min(1).max(100),
	displayName: z.string().trim().min(1).max(200),
	password: z.string().min(8).max(200)
});

const patchBody = z.object({
	displayName: z.string().trim().min(1).max(200).optional(),
	isActive: z.boolean().optional(),
	password: z.string().min(8).max(200).optional()
});

// Управление пользователями — только суперюзер
export function userRoutes(app: FastifyInstance, deps: AppDeps): void {
	const { db, config } = deps;

	app.get('/api/users', async (request) => {
		requireSuperuser(request);
		const lastSeen = new Map(
			db
				.select({ userId: sessions.userId, at: max(sessions.lastSeenAt) })
				.from(sessions)
				.groupBy(sessions.userId)
				.all()
				.map((r) => [r.userId, r.at])
		);
		return {
			users: db
				.select()
				.from(users)
				.all()
				.map((u) => ({
					id: u.id,
					login: u.login,
					displayName: u.displayName,
					role: u.role,
					isActive: u.isActive,
					createdAt: u.createdAt,
					lastSeenAt: lastSeen.get(u.id) ?? null
				}))
		};
	});

	app.post('/api/users', async (request, reply) => {
		requireSuperuser(request);
		const body = parseWith(createBody, request.body);
		if (db.select().from(users).where(eq(users.login, body.login)).get()) {
			throw new HttpError(409, 'user.loginTaken');
		}
		const id = randomUUID();
		db.insert(users)
			.values({
				id,
				login: body.login,
				displayName: body.displayName,
				passwordHash: await hashPassword(body.password, config.scrypt),
				role: 'organizer',
				isActive: true,
				createdAt: new Date()
			})
			.run();
		reply.status(201);
		return { user: { id, login: body.login, displayName: body.displayName, role: 'organizer' } };
	});

	app.patch<{ Params: { id: string } }>('/api/users/:id', async (request) => {
		requireSuperuser(request);
		const body = parseWith(patchBody, request.body);
		const user = db.select().from(users).where(eq(users.id, request.params.id)).get();
		if (!user) throw new HttpError(404, 'user.notFound');
		db.update(users)
			.set({
				...(body.displayName !== undefined && { displayName: body.displayName }),
				...(body.isActive !== undefined && { isActive: body.isActive }),
				...(body.password !== undefined && {
					passwordHash: await hashPassword(body.password, config.scrypt)
				})
			})
			.where(eq(users.id, user.id))
			.run();
		// Блокировка и сброс пароля выводят пользователя со всех устройств
		if (body.isActive === false || body.password !== undefined) revokeUserSessions(db, user.id);
		return { ok: true };
	});

	app.post<{ Params: { id: string } }>('/api/users/:id/revoke-sessions', async (request) => {
		requireSuperuser(request);
		revokeUserSessions(db, request.params.id);
		return { ok: true };
	});
}
