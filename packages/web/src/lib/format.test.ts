import { describe, expect, it } from 'vitest';
import {
	MATCHES,
	formatDateTime,
	formatLabel,
	formatMinutes,
	formatTime,
	minutesSince,
	plural
} from './format.js';

describe('plural', () => {
	it.each([
		[1, '1 матч'],
		[2, '2 матча'],
		[4, '4 матча'],
		[5, '5 матчей'],
		[11, '11 матчей'],
		[12, '12 матчей'],
		[21, '21 матч'],
		[22, '22 матча'],
		[111, '111 матчей']
	])('%i', (n, text) => {
		expect(plural(n, MATCHES)).toBe(text);
	});
});

describe('formatLabel', () => {
	it('подписи формата', () => {
		expect(formatLabel({ points: 21, bestOf: 1, deciderPoints: 21 })).toBe('1 партия до 21');
		expect(formatLabel({ points: 21, bestOf: 3, deciderPoints: 15 })).toBe(
			'до 2 побед, до 21, решающая до 15'
		);
	});
});

describe('время', () => {
	it('минуты с момента', () => {
		const start = '2026-10-26T10:00:30.000Z';
		expect(minutesSince(start, Date.parse('2026-10-26T10:14:29.000Z'))).toBe(13);
		expect(minutesSince(start, Date.parse('2026-10-26T10:14:30.000Z'))).toBe(14);
		// часы другого устройства могут спешить
		expect(minutesSince(start, Date.parse('2026-10-26T09:59:00.000Z'))).toBe(0);
	});

	it('подписи минут и времени', () => {
		expect(formatMinutes(14)).toBe('14 мин');
		expect(formatMinutes(65)).toBe('1 ч 05 мин');
		expect(formatTime(new Date(2026, 9, 26, 9, 5).toISOString())).toBe('09:05');
		expect(formatDateTime(new Date(2026, 9, 6, 14, 32).toISOString())).toBe('06.10.2026 14:32');
	});
});
