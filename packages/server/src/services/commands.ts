import {
	type Actor,
	type DomainError,
	type EventCommand,
	type PlayerCommand,
	type PlayerError,
	applyCommand,
	applyPlayerCommand,
	parseEventCommand,
	parsePlayerCommand
} from '@volan/domain';
import { eq } from 'drizzle-orm';
import type { Db } from '../db';
import { commands, events, rejectedCommands } from '../db/schema';
import type { EventHub } from '../hub';
import { findPlayer, playerInUse, savePlayers } from './players';

export type CommandOutcome =
	| { id: string; status: 'applied'; seq?: number; revision?: number }
	| { id: string; status: 'duplicate'; seq: number | null }
	| { id: string | null; status: 'invalid'; issues: unknown[] }
	| { id: string; status: 'forbidden' }
	| { id: string; status: 'rejected'; error: DomainError | PlayerError };

type Ctx = { db: Db; hub: EventHub; actor: Actor; now: Date };

// Одна команда из пачки. Обработка синхронная: между чтением и записью нет await,
// поэтому команды одного события не перемешиваются.
export function processCommand(ctx: Ctx, raw: unknown): CommandOutcome {
	const rawId = typeof raw === 'object' && raw && 'id' in raw ? String(raw.id) : null;
	const isRegistry = typeof raw === 'object' && raw && 'scope' in raw && raw.scope === 'registry';

	const parsed = isRegistry ? parsePlayerCommand(raw) : parseEventCommand(raw);
	if (!parsed.ok) return { id: rawId, status: 'invalid', issues: parsed.issues };

	const seen = ctx.db
		.select({ seq: commands.seq })
		.from(commands)
		.where(eq(commands.id, parsed.command.id))
		.get();
	if (seen) return { id: parsed.command.id, status: 'duplicate', seq: seen.seq };

	return parsed.command.scope === 'registry'
		? processPlayerCommand(ctx, parsed.command)
		: processEventCommand(ctx, parsed.command);
}

function processEventCommand(ctx: Ctx, command: EventCommand): CommandOutcome {
	const { db, actor, now } = ctx;
	const row = db.select().from(events).where(eq(events.id, command.eventId)).get();

	// Право: событие своё (или суперюзер); создать событие можно только на себя
	const owner = command.type === 'event.create' ? command.payload.ownerId : row?.ownerId;
	if (owner !== undefined && owner !== actor.userId && actor.role !== 'superuser') {
		return { id: command.id, status: 'forbidden' };
	}

	const result = applyCommand(row?.state ?? null, command);
	if (!result.ok) return reject(ctx, command, command.eventId, result.error);

	const { state } = result;
	const seq = (row?.version ?? 0) + 1;
	db.transaction((tx) => {
		const columns = {
			title: state.title,
			date: state.date,
			visibility: state.visibility,
			progress: state.progress,
			version: seq,
			state,
			updatedAt: now
		};
		if (row) {
			tx.update(events).set(columns).where(eq(events.id, row.id)).run();
		} else {
			tx.insert(events)
				.values({ ...columns, id: state.id, ownerId: state.ownerId, createdAt: now })
				.run();
		}
		tx.insert(commands)
			.values({
				id: command.id,
				scope: 'event',
				eventId: command.eventId,
				seq,
				type: command.type,
				command,
				userId: actor.userId,
				deviceId: command.deviceId,
				baseVersion: command.baseVersion ?? null,
				issuedAt: command.issuedAt,
				receivedAt: now
			})
			.run();
	});
	ctx.hub.publish(command.eventId, seq, command);
	return { id: command.id, status: 'applied', seq };
}

function processPlayerCommand(ctx: Ctx, command: PlayerCommand): CommandOutcome {
	const { db, actor, now } = ctx;
	if (command.type === 'player.delete' && findPlayer(db, command.payload.playerId)) {
		if (playerInUse(db, command.payload.playerId)) {
			return reject(ctx, command, null, {
				code: 'player.inUse',
				playerId: command.payload.playerId
			});
		}
	}

	const result = applyPlayerCommand((id) => findPlayer(db, id), command, actor);
	if (!result.ok) return reject(ctx, command, null, result.error);

	const revision = db.transaction((tx) => {
		const rev = savePlayers(tx as unknown as Db, result.upsert, result.deleted, now);
		tx.insert(commands)
			.values({
				id: command.id,
				scope: 'registry',
				eventId: null,
				seq: null,
				type: command.type,
				command,
				userId: actor.userId,
				deviceId: command.deviceId,
				baseVersion: null,
				issuedAt: command.issuedAt,
				receivedAt: now
			})
			.run();
		return rev;
	});
	return { id: command.id, status: 'applied', revision };
}

function reject(
	ctx: Ctx,
	command: EventCommand | PlayerCommand,
	eventId: string | null,
	error: DomainError | PlayerError
): CommandOutcome {
	ctx.db
		.insert(rejectedCommands)
		.values({
			id: command.id,
			scope: command.scope,
			eventId,
			type: command.type,
			command,
			reason: error,
			userId: ctx.actor.userId,
			deviceId: command.deviceId,
			issuedAt: command.issuedAt,
			receivedAt: ctx.now
		})
		.onConflictDoNothing()
		.run();
	return { id: command.id, status: 'rejected', error };
}
