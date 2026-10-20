import {
	applyCommand,
	type EventCommand,
	type EventCommandDraft,
	type EventState
} from '@volan/domain';
import { describe, expect, it } from 'vitest';
import { applyRemote, rebase } from './event-sync.js';

let n = 0;
function cmd(draft: EventCommandDraft): EventCommand {
	n += 1;
	return {
		...draft,
		id: `c${n}`,
		scope: 'event',
		eventId: 'ev',
		issuedAt: '2026-10-26T10:00:00.000Z',
		deviceId: 'dev',
		schemaVersion: 1
	} as EventCommand;
}

const create = cmd({
	type: 'event.create',
	payload: {
		title: 'Турнир',
		date: '2026-10-26',
		venue: null,
		courts: 2,
		defaultFormat: { points: 21, bestOf: 1, deciderPoints: 21 },
		ownerId: 'u'
	}
});

function base(): EventState {
	const result = applyCommand(null, create);
	if (!result.ok) throw new Error('create');
	return result.state;
}

describe('rebase', () => {
	it('применяет свои команды поверх подтверждённого состояния', () => {
		const view = rebase(base(), [
			cmd({ type: 'event.update', payload: { title: 'Новое' } }),
			cmd({ type: 'event.setVisibility', payload: { visibility: 'published' } })
		]);
		expect(view).toMatchObject({ title: 'Новое', visibility: 'published' });
	});

	it('неприменимую команду пропускает, остальные применяет', () => {
		const view = rebase(base(), [
			cmd({ type: 'event.start', payload: {} }), // нет расписания
			cmd({ type: 'event.update', payload: { title: 'Новое' } })
		]);
		expect(view).toMatchObject({ title: 'Новое', progress: 'setup' });
	});

	it('без подтверждённого состояния — создание события из своей очереди', () => {
		expect(rebase(null, [create])?.title).toBe('Турнир');
	});
});

describe('applyRemote', () => {
	const update = cmd({ type: 'event.update', payload: { title: 'С сервера' } });

	it('следующий номер — применяется', () => {
		const step = applyRemote(base(), 1, 2, update);
		expect(step).toMatchObject({ kind: 'apply', version: 2, state: { title: 'С сервера' } });
	});

	it('уже применённый номер — пропуск', () => {
		expect(applyRemote(base(), 2, 2, update)).toEqual({ kind: 'skip' });
	});

	it('пропуск в номерах — перечитать', () => {
		expect(applyRemote(base(), 1, 3, update)).toEqual({ kind: 'reload' });
	});

	it('команда не применилась — перечитать', () => {
		expect(applyRemote(base(), 1, 2, cmd({ type: 'event.start', payload: {} }))).toEqual({
			kind: 'reload'
		});
	});
});
