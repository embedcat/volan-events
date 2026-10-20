import { z } from 'zod';
import { genderSchema, idSchema, isoTimeSchema } from './state';
import { deepEqual } from './util';

// Справочник игроков: общий для всех событий, меняется своими командами (scope: 'registry')

const name = z.string().trim().min(1).max(100);

export const playerFieldsSchema = z.object({
	lastName: name,
	firstName: name,
	gender: genderSchema,
	club: z.string().trim().max(200).nullable(), // клуб или город
	rating: z.number().int().nullable(),
	birthYear: z.number().int().min(1900).max(2100).nullable(), // закрытое поле
	contact: z.string().trim().max(200).nullable(), // закрытое поле
	externalId: z.string().trim().max(100).nullable() // закрытое поле: ID во внешней базе
});

export const playerSchema = playerFieldsSchema.extend({
	id: idSchema,
	mergedIntoId: idSchema.nullable(), // объединённая запись указывает на основную
	createdBy: idSchema
});

export type PlayerFields = z.infer<typeof playerFieldsSchema>;
export type Player = z.infer<typeof playerSchema>;

// Закрытые поля видят только автор записи и суперюзер
export const PRIVATE_PLAYER_FIELDS = ['birthYear', 'contact', 'externalId'] as const;
export type PublicPlayer = Omit<Player, (typeof PRIVATE_PLAYER_FIELDS)[number]>;

export type Actor = { userId: string; role: 'superuser' | 'organizer' };

export function canSeePrivate(player: Player, actor: Actor | null): boolean {
	return actor !== null && (actor.role === 'superuser' || actor.userId === player.createdBy);
}

export function canEditPlayer(player: Player, actor: Actor): boolean {
	return actor.role === 'superuser' || actor.userId === player.createdBy;
}

export function publicPlayer(player: Player): PublicPlayer {
	const { birthYear: _b, contact: _c, externalId: _e, ...rest } = player;
	return rest;
}

const partialFields = playerFieldsSchema.partial();

const payloads = {
	'player.create': playerFieldsSchema.extend({ id: idSchema, createdBy: idSchema }),
	// expected — значения тех же полей, какими их видел клиент: защита от затирания чужой правки
	'player.update': z.object({
		playerId: idSchema,
		changes: partialFields,
		expected: partialFields
	}),
	'player.delete': z.object({ playerId: idSchema }),
	'player.merge': z.object({ sourceId: idSchema, targetId: idSchema }),
	'player.unmerge': z.object({ sourceId: idSchema })
} as const;

type Payloads = typeof payloads;
export type PlayerCommandType = keyof Payloads;

function commandSchema<T extends PlayerCommandType>(type: T) {
	return z.object({
		id: idSchema,
		type: z.literal(type),
		scope: z.literal('registry'),
		payload: payloads[type],
		issuedAt: isoTimeSchema,
		deviceId: idSchema,
		schemaVersion: z.literal(1)
	});
}

export const playerCommandSchema = z.discriminatedUnion(
	'type',
	(Object.keys(payloads) as PlayerCommandType[]).map((type) => commandSchema(type)) as unknown as [
		ReturnType<typeof commandSchema<PlayerCommandType>>
	]
);

export type PlayerCommand = {
	[T in PlayerCommandType]: {
		id: string;
		type: T;
		scope: 'registry';
		payload: z.infer<Payloads[T]>;
		issuedAt: string;
		deviceId: string;
		schemaVersion: 1;
	};
}[PlayerCommandType];

export type PlayerCommandDraft = {
	[T in PlayerCommandType]: { type: T; payload: z.infer<Payloads[T]> };
}[PlayerCommandType];

export function parsePlayerCommand(
	input: unknown
): { ok: true; command: PlayerCommand } | { ok: false; issues: z.core.$ZodIssue[] } {
	const parsed = playerCommandSchema.safeParse(input);
	return parsed.success
		? { ok: true, command: parsed.data as PlayerCommand }
		: { ok: false, issues: parsed.error.issues };
}

export type PlayerError =
	| { code: 'player.exists'; playerId: string }
	| { code: 'player.notFound'; playerId: string }
	| { code: 'player.forbidden'; playerId: string }
	| { code: 'player.changed'; playerId: string } // конфликт: поля уже изменили
	| { code: 'player.merged'; playerId: string } // запись уже объединена с другой
	| { code: 'player.notMerged'; playerId: string }
	| { code: 'player.sameRecord'; playerId: string }
	| { code: 'player.inUse'; playerId: string }; // проверяет сервер: игрок заявлен в событиях

// Результат: записи, которые надо сохранить, и ID удалённых
export type PlayerApplyResult =
	{ ok: true; upsert: Player[]; deleted: string[] } | { ok: false; error: PlayerError };

// Применение команды справочника. lookup — текущие записи (в том числе объединённые).
export function applyPlayerCommand(
	lookup: (id: string) => Player | undefined,
	command: PlayerCommand,
	actor: Actor
): PlayerApplyResult {
	switch (command.type) {
		case 'player.create': {
			const { id, createdBy, ...fields } = command.payload;
			const existing = lookup(id);
			if (existing) {
				// Повторная отправка той же команды — не ошибка
				const same = deepEqual(existing, { ...fields, id, createdBy, mergedIntoId: null });
				return same ? ok([], []) : fail({ code: 'player.exists', playerId: id });
			}
			if (createdBy !== actor.userId && actor.role !== 'superuser') {
				return fail({ code: 'player.forbidden', playerId: id });
			}
			return ok([{ ...fields, id, createdBy, mergedIntoId: null }], []);
		}

		case 'player.update': {
			const { playerId, changes, expected } = command.payload;
			const player = lookup(playerId);
			if (!player) return fail({ code: 'player.notFound', playerId });
			if (!canEditPlayer(player, actor)) return fail({ code: 'player.forbidden', playerId });
			const keys = Object.keys(changes) as (keyof PlayerFields)[];
			if (keys.every((key) => deepEqual(player[key], changes[key]))) return ok([], []);
			if (keys.some((key) => !deepEqual(player[key], expected[key]))) {
				return fail({ code: 'player.changed', playerId });
			}
			return ok([{ ...player, ...changes }], []);
		}

		case 'player.delete': {
			const { playerId } = command.payload;
			const player = lookup(playerId);
			if (!player) return ok([], []); // уже удалён
			if (!canEditPlayer(player, actor)) return fail({ code: 'player.forbidden', playerId });
			return ok([], [playerId]);
		}

		case 'player.merge': {
			const { sourceId, targetId } = command.payload;
			if (sourceId === targetId) return fail({ code: 'player.sameRecord', playerId: sourceId });
			const source = lookup(sourceId);
			const target = lookup(targetId);
			if (!source) return fail({ code: 'player.notFound', playerId: sourceId });
			if (!target) return fail({ code: 'player.notFound', playerId: targetId });
			const allowed =
				actor.role === 'superuser' ||
				(source.createdBy === actor.userId && target.createdBy === actor.userId);
			if (!allowed) return fail({ code: 'player.forbidden', playerId: sourceId });
			if (source.mergedIntoId === targetId) return ok([], []);
			if (source.mergedIntoId) return fail({ code: 'player.merged', playerId: sourceId });
			if (target.mergedIntoId) return fail({ code: 'player.merged', playerId: targetId });
			return ok([{ ...source, mergedIntoId: targetId }], []);
		}

		case 'player.unmerge': {
			const { sourceId } = command.payload;
			const source = lookup(sourceId);
			if (!source) return fail({ code: 'player.notFound', playerId: sourceId });
			if (!source.mergedIntoId) return ok([], []);
			const target = lookup(source.mergedIntoId);
			const allowed =
				actor.role === 'superuser' ||
				(source.createdBy === actor.userId && target?.createdBy === actor.userId);
			if (!allowed) return fail({ code: 'player.forbidden', playerId: sourceId });
			return ok([{ ...source, mergedIntoId: null }], []);
		}
	}
}

// Обратная команда для «Отменить»
export function invertPlayerCommand(
	lookup: (id: string) => Player | undefined,
	command: PlayerCommand
): PlayerCommandDraft[] {
	switch (command.type) {
		case 'player.create':
			return lookup(command.payload.id)
				? []
				: [{ type: 'player.delete', payload: { playerId: command.payload.id } }];
		case 'player.update': {
			const player = lookup(command.payload.playerId);
			if (!player) return [];
			const changes: Partial<PlayerFields> = {};
			for (const key of Object.keys(command.payload.changes) as (keyof PlayerFields)[]) {
				Object.assign(changes, { [key]: player[key] });
			}
			return [
				{
					type: 'player.update',
					payload: { playerId: player.id, changes, expected: command.payload.changes }
				}
			];
		}
		case 'player.delete': {
			const player = lookup(command.payload.playerId);
			if (!player) return [];
			const { mergedIntoId: _m, ...fields } = player;
			return [{ type: 'player.create', payload: fields }];
		}
		case 'player.merge':
			return [{ type: 'player.unmerge', payload: { sourceId: command.payload.sourceId } }];
		case 'player.unmerge': {
			const target = lookup(command.payload.sourceId)?.mergedIntoId;
			return target
				? [
						{
							type: 'player.merge',
							payload: { sourceId: command.payload.sourceId, targetId: target }
						}
					]
				: [];
		}
	}
}

function ok(upsert: Player[], deleted: string[]): PlayerApplyResult {
	return { ok: true, upsert, deleted };
}

function fail(error: PlayerError): PlayerApplyResult {
	return { ok: false, error };
}
