import { describe, expect, it } from 'vitest';
import { MATCHES, formatLabel, plural } from './format.js';

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
