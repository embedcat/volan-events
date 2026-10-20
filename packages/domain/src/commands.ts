import { z } from 'zod';
import {
	categorySchema,
	disciplineSchema,
	entryPlayerSchema,
	entrySchema,
	gameScoreSchema,
	groupSchema,
	idSchema,
	isoTimeSchema,
	matchFormatSchema,
	matchResultSchema,
	matchSchema,
	sideSchema,
	stageSchema
} from './state';

const courtNumber = z.number().int().min(1).max(50);
const queueIndex = z.number().int().min(0);
const queuePositions = z.array(z.object({ matchId: idSchema, index: queueIndex }));
const nothing = z.object({}).strict();

export const resultInputSchema = z.object({
	kind: z.enum(['played', 'walkover', 'retired']),
	winner: sideSchema,
	games: z.array(gameScoreSchema).max(5),
	nonStandard: z.boolean()
});

const payloads = {
	'event.create': z.object({
		title: z.string().trim().min(1).max(200),
		date: z.iso.date(),
		venue: z.string().max(200).nullable(),
		courts: courtNumber,
		defaultFormat: matchFormatSchema,
		ownerId: idSchema
	}),
	'event.update': z.object({
		title: z.string().trim().min(1).max(200).optional(),
		date: z.iso.date().optional(),
		venue: z.string().max(200).nullable().optional(),
		defaultFormat: matchFormatSchema.optional()
	}),
	'event.setVisibility': z.object({ visibility: z.enum(['draft', 'published']) }),
	// enabled — признаки всех кортов; передаётся при отмене, чтобы вернуть выключенные корты
	'event.setCourts': z.object({ count: courtNumber, enabled: z.array(z.boolean()).optional() }),
	'court.setEnabled': z.object({ court: courtNumber, enabled: z.boolean() }),
	'event.start': nothing,
	'event.backToSetup': nothing,
	'event.finish': nothing,
	'event.reopen': nothing,

	'category.create': z.object({
		id: idSchema,
		discipline: disciplineSchema,
		level: z.string().trim().max(20).nullable(),
		customName: z.string().trim().max(200).nullable(),
		ratingMin: z.number().int().nullable(),
		ratingMax: z.number().int().nullable(),
		format: matchFormatSchema.optional() // иначе — формат события по умолчанию
	}),
	'category.update': z.object({
		categoryId: idSchema,
		discipline: disciplineSchema.optional(),
		level: z.string().trim().max(20).nullable().optional(),
		customName: z.string().trim().max(200).nullable().optional(),
		ratingMin: z.number().int().nullable().optional(),
		ratingMax: z.number().int().nullable().optional(),
		format: matchFormatSchema.optional()
	}),
	'category.delete': z.object({ categoryId: idSchema }),
	// Только для отмены удаления
	'category.restore': z.object({
		category: categorySchema,
		stages: z.array(stageSchema),
		groups: z.array(groupSchema),
		entries: z.array(entrySchema),
		matches: z.array(matchSchema),
		queue: queuePositions
	}),

	'entry.add': z.object({
		id: idSchema,
		categoryId: idSchema,
		players: z.array(entryPlayerSchema).min(1).max(2),
		// Место в группе; передаёт отмена удаления — от порядка зависит жеребьёвка
		position: z.number().int().min(0).optional()
	}),
	'entry.update': z.object({
		entryId: idSchema,
		players: z.array(entryPlayerSchema).min(1).max(2)
	}),
	'entry.remove': z.object({ entryId: idSchema }),
	'entry.withdraw': z.object({ entryId: idSchema }),
	// queue — места в очереди для возвращаемых матчей; без него матчи встают в конец
	'entry.reinstate': z.object({ entryId: idSchema, queue: queuePositions.optional() }),

	'group.generateSchedule': z.object({
		groupId: idSchema,
		seed: z.number().int().min(0).max(0xffffffff)
	}),
	'group.clearSchedule': z.object({ groupId: idSchema }),
	'group.resolveTie': z.object({ groupId: idSchema, order: z.array(idSchema).min(2) }),
	'group.clearTie': z.object({ groupId: idSchema, entryIds: z.array(idSchema).min(2) }),

	'queue.move': z.object({ matchId: idSchema, toIndex: queueIndex }),
	'match.call': z.object({ matchId: idSchema, court: courtNumber }),
	'match.uncall': z.object({ matchId: idSchema }),
	'match.moveCourt': z.object({ matchId: idSchema, court: courtNumber }),
	'match.recordResult': z.object({
		matchId: idSchema,
		result: resultInputSchema,
		// То, что клиент видел до ввода: null — результата не было
		expectedResult: matchResultSchema.nullable()
	}),
	'match.clearResult': z.object({ matchId: idSchema, expectedResult: matchResultSchema }),
	// Только для отмены: вернуть матч целиком, если сейчас он ровно такой, как expected
	'match.restore': z.object({
		match: matchSchema,
		queueIndex: queueIndex.nullable(),
		expected: matchSchema
	})
} as const;

type Payloads = typeof payloads;
export type EventCommandType = keyof Payloads;

function commandSchema<T extends EventCommandType>(type: T) {
	return z.object({
		id: idSchema,
		type: z.literal(type),
		scope: z.literal('event'),
		eventId: idSchema,
		payload: payloads[type],
		baseVersion: z.number().int().min(0).optional(),
		issuedAt: isoTimeSchema,
		deviceId: idSchema,
		schemaVersion: z.literal(1)
	});
}

const commandTypes = Object.keys(payloads) as EventCommandType[];

export const eventCommandSchema = z.discriminatedUnion(
	'type',
	commandTypes.map((type) => commandSchema(type)) as unknown as [
		ReturnType<typeof commandSchema<EventCommandType>>
	]
);

type CommandOf<T extends EventCommandType> = {
	id: string;
	type: T;
	scope: 'event';
	eventId: string;
	payload: z.infer<Payloads[T]>;
	baseVersion?: number;
	issuedAt: string;
	deviceId: string;
	schemaVersion: 1;
};

export type EventCommand = { [T in EventCommandType]: CommandOf<T> }[EventCommandType];
export type PayloadOf<T extends EventCommandType> = z.infer<Payloads[T]>;

// Черновик команды без конверта: так отдаёт команды отмена, конверт добавляет клиент
export type EventCommandDraft = {
	[T in EventCommandType]: { type: T; payload: PayloadOf<T> };
}[EventCommandType];

export type ResultInput = z.infer<typeof resultInputSchema>;

export function parseEventCommand(
	input: unknown
): { ok: true; command: EventCommand } | { ok: false; issues: z.core.$ZodIssue[] } {
	const parsed = eventCommandSchema.safeParse(input);
	return parsed.success
		? { ok: true, command: parsed.data as EventCommand }
		: { ok: false, issues: parsed.error.issues };
}
