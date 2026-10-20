import { type EventCommand, type EventState, STATE_VERSION } from '@volan/domain';
import { describe, expect, it } from 'vitest';
import { buildExport, eventPlayerIds, exportFileName } from './event-export.js';

const state = {
	entries: {
		e1: { players: [{ playerId: 'p1' }, { playerId: 'p2' }] },
		e2: { players: [{ playerId: 'p3' }] }
	},
	matches: {
		// p9 играл за пару e1 до замены партнёра
		m1: { lineupA: ['p1', 'p9'], lineupB: ['p3'] },
		m2: { lineupA: null, lineupB: null }
	}
} as unknown as EventState;

describe('выгрузка события', () => {
	it('игроки — из заявок и фактических составов', () => {
		expect(eventPlayerIds(state).sort()).toEqual(['p1', 'p2', 'p3', 'p9']);
	});

	it('без закрытых полей игроков, журнал по порядку', () => {
		const player = {
			id: 'p1',
			lastName: 'Иванов',
			firstName: 'Иван',
			gender: 'M' as const,
			club: null,
			rating: 500,
			mergedIntoId: null,
			createdBy: 'u1',
			contact: '+7 900 000-00-00',
			birthYear: 1990
		};
		const command = (seq: number) => ({ seq, command: { id: `c${seq}` } as EventCommand });
		const file = buildExport({
			state,
			version: 2,
			players: [player],
			commands: [command(2), command(1)],
			exportedAt: '2026-10-26T12:00:00.000Z'
		});
		expect(file).toMatchObject({
			format: 'volan-event',
			formatVersion: 1,
			stateVersion: STATE_VERSION,
			version: 2
		});
		expect(file.players[0]).not.toHaveProperty('contact');
		expect(file.players[0]).not.toHaveProperty('birthYear');
		expect(file.commands.map((c) => c.seq)).toEqual([1, 2]);
	});

	it('имя файла без символов, недопустимых в именах файлов', () => {
		expect(exportFileName({ date: '2026-10-26', title: 'Кубок «Волан»: финал / осень' })).toBe(
			'2026-10-26 Кубок Волан финал осень.json'
		);
	});
});
