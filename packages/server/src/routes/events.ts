import type { EventState } from '@volan/domain';
import { and, asc, desc, eq, gt } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AppDeps } from '../app';
import type { AuthUser } from '../auth/sessions';
import type { Db } from '../db';
import { commands, events, rejectedCommands } from '../db/schema';
import { sseMessage } from '../hub';
import { HttpError, parseWith, requireUser } from '../http';
import { playerNames } from '../services/players';

type EventRow = typeof events.$inferSelect;

const HEARTBEAT_MS = 25_000;

function canManage(row: EventRow, user: AuthUser | null): boolean {
	return !!user && (user.role === 'superuser' || user.id === row.ownerId);
}

function findEvent(db: Db, id: string): EventRow {
	const row = db.select().from(events).where(eq(events.id, id)).get();
	if (!row) throw new HttpError(404, 'event.notFound');
	return row;
}

// Событие для управления — только владельцу и суперюзеру
function managedEvent(db: Db, request: FastifyRequest, id: string): EventRow {
	const user = requireUser(request);
	const row = findEvent(db, id);
	if (!canManage(row, user)) throw new HttpError(403, 'event.forbidden');
	return row;
}

// Черновик для чужих не существует
function visibleEvent(db: Db, request: FastifyRequest, id: string): EventRow {
	const row = findEvent(db, id);
	if (row.visibility !== 'published' && !canManage(row, request.user)) {
		throw new HttpError(404, 'event.notFound');
	}
	return row;
}

function eventPlayerIds(state: EventState): string[] {
	const ids = Object.values(state.entries).flatMap((e) => e.players.map((p) => p.playerId));
	for (const m of Object.values(state.matches))
		ids.push(...(m.lineupA ?? []), ...(m.lineupB ?? []));
	return ids;
}

function summary(row: EventRow) {
	return {
		id: row.id,
		title: row.title,
		date: row.date,
		venue: row.state.venue,
		visibility: row.visibility,
		progress: row.progress,
		ownerId: row.ownerId,
		updatedAt: row.updatedAt
	};
}

const listQuery = z.object({ owner: z.enum(['me']).optional() });
const afterQuery = z.object({ after: z.coerce.number().int().min(0).default(0) });

export function eventRoutes(app: FastifyInstance, deps: AppDeps): void {
	const { db, hub } = deps;

	// Опубликованные события — всем; ?owner=me — свои (суперюзеру — все)
	app.get('/api/events', async (request) => {
		const query = parseWith(listQuery, request.query);
		if (query.owner === 'me') {
			const user = requireUser(request);
			const rows =
				user.role === 'superuser'
					? db.select().from(events).orderBy(desc(events.date)).all()
					: db
							.select()
							.from(events)
							.where(eq(events.ownerId, user.id))
							.orderBy(desc(events.date))
							.all();
			return { events: rows.map(summary) };
		}
		const rows = db
			.select()
			.from(events)
			.where(eq(events.visibility, 'published'))
			.orderBy(desc(events.date))
			.all();
		return { events: rows.map(summary) };
	});

	app.get<{ Params: { id: string } }>('/api/events/:id', async (request) => {
		const row = managedEvent(db, request, request.params.id);
		return {
			state: row.state,
			version: row.version,
			players: playerNames(db, eventPlayerIds(row.state))
		};
	});

	// Публичное представление: состояние события без владельца + имена игроков
	app.get<{ Params: { id: string } }>('/api/public/events/:id', async (request) => {
		const row = visibleEvent(db, request, request.params.id);
		const { ownerId: _o, ...state } = row.state;
		return { state, version: row.version, players: playerNames(db, eventPlayerIds(row.state)) };
	});

	app.get<{ Params: { id: string } }>('/api/events/:id/commands', async (request) => {
		const row = managedEvent(db, request, request.params.id);
		const { after } = parseWith(afterQuery, request.query);
		return {
			version: row.version,
			commands: db
				.select({ seq: commands.seq, command: commands.command })
				.from(commands)
				.where(and(eq(commands.eventId, row.id), gt(commands.seq, after)))
				.orderBy(asc(commands.seq))
				.all()
		};
	});

	// Владелец — пока нет сыгранных матчей; суперюзер — всегда. Подтверждение — в интерфейсе.
	app.delete<{ Params: { id: string } }>('/api/events/:id', async (request) => {
		const user = requireUser(request);
		const row = managedEvent(db, request, request.params.id);
		const hasResults = Object.values(row.state.matches).some((m) => m.status === 'finished');
		if (hasResults && user.role !== 'superuser') throw new HttpError(409, 'event.hasResults');
		db.transaction((tx) => {
			tx.delete(commands).where(eq(commands.eventId, row.id)).run();
			tx.delete(rejectedCommands).where(eq(rejectedCommands.eventId, row.id)).run();
			tx.delete(events).where(eq(events.id, row.id)).run();
		});
		return { ok: true };
	});

	// SSE: владельцу — команды (с догоном пропущенного), остальным — сигнал «изменилось»
	app.get<{ Params: { id: string } }>('/api/events/:id/stream', async (request, reply) => {
		const row = visibleEvent(db, request, request.params.id);
		const mode = canManage(row, request.user) ? 'owner' : 'guest';
		const lastId = Number(
			request.headers['last-event-id'] ?? (request.query as { after?: string }).after
		);

		reply.hijack();
		const raw = reply.raw;
		raw.writeHead(200, {
			'Content-Type': 'text/event-stream; charset=utf-8',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive',
			'X-Accel-Buffering': 'no' // nginx: не буферизовать поток
		});
		raw.write(sseMessage({ event: 'hello', data: { mode, version: row.version } }));

		if (mode === 'owner' && Number.isInteger(lastId) && lastId >= 0) {
			const missed = db
				.select({ seq: commands.seq, command: commands.command })
				.from(commands)
				.where(and(eq(commands.eventId, row.id), gt(commands.seq, lastId)))
				.orderBy(asc(commands.seq))
				.all();
			for (const m of missed)
				raw.write(sseMessage({ id: m.seq ?? 0, event: 'command', data: m.command }));
		}

		const unsubscribe = hub.subscribe(row.id, { mode, send: (chunk) => raw.write(chunk) });
		const heartbeat = setInterval(() => raw.write(': ping\n\n'), HEARTBEAT_MS);
		request.raw.on('close', () => {
			clearInterval(heartbeat);
			unsubscribe();
		});
	});
}
