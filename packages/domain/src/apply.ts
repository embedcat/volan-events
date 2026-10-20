import type { Discipline } from './category';
import type { EventCommand, EventCommandType, PayloadOf } from './commands';
import type { DomainError } from './errors';
import { busyPlayerIds, entryPlayerIds, matchOnCourt, matchPlayerIds } from './queue';
import { validateMatchResult } from './score';
import { roundRobin } from './schedule';
import { entryRating, seedOrder } from './seeding';
import type { EntryPlayer, EventState, Group, Match, MatchResult } from './state';
import { computeStandings } from './standings';
import { clone, deepEqual, insertAt, removeItem } from './util';
import { STATE_VERSION } from './version';

export type ApplyResult = { ok: true; state: EventState } | { ok: false; error: DomainError };

type Ctx = { commandId: string; issuedAt: string };
type Handler<T extends EventCommandType> = (
	s: EventState,
	p: PayloadOf<T>,
	ctx: Ctx
) => DomainError | undefined;

// В завершённом событии можно только вернуть его в работу, поправить описание и видимость
const ALLOWED_WHEN_FINISHED = new Set<EventCommandType>([
	'event.reopen',
	'event.update',
	'event.setVisibility'
]);

// Применение команды: чистая функция, исходное состояние не меняется.
// Всё недетерминированное (ID, зерно, время) берётся из команды.
export function applyCommand(state: EventState | null, command: EventCommand): ApplyResult {
	if (command.type === 'event.create') {
		if (state) return fail({ code: 'event.exists' });
		return { ok: true, state: createEvent(command.eventId, command.payload) };
	}
	if (!state) return fail({ code: 'event.notFound' });
	if (state.id !== command.eventId) return fail({ code: 'event.mismatch' });
	if (state.progress === 'finished' && !ALLOWED_WHEN_FINISHED.has(command.type)) {
		return fail({ code: 'event.finished' });
	}

	const next = clone(state);
	const handler = handlers[command.type] as Handler<EventCommandType>;
	const error = handler(next, command.payload as never, {
		commandId: command.id,
		issuedAt: command.issuedAt
	});
	return error ? fail(error) : { ok: true, state: next };
}

function fail(error: DomainError): ApplyResult {
	return { ok: false, error };
}

function createEvent(id: string, p: PayloadOf<'event.create'>): EventState {
	return {
		stateVersion: STATE_VERSION,
		id,
		ownerId: p.ownerId,
		title: p.title,
		date: p.date,
		venue: p.venue,
		visibility: 'draft',
		progress: 'setup',
		courts: Array.from({ length: p.courts }, (_, i) => ({ number: i + 1, enabled: true })),
		defaultFormat: p.defaultFormat,
		categories: {},
		entries: {},
		stages: {},
		groups: {},
		matches: {},
		queue: []
	};
}

const handlers: { [T in Exclude<EventCommandType, 'event.create'>]: Handler<T> } = {
	'event.update': (s, p) => {
		if (p.title !== undefined) s.title = p.title;
		if (p.date !== undefined) s.date = p.date;
		if (p.venue !== undefined) s.venue = p.venue;
		if (p.defaultFormat !== undefined) s.defaultFormat = p.defaultFormat;
		return undefined;
	},

	'event.setVisibility': (s, p) => {
		s.visibility = p.visibility;
		return undefined;
	},

	'event.setCourts': (s, p) => {
		for (const m of Object.values(s.matches)) {
			if (m.status === 'on_court' && m.court !== null && m.court > p.count) {
				return { code: 'court.busy', court: m.court };
			}
		}
		const enabled = p.enabled?.length === p.count ? p.enabled : undefined;
		s.courts = Array.from({ length: p.count }, (_, i) => ({
			number: i + 1,
			enabled: enabled?.[i] ?? s.courts[i]?.enabled ?? true
		}));
		return undefined;
	},

	'court.setEnabled': (s, p) => {
		const court = s.courts[p.court - 1];
		if (!court) return { code: 'court.notFound', court: p.court };
		if (!p.enabled && matchOnCourt(s, p.court)) return { code: 'court.busy', court: p.court };
		court.enabled = p.enabled;
		return undefined;
	},

	'event.start': (s) => {
		if (s.progress !== 'setup') return { code: 'event.notSetup' };
		if (Object.keys(s.matches).length === 0) return { code: 'event.noSchedule' };
		s.progress = 'running';
		return undefined;
	},

	'event.backToSetup': (s) => {
		if (s.progress !== 'running') return { code: 'event.notRunning' };
		if (Object.values(s.matches).some((m) => m.status !== 'pending')) {
			return { code: 'event.matchesStarted' };
		}
		s.progress = 'setup';
		return undefined;
	},

	'event.finish': (s) => {
		if (s.progress !== 'running') return { code: 'event.notRunning' };
		if (Object.values(s.matches).some((m) => m.status === 'on_court')) {
			return { code: 'event.matchesOnCourt' };
		}
		s.progress = 'finished';
		return undefined;
	},

	'event.reopen': (s) => {
		if (s.progress !== 'finished') return { code: 'event.notFinished' };
		s.progress = 'running';
		return undefined;
	},

	'category.create': (s, p) => {
		if (s.categories[p.id]) return { code: 'category.exists', categoryId: p.id };
		const stageId = `${p.id}/groups`;
		const groupId = `${p.id}/A`;
		s.categories[p.id] = {
			id: p.id,
			discipline: p.discipline,
			level: p.level,
			customName: p.customName,
			ratingMin: p.ratingMin,
			ratingMax: p.ratingMax,
			stageIds: [stageId]
		};
		s.stages[stageId] = {
			id: stageId,
			categoryId: p.id,
			kind: 'groups',
			format: p.format ?? s.defaultFormat
		};
		s.groups[groupId] = {
			id: groupId,
			stageId,
			name: 'A',
			entryIds: [],
			scheduleSeed: null,
			lots: []
		};
		return undefined;
	},

	'category.update': (s, p) => {
		const category = s.categories[p.categoryId];
		if (!category) return { code: 'category.notFound', categoryId: p.categoryId };
		const hasEntries = Object.values(s.entries).some((e) => e.categoryId === category.id);
		if (p.discipline !== undefined && p.discipline !== category.discipline && hasEntries) {
			return { code: 'category.hasEntries', categoryId: category.id };
		}
		if (p.format !== undefined) {
			const changed = category.stageIds.some((id) => !deepEqual(s.stages[id]?.format, p.format));
			const started = Object.values(s.matches).some(
				(m) => category.stageIds.includes(m.stageId) && m.status !== 'pending'
			);
			if (changed && started) return { code: 'category.hasResults', categoryId: category.id };
			for (const id of category.stageIds) {
				const stage = s.stages[id];
				if (stage) stage.format = p.format;
			}
		}
		if (p.discipline !== undefined) category.discipline = p.discipline;
		if (p.level !== undefined) category.level = p.level;
		if (p.customName !== undefined) category.customName = p.customName;
		if (p.ratingMin !== undefined) category.ratingMin = p.ratingMin;
		if (p.ratingMax !== undefined) category.ratingMax = p.ratingMax;
		return undefined;
	},

	'category.delete': (s, p) => {
		const category = s.categories[p.categoryId];
		if (!category) return { code: 'category.notFound', categoryId: p.categoryId };
		const matches = Object.values(s.matches).filter((m) => category.stageIds.includes(m.stageId));
		if (matches.some((m) => m.status !== 'pending')) {
			return { code: 'category.hasResults', categoryId: category.id };
		}
		for (const m of matches) removeMatch(s, m.id);
		for (const e of Object.values(s.entries)) {
			if (e.categoryId === category.id) delete s.entries[e.id];
		}
		for (const g of Object.values(s.groups)) {
			if (category.stageIds.includes(g.stageId)) delete s.groups[g.id];
		}
		for (const id of category.stageIds) delete s.stages[id];
		delete s.categories[category.id];
		return undefined;
	},

	'category.restore': (s, p) => {
		if (s.categories[p.category.id]) {
			return { code: 'category.exists', categoryId: p.category.id };
		}
		s.categories[p.category.id] = p.category;
		for (const stage of p.stages) s.stages[stage.id] = stage;
		for (const group of p.groups) s.groups[group.id] = group;
		for (const entry of p.entries) s.entries[entry.id] = entry;
		for (const match of p.matches) s.matches[match.id] = match;
		for (const { matchId, index } of [...p.queue].sort((a, b) => a.index - b.index)) {
			if (s.matches[matchId]) insertAt(s.queue, index, matchId);
		}
		return undefined;
	},

	'entry.add': (s, p, ctx) => {
		const category = s.categories[p.categoryId];
		if (!category) return { code: 'category.notFound', categoryId: p.categoryId };
		if (s.entries[p.id]) return { code: 'entry.exists', entryId: p.id };
		const error =
			checkComposition(category.discipline, p.players) ??
			checkPlayersFree(s, category.id, p.players, null);
		if (error) return error;

		const group = defaultGroup(s, category.id);
		if (!group) return { code: 'group.notFound', groupId: `${category.id}/A` };
		s.entries[p.id] = { id: p.id, categoryId: category.id, players: p.players, status: 'active' };
		insertAt(group.entryIds, p.position ?? group.entryIds.length, p.id);

		if (group.scheduleSeed !== null) {
			// Опоздавший: до первого вызова — пересборка, после — его матчи в конец очереди
			if (groupStarted(s, group.id)) appendMatchesFor(s, group, p.id, ctx);
			else buildSchedule(s, group, group.scheduleSeed, ctx.commandId);
		}
		return undefined;
	},

	'entry.update': (s, p) => {
		const entry = s.entries[p.entryId];
		if (!entry) return { code: 'entry.notFound', entryId: p.entryId };
		const category = s.categories[entry.categoryId];
		if (!category) return { code: 'category.notFound', categoryId: entry.categoryId };
		const error =
			checkComposition(category.discipline, p.players) ??
			checkPlayersFree(s, category.id, p.players, entry.id);
		if (error) return error;
		entry.players = p.players;
		return undefined;
	},

	'entry.remove': (s, p, ctx) => {
		const entry = s.entries[p.entryId];
		if (!entry) return { code: 'entry.notFound', entryId: p.entryId };
		const matches = matchesOf(s, entry.id);
		if (matches.some((m) => m.status === 'on_court')) {
			return { code: 'entry.onCourt', entryId: entry.id };
		}
		if (matches.some((m) => m.status === 'finished')) {
			return { code: 'entry.hasResults', entryId: entry.id };
		}

		const group = groupOfEntry(s, entry.id);
		const started = group ? groupStarted(s, group.id) : false;
		delete s.entries[entry.id];
		for (const m of matches) removeMatch(s, m.id);
		if (!group) return undefined;

		removeItem(group.entryIds, entry.id);
		group.lots = group.lots.filter((lot) => !lot.includes(entry.id));
		if (group.scheduleSeed !== null && !started) {
			if (group.entryIds.length >= 2) buildSchedule(s, group, group.scheduleSeed, ctx.commandId);
			else clearSchedule(s, group);
		}
		return undefined;
	},

	'entry.withdraw': (s, p) => {
		if (s.progress !== 'running') return { code: 'event.notRunning' };
		const entry = s.entries[p.entryId];
		if (!entry) return { code: 'entry.notFound', entryId: p.entryId };
		if (entry.status === 'withdrawn') return { code: 'entry.withdrawn', entryId: entry.id };
		const matches = matchesOf(s, entry.id);
		if (matches.some((m) => m.status === 'on_court')) {
			return { code: 'entry.onCourt', entryId: entry.id };
		}
		for (const m of matches) {
			if (m.status !== 'pending') continue;
			removeItem(s.queue, m.id);
			m.status = 'finished';
			m.result = withdrawalWalkover(m.sideA === entry.id ? 'B' : 'A');
		}
		entry.status = 'withdrawn';
		return undefined;
	},

	'entry.reinstate': (s, p) => {
		const entry = s.entries[p.entryId];
		if (!entry) return { code: 'entry.notFound', entryId: p.entryId };
		if (entry.status !== 'withdrawn') return { code: 'entry.notWithdrawn', entryId: entry.id };

		const returned: Match[] = [];
		for (const m of matchesOf(s, entry.id)) {
			if (!m.result?.byWithdrawal) continue;
			const ownSide = m.sideA === entry.id ? 'A' : 'B';
			if (m.result.winner === ownSide) continue; // победа из-за снятия соперника — остаётся
			const opponent = s.entries[ownSide === 'A' ? m.sideB : m.sideA];
			if (opponent?.status === 'withdrawn') {
				// Соперник тоже снят — теперь неявка в нашу пользу
				m.result = withdrawalWalkover(ownSide);
			} else {
				resetToPending(m);
				returned.push(m);
			}
		}

		const positions = new Map((p.queue ?? []).map(({ matchId, index }) => [matchId, index]));
		const placed = returned
			.filter((m) => positions.has(m.id))
			.sort((a, b) => (positions.get(a.id) ?? 0) - (positions.get(b.id) ?? 0));
		for (const m of placed) insertAt(s.queue, positions.get(m.id) ?? s.queue.length, m.id);
		for (const m of returned.filter((x) => !positions.has(x.id)).sort(byNumber)) {
			s.queue.push(m.id);
		}
		entry.status = 'active';
		return undefined;
	},

	'group.generateSchedule': (s, p, ctx) => {
		const group = s.groups[p.groupId];
		if (!group) return { code: 'group.notFound', groupId: p.groupId };
		if (groupStarted(s, group.id)) return { code: 'group.started', groupId: group.id };
		if (group.entryIds.some((id) => s.entries[id]?.status === 'withdrawn')) {
			return { code: 'group.hasWithdrawn', groupId: group.id };
		}
		if (group.entryIds.length < 2) return { code: 'group.tooFewEntries', groupId: group.id };
		buildSchedule(s, group, p.seed, ctx.commandId);
		return undefined;
	},

	'group.clearSchedule': (s, p) => {
		const group = s.groups[p.groupId];
		if (!group) return { code: 'group.notFound', groupId: p.groupId };
		if (groupStarted(s, group.id)) return { code: 'group.started', groupId: group.id };
		clearSchedule(s, group);
		return undefined;
	},

	'group.resolveTie': (s, p) => {
		const group = s.groups[p.groupId];
		const stage = group && s.stages[group.stageId];
		if (!group || !stage) return { code: 'group.notFound', groupId: p.groupId };
		const otherLots = group.lots.filter((lot) => !sameSet(lot, p.order));
		const standings = computeStandings({
			entryIds: group.entryIds,
			withdrawn: new Set(group.entryIds.filter((id) => s.entries[id]?.status === 'withdrawn')),
			matches: groupMatches(s, group.id).map((m) => ({
				sideA: m.sideA,
				sideB: m.sideB,
				result: m.status === 'finished' ? m.result : null
			})),
			format: stage.format,
			lots: otherLots
		});
		if (!standings.complete) return { code: 'group.notComplete', groupId: group.id };
		const isTied =
			new Set(p.order).size === p.order.length &&
			standings.unresolved.some((block) => sameSet(block, p.order));
		if (!isTied) return { code: 'group.notTied', groupId: group.id };
		group.lots = [...otherLots, p.order];
		return undefined;
	},

	'group.clearTie': (s, p) => {
		const group = s.groups[p.groupId];
		if (!group) return { code: 'group.notFound', groupId: p.groupId };
		group.lots = group.lots.filter((lot) => !sameSet(lot, p.entryIds));
		return undefined;
	},

	'queue.move': (s, p) => {
		if (removeItem(s.queue, p.matchId) < 0) return { code: 'match.notPending', matchId: p.matchId };
		insertAt(s.queue, p.toIndex, p.matchId);
		return undefined;
	},

	'match.call': (s, p, ctx) => {
		if (s.progress !== 'running') return { code: 'event.notRunning' };
		const match = s.matches[p.matchId];
		if (!match) return { code: 'match.notFound', matchId: p.matchId };
		if (match.status !== 'pending') return { code: 'match.notPending', matchId: match.id };
		const error = checkCourtFree(s, p.court, match.id) ?? checkPlayersNotBusy(s, match);
		if (error) return error;
		removeItem(s.queue, match.id);
		match.status = 'on_court';
		match.court = p.court;
		match.calledAt = ctx.issuedAt;
		return undefined;
	},

	'match.uncall': (s, p) => {
		const match = s.matches[p.matchId];
		if (!match) return { code: 'match.notFound', matchId: p.matchId };
		if (match.status !== 'on_court') return { code: 'match.notOnCourt', matchId: match.id };
		resetToPending(match);
		insertAt(s.queue, 0, match.id);
		return undefined;
	},

	'match.moveCourt': (s, p) => {
		const match = s.matches[p.matchId];
		if (!match) return { code: 'match.notFound', matchId: p.matchId };
		if (match.status !== 'on_court') return { code: 'match.notOnCourt', matchId: match.id };
		const error = checkCourtFree(s, p.court, match.id);
		if (error) return error;
		match.court = p.court;
		return undefined;
	},

	'match.recordResult': (s, p, ctx) => {
		if (s.progress !== 'running') return { code: 'event.notRunning' };
		const match = s.matches[p.matchId];
		if (!match) return { code: 'match.notFound', matchId: p.matchId };
		const stage = s.stages[match.stageId];
		if (!stage) return { code: 'match.notFound', matchId: match.id };

		const issues = validateMatchResult(p.result, stage.format);
		if (issues.length > 0) return { code: 'score.invalid', matchId: match.id, issues };
		const result: MatchResult = { ...p.result, byWithdrawal: false };

		if (match.status === 'finished') {
			if (deepEqual(match.result, result)) return undefined; // такой результат уже записан
			if (!deepEqual(match.result, p.expectedResult)) {
				return { code: 'match.resultChanged', matchId: match.id };
			}
			match.result = result;
			return undefined;
		}
		if (p.expectedResult !== null) return { code: 'match.resultChanged', matchId: match.id };

		removeItem(s.queue, match.id);
		match.status = 'finished';
		match.result = result;
		match.finishedAt = ctx.issuedAt;
		if (result.kind !== 'walkover') {
			match.lineupA = entryPlayerIds(s, match.sideA);
			match.lineupB = entryPlayerIds(s, match.sideB);
		}
		return undefined;
	},

	'match.clearResult': (s, p) => {
		if (s.progress !== 'running') return { code: 'event.notRunning' };
		const match = s.matches[p.matchId];
		if (!match) return { code: 'match.notFound', matchId: p.matchId };
		if (match.status !== 'finished') return { code: 'match.notFinished', matchId: match.id };
		if (match.result?.byWithdrawal) return { code: 'match.byWithdrawal', matchId: match.id };
		if (!deepEqual(match.result, p.expectedResult)) {
			return { code: 'match.resultChanged', matchId: match.id };
		}
		resetToPending(match);
		insertAt(s.queue, 0, match.id);
		return undefined;
	},

	'match.restore': (s, p) => {
		if (s.progress !== 'running') return { code: 'event.notRunning' };
		const current = s.matches[p.match.id];
		if (!current) return { code: 'match.notFound', matchId: p.match.id };
		if (!deepEqual(current, p.expected)) return { code: 'match.stateChanged', matchId: current.id };
		if (p.match.status === 'on_court' && p.match.court !== null) {
			const error = checkCourtFree(s, p.match.court, current.id) ?? checkPlayersNotBusy(s, current);
			if (error) return error;
		}
		s.matches[current.id] = p.match;
		removeItem(s.queue, current.id);
		if (p.match.status === 'pending') {
			insertAt(s.queue, p.queueIndex ?? s.queue.length, current.id);
		}
		return undefined;
	}
};

// ——— Помощники ———

function checkComposition(
	discipline: Discipline,
	players: readonly EntryPlayer[]
): DomainError | undefined {
	const singles = discipline === 'MS' || discipline === 'WS' || discipline === 'OS';
	if (players.length !== (singles ? 1 : 2)) return { code: 'entry.composition', reason: 'count' };
	if (new Set(players.map((p) => p.playerId)).size !== players.length) {
		return { code: 'entry.composition', reason: 'duplicate' };
	}
	const genders = players.map((p) => p.gender);
	const genderOk =
		discipline === 'MS' || discipline === 'MD'
			? genders.every((g) => g === 'M')
			: discipline === 'WS' || discipline === 'WD'
				? genders.every((g) => g === 'F')
				: discipline === 'XD'
					? genders.includes('M') && genders.includes('F')
					: true;
	return genderOk ? undefined : { code: 'entry.composition', reason: 'gender' };
}

function checkPlayersFree(
	s: EventState,
	categoryId: string,
	players: readonly EntryPlayer[],
	exceptEntryId: string | null
): DomainError | undefined {
	for (const entry of Object.values(s.entries)) {
		if (entry.categoryId !== categoryId || entry.id === exceptEntryId) continue;
		const taken = entry.players.find((p) => players.some((x) => x.playerId === p.playerId));
		if (taken) return { code: 'entry.playerAlreadyInCategory', playerId: taken.playerId };
	}
	return undefined;
}

function checkCourtFree(s: EventState, court: number, matchId: string): DomainError | undefined {
	const c = s.courts[court - 1];
	if (!c) return { code: 'court.notFound', court };
	if (!c.enabled) return { code: 'court.disabled', court };
	const occupant = matchOnCourt(s, court);
	if (occupant && occupant.id !== matchId) return { code: 'court.busy', court };
	return undefined;
}

function checkPlayersNotBusy(s: EventState, match: Match): DomainError | undefined {
	const busy = busyPlayerIds(
		// Игроки самого матча не считаются занятыми им же
		{
			...s,
			matches: Object.fromEntries(Object.entries(s.matches).filter(([id]) => id !== match.id))
		}
	);
	const playerId = matchPlayerIds(s, match).find((id) => busy.has(id));
	return playerId ? { code: 'match.playerBusy', matchId: match.id, playerId } : undefined;
}

function matchesOf(s: EventState, entryId: string): Match[] {
	return Object.values(s.matches)
		.filter((m) => m.sideA === entryId || m.sideB === entryId)
		.sort(byNumber);
}

function groupMatches(s: EventState, groupId: string): Match[] {
	return Object.values(s.matches)
		.filter((m) => m.groupId === groupId)
		.sort(byNumber);
}

function groupStarted(s: EventState, groupId: string): boolean {
	return groupMatches(s, groupId).some((m) => m.status !== 'pending');
}

function defaultGroup(s: EventState, categoryId: string): Group | undefined {
	const stageIds = s.categories[categoryId]?.stageIds ?? [];
	const stageId = stageIds.find((id) => s.stages[id]?.kind === 'groups');
	return Object.values(s.groups).find((g) => g.stageId === stageId);
}

function groupOfEntry(s: EventState, entryId: string): Group | undefined {
	return Object.values(s.groups).find((g) => g.entryIds.includes(entryId));
}

function byNumber(a: Match, b: Match): number {
	return a.number - b.number;
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
	return a.length === b.length && a.every((id) => b.includes(id));
}

function removeMatch(s: EventState, matchId: string): void {
	delete s.matches[matchId];
	removeItem(s.queue, matchId);
}

// Наименьшие свободные номера матчей
function allocateNumbers(s: EventState, count: number): number[] {
	const used = new Set(Object.values(s.matches).map((m) => m.number));
	const numbers: number[] = [];
	for (let n = 1; numbers.length < count; n++) {
		if (!used.has(n)) numbers.push(n);
	}
	return numbers;
}

function newMatch(
	fields: Pick<Match, 'id' | 'number' | 'stageId' | 'groupId' | 'round' | 'sideA' | 'sideB'>
): Match {
	return {
		...fields,
		status: 'pending',
		court: null,
		calledAt: null,
		finishedAt: null,
		lineupA: null,
		lineupB: null,
		result: null
	};
}

function resetToPending(m: Match): void {
	m.status = 'pending';
	m.court = null;
	m.calledAt = null;
	m.finishedAt = null;
	m.lineupA = null;
	m.lineupB = null;
	m.result = null;
}

function withdrawalWalkover(winner: 'A' | 'B'): MatchResult {
	return { kind: 'walkover', winner, games: [], nonStandard: false, byWithdrawal: true };
}

// Расписание группы заново: посев по рейтингу с зерном, круговая система, матчи в конец очереди
function buildSchedule(s: EventState, group: Group, seed: number, commandId: string): void {
	for (const m of groupMatches(s, group.id)) removeMatch(s, m.id);
	const ratings = group.entryIds.map((id) => ({
		id,
		rating: entryRating(s.entries[id]?.players ?? [])
	}));
	group.entryIds = seedOrder(ratings, seed);
	group.scheduleSeed = seed;

	const pairs = roundRobin(group.entryIds).flatMap(({ round, pairs }) =>
		pairs.map((pair) => ({ round, pair }))
	);
	const numbers = allocateNumbers(s, pairs.length);
	pairs.forEach(({ round, pair }, k) => {
		const id = `${commandId}:${k + 1}`;
		s.matches[id] = newMatch({
			id,
			number: numbers[k] as number,
			stageId: group.stageId,
			groupId: group.id,
			round,
			sideA: pair[0],
			sideB: pair[1]
		});
		s.queue.push(id);
	});
}

function clearSchedule(s: EventState, group: Group): void {
	for (const m of groupMatches(s, group.id)) removeMatch(s, m.id);
	group.scheduleSeed = null;
}

// Матчи опоздавшего со всеми участниками группы — отдельным туром в конец очереди.
// Со снятым соперником матч сразу засчитывается неявкой в пользу опоздавшего.
function appendMatchesFor(s: EventState, group: Group, entryId: string, ctx: Ctx): void {
	const round = Math.max(0, ...groupMatches(s, group.id).map((m) => m.round)) + 1;
	const opponents = group.entryIds.filter((id) => id !== entryId);
	const numbers = allocateNumbers(s, opponents.length);
	opponents.forEach((opponentId, k) => {
		const id = `${ctx.commandId}:${k + 1}`;
		const match = newMatch({
			id,
			number: numbers[k] as number,
			stageId: group.stageId,
			groupId: group.id,
			round,
			sideA: opponentId,
			sideB: entryId
		});
		if (s.entries[opponentId]?.status === 'withdrawn') {
			match.status = 'finished';
			match.result = withdrawalWalkover('B');
		} else {
			s.queue.push(id);
		}
		s.matches[id] = match;
	});
}
