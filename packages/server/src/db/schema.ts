import type { EventState } from '@volan/domain';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

const timestamp = (name: string) => integer(name, { mode: 'timestamp_ms' });

export const users = sqliteTable('users', {
	id: text('id').primaryKey(),
	login: text('login').notNull().unique(),
	passwordHash: text('password_hash').notNull(),
	displayName: text('display_name').notNull(),
	role: text('role', { enum: ['superuser', 'organizer'] }).notNull(),
	isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
	createdAt: timestamp('created_at').notNull()
});

export const sessions = sqliteTable(
	'sessions',
	{
		// SHA-256 от токена; сам токен есть только в cookie
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => users.id),
		deviceId: text('device_id').notNull(),
		deviceLabel: text('device_label').notNull(),
		createdAt: timestamp('created_at').notNull(),
		lastSeenAt: timestamp('last_seen_at').notNull(),
		expiresAt: timestamp('expires_at').notNull(),
		revokedAt: timestamp('revoked_at')
	},
	(t) => [index('sessions_user_idx').on(t.userId)]
);

export const players = sqliteTable(
	'players',
	{
		id: text('id').primaryKey(),
		lastName: text('last_name').notNull(),
		firstName: text('first_name').notNull(),
		gender: text('gender', { enum: ['M', 'F'] }).notNull(),
		club: text('club'),
		rating: integer('rating'),
		birthYear: integer('birth_year'),
		contact: text('contact'),
		externalId: text('external_id'),
		mergedIntoId: text('merged_into_id'),
		createdBy: text('created_by').notNull(),
		createdAt: timestamp('created_at').notNull(),
		updatedAt: timestamp('updated_at').notNull(),
		// Сквозной номер изменения справочника: клиент забирает всё, что новее известной ему ревизии
		revision: integer('revision').notNull(),
		// Удалённые остаются записью-меткой, чтобы удаление дошло до других устройств
		deleted: integer('deleted', { mode: 'boolean' }).notNull().default(false)
	},
	(t) => [index('players_revision_idx').on(t.revision)]
);

export const events = sqliteTable(
	'events',
	{
		id: text('id').primaryKey(),
		ownerId: text('owner_id').notNull(),
		// Копии из state — для списков и фильтров
		title: text('title').notNull(),
		date: text('date').notNull(),
		visibility: text('visibility', { enum: ['draft', 'published'] }).notNull(),
		progress: text('progress', { enum: ['setup', 'running', 'finished'] }).notNull(),
		version: integer('version').notNull(),
		state: text('state', { mode: 'json' }).$type<EventState>().notNull(),
		createdAt: timestamp('created_at').notNull(),
		updatedAt: timestamp('updated_at').notNull()
	},
	(t) => [index('events_owner_idx').on(t.ownerId)]
);

// Журнал применённых команд (и событий, и справочника)
export const commands = sqliteTable(
	'commands',
	{
		id: text('id').primaryKey(),
		scope: text('scope', { enum: ['event', 'registry'] }).notNull(),
		eventId: text('event_id'),
		seq: integer('seq'), // номер в событии; у команд справочника — null
		type: text('type').notNull(),
		command: text('command', { mode: 'json' }).notNull(), // конверт целиком
		userId: text('user_id').notNull(),
		deviceId: text('device_id').notNull(),
		baseVersion: integer('base_version'),
		issuedAt: text('issued_at').notNull(),
		receivedAt: timestamp('received_at').notNull()
	},
	(t) => [uniqueIndex('commands_event_seq_idx').on(t.eventId, t.seq)]
);

export const rejectedCommands = sqliteTable(
	'rejected_commands',
	{
		id: text('id').primaryKey(), // ID команды
		scope: text('scope', { enum: ['event', 'registry'] }).notNull(),
		eventId: text('event_id'),
		type: text('type').notNull(),
		command: text('command', { mode: 'json' }).notNull(),
		reason: text('reason', { mode: 'json' }).notNull(), // код и параметры ошибки domain
		userId: text('user_id').notNull(),
		deviceId: text('device_id').notNull(),
		issuedAt: text('issued_at').notNull(),
		receivedAt: timestamp('received_at').notNull(),
		resolvedAt: timestamp('resolved_at'),
		resolution: text('resolution', { enum: ['discarded', 'reapplied'] })
	},
	(t) => [index('rejected_user_idx').on(t.userId)]
);
