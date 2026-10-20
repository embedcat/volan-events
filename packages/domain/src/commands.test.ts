import { describe, expect, it } from 'vitest';
import { applyCommand } from './apply';
import { parseEventCommand } from './commands';
import { eventStateSchema } from './state';
import { createEvent, envelope, eventWithEntries, resetIds } from './test-helpers';

describe('parseEventCommand', () => {
	it('команда, прошедшая через JSON, разбирается и применяется', () => {
		resetIds();
		const command = envelope({
			type: 'event.create',
			payload: {
				title: 'Турнир',
				date: '2026-10-26',
				venue: null,
				courts: 4,
				defaultFormat: { points: 21, bestOf: 3, deciderPoints: 15 },
				ownerId: 'u1'
			}
		});
		const parsed = parseEventCommand(JSON.parse(JSON.stringify(command)));
		expect(parsed.ok).toBe(true);
		if (parsed.ok) expect(applyCommand(null, parsed.command).ok).toBe(true);
	});

	it('неизвестный тип и неверные данные отклоняются', () => {
		resetIds();
		const good = envelope({ type: 'match.call', payload: { matchId: 'm', court: 1 } });
		expect(parseEventCommand({ ...good, type: 'match.teleport' }).ok).toBe(false);
		expect(parseEventCommand({ ...good, payload: { matchId: 'm', court: 0 } }).ok).toBe(false);
		expect(parseEventCommand({ ...good, issuedAt: 'вчера' }).ok).toBe(false);
		expect(parseEventCommand({ ...good, payload: { matchId: 'm', court: 1, extra: 1 } }).ok).toBe(
			true
		);
	});

	it('пустые команды не принимают лишних полей', () => {
		resetIds();
		const start = envelope({ type: 'event.start', payload: {} });
		expect(parseEventCommand(start).ok).toBe(true);
		expect(parseEventCommand({ ...start, payload: { force: true } }).ok).toBe(false);
	});
});

describe('eventStateSchema', () => {
	it('снимок состояния проходит проверку схемой', () => {
		resetIds();
		expect(eventStateSchema.safeParse(createEvent()).success).toBe(true);
		expect(eventStateSchema.safeParse(eventWithEntries(3)).success).toBe(true);
	});
});
