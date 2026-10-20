import { type Actor, type Player, canSeePrivate, publicPlayer } from '@volan/domain';
import { and, eq, gt, inArray, sql } from 'drizzle-orm';
import type { Db } from '../db';
import { events, players } from '../db/schema';

type PlayerRow = typeof players.$inferSelect;

export function rowToPlayer(row: PlayerRow): Player {
	return {
		id: row.id,
		lastName: row.lastName,
		firstName: row.firstName,
		gender: row.gender,
		club: row.club,
		rating: row.rating,
		birthYear: row.birthYear,
		contact: row.contact,
		externalId: row.externalId,
		mergedIntoId: row.mergedIntoId,
		createdBy: row.createdBy
	};
}

// Действующая (не удалённая) запись справочника
export function findPlayer(db: Db, id: string): Player | undefined {
	const row = db
		.select()
		.from(players)
		.where(and(eq(players.id, id), eq(players.deleted, false)))
		.get();
	return row ? rowToPlayer(row) : undefined;
}

export function currentRevision(db: Db): number {
	return (
		db
			.select({ max: sql<number>`coalesce(max(${players.revision}), 0)` })
			.from(players)
			.get()?.max ?? 0
	);
}

// Заявлен ли игрок хоть в одном событии (тогда удалять нельзя — только объединять)
export function playerInUse(db: Db, playerId: string): boolean {
	const needle = `"playerId":${JSON.stringify(playerId)}`;
	return !!db
		.select({ id: events.id })
		.from(events)
		.where(sql`instr(${events.state}, ${needle}) > 0`)
		.get();
}

// Сохранить изменения справочника одной ревизией
export function savePlayers(db: Db, upsert: Player[], deleted: string[], now: Date): number {
	const revision = currentRevision(db) + 1;
	for (const player of upsert) {
		const values = { ...player, updatedAt: now, revision, deleted: false };
		db.insert(players)
			.values({ ...values, createdAt: now })
			.onConflictDoUpdate({ target: players.id, set: values })
			.run();
	}
	if (deleted.length > 0) {
		db.update(players)
			.set({ deleted: true, updatedAt: now, revision })
			.where(inArray(players.id, deleted))
			.run();
	}
	return revision;
}

export type PlayerView = Player | ReturnType<typeof publicPlayer> | { id: string; deleted: true };

// Изменения справочника после ревизии since; закрытые поля — только автору и суперюзеру
export function playersSince(db: Db, since: number, actor: Actor): PlayerView[] {
	return db
		.select()
		.from(players)
		.where(gt(players.revision, since))
		.all()
		.map((row) => {
			if (row.deleted) return { id: row.id, deleted: true as const };
			const player = rowToPlayer(row);
			return canSeePrivate(player, actor) ? player : publicPlayer(player);
		});
}

// Имена игроков для показа события: объединённые записи показываются по основной
export function playerNames(
	db: Db,
	ids: Iterable<string>
): Record<string, { lastName: string; firstName: string }> {
	const wanted = [...new Set(ids)];
	if (wanted.length === 0) return {};
	const rows = db.select().from(players).where(inArray(players.id, wanted)).all();
	const targetIds = rows.flatMap((r) => (r.mergedIntoId ? [r.mergedIntoId] : []));
	const targets = new Map(
		(targetIds.length > 0
			? db.select().from(players).where(inArray(players.id, targetIds)).all()
			: []
		).map((r) => [r.id, r])
	);
	const names: Record<string, { lastName: string; firstName: string }> = {};
	for (const row of rows) {
		const shown = (row.mergedIntoId && targets.get(row.mergedIntoId)) || row;
		names[row.id] = { lastName: shown.lastName, firstName: shown.firstName };
	}
	return names;
}
