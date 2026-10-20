import { z } from 'zod';

// Схемы — единственный источник формы данных: типы выводятся из них,
// сервер и браузер проверяют по ним снимки и команды.

export const idSchema = z.string().min(1).max(200);
export const isoTimeSchema = z.iso.datetime({ offset: true });

export const gamePointsSchema = z.union([z.literal(21), z.literal(15)]);
export const matchFormatSchema = z.object({
	points: gamePointsSchema,
	bestOf: z.union([z.literal(1), z.literal(3)]),
	deciderPoints: gamePointsSchema
});

export const disciplineSchema = z.enum(['MS', 'WS', 'MD', 'WD', 'XD', 'OS', 'OD']);
export const genderSchema = z.enum(['M', 'F']);
export const sideSchema = z.enum(['A', 'B']);
export const gameScoreSchema = z.tuple([z.number(), z.number()]);

export const courtSchema = z.object({
	number: z.number().int().min(1),
	enabled: z.boolean()
});

export const categorySchema = z.object({
	id: idSchema,
	discipline: disciplineSchema,
	level: z.string().max(20).nullable(),
	customName: z.string().max(200).nullable(),
	ratingMin: z.number().int().nullable(),
	ratingMax: z.number().int().nullable(),
	stageIds: z.array(idSchema)
});

export const entryPlayerSchema = z.object({
	playerId: idSchema,
	gender: genderSchema,
	rating: z.number().int().nullable(), // снимок на момент события
	club: z.string().max(200).nullable() // снимок на момент события
});

export const entrySchema = z.object({
	id: idSchema,
	categoryId: idSchema,
	players: z.array(entryPlayerSchema).min(1).max(2),
	status: z.enum(['active', 'withdrawn'])
});

export const stageSchema = z.object({
	id: idSchema,
	categoryId: idSchema,
	kind: z.enum(['groups', 'bracket']),
	format: matchFormatSchema
});

export const groupSchema = z.object({
	id: idSchema,
	stageId: idSchema,
	name: z.string().min(1).max(10),
	entryIds: z.array(idSchema), // после составления расписания — порядок посева
	scheduleSeed: z.number().int().nullable(), // зерно жеребьёвки; null — расписания нет
	lots: z.array(z.array(idSchema)) // расстановки по жребию
});

export const matchResultSchema = z.object({
	kind: z.enum(['played', 'walkover', 'retired']),
	winner: sideSchema,
	games: z.array(gameScoreSchema).max(5),
	nonStandard: z.boolean(),
	byWithdrawal: z.boolean()
});

export const matchSchema = z.object({
	id: idSchema,
	number: z.number().int().min(1),
	stageId: idSchema,
	groupId: idSchema.nullable(),
	round: z.number().int().min(1),
	sideA: idSchema,
	sideB: idSchema,
	status: z.enum(['pending', 'on_court', 'finished']),
	court: z.number().int().min(1).nullable(), // у сыгранного — корт, где играли
	calledAt: isoTimeSchema.nullable(),
	finishedAt: isoTimeSchema.nullable(),
	lineupA: z.array(idSchema).nullable(), // кто реально играл — при вводе результата
	lineupB: z.array(idSchema).nullable(),
	result: matchResultSchema.nullable()
});

export const eventStateSchema = z.object({
	stateVersion: z.literal(1),
	id: idSchema,
	ownerId: idSchema,
	title: z.string().min(1).max(200),
	date: z.iso.date(),
	venue: z.string().max(200).nullable(),
	visibility: z.enum(['draft', 'published']),
	progress: z.enum(['setup', 'running', 'finished']),
	courts: z.array(courtSchema),
	defaultFormat: matchFormatSchema,
	categories: z.record(idSchema, categorySchema),
	entries: z.record(idSchema, entrySchema),
	stages: z.record(idSchema, stageSchema),
	groups: z.record(idSchema, groupSchema),
	matches: z.record(idSchema, matchSchema),
	queue: z.array(idSchema) // общая очередь события
});

export type Court = z.infer<typeof courtSchema>;
export type Category = z.infer<typeof categorySchema>;
export type EntryPlayer = z.infer<typeof entryPlayerSchema>;
export type Entry = z.infer<typeof entrySchema>;
export type Stage = z.infer<typeof stageSchema>;
export type Group = z.infer<typeof groupSchema>;
export type MatchResult = z.infer<typeof matchResultSchema>;
export type Match = z.infer<typeof matchSchema>;
export type EventState = z.infer<typeof eventStateSchema>;
