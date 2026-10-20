import { and, desc, eq, isNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppDeps } from '../app';
import { rejectedCommands } from '../db/schema';
import { HttpError, actorOf, parseWith, requireUser } from '../http';
import { processCommand } from '../services/commands';
import { currentRevision, playersSince } from '../services/players';

// Пачка обрабатывается до конца: отклонённая команда не останавливает следующие (D104)
const batchBody = z.object({ commands: z.array(z.unknown()).min(1).max(200) });
const sinceQuery = z.object({ since: z.coerce.number().int().min(0).default(0) });
const resolveBody = z.object({ resolution: z.enum(['discarded', 'reapplied']) });

export function commandRoutes(app: FastifyInstance, deps: AppDeps): void {
	const { db, hub } = deps;

	app.post('/api/commands', async (request) => {
		const user = requireUser(request);
		const body = parseWith(batchBody, request.body);
		const ctx = { db, hub, actor: actorOf(user), now: new Date() };
		return { results: body.commands.map((raw) => processCommand(ctx, raw)) };
	});

	// Изменения справочника после ревизии since
	app.get('/api/players', async (request) => {
		const user = requireUser(request);
		const { since } = parseWith(sinceQuery, request.query);
		return { revision: currentRevision(db), players: playersSince(db, since, actorOf(user)) };
	});

	// Неразобранные отклонённые команды пользователя — со всех его устройств
	app.get('/api/rejected', async (request) => {
		const user = requireUser(request);
		return {
			rejected: db
				.select()
				.from(rejectedCommands)
				.where(and(eq(rejectedCommands.userId, user.id), isNull(rejectedCommands.resolvedAt)))
				.orderBy(desc(rejectedCommands.receivedAt))
				.all()
				.map((r) => ({
					id: r.id,
					scope: r.scope,
					eventId: r.eventId,
					command: r.command,
					reason: r.reason,
					deviceId: r.deviceId,
					issuedAt: r.issuedAt,
					receivedAt: r.receivedAt
				}))
		};
	});

	app.post<{ Params: { id: string } }>('/api/rejected/:id/resolve', async (request) => {
		const user = requireUser(request);
		const { resolution } = parseWith(resolveBody, request.body);
		const row = db
			.select()
			.from(rejectedCommands)
			.where(eq(rejectedCommands.id, request.params.id))
			.get();
		if (!row || row.userId !== user.id) throw new HttpError(404, 'rejected.notFound');
		db.update(rejectedCommands)
			.set({ resolvedAt: new Date(), resolution })
			.where(eq(rejectedCommands.id, row.id))
			.run();
		return { ok: true };
	});
}
