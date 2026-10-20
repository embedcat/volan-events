import { describe, expect, it } from 'vitest';
import { categoryCode } from './category';

describe('categoryCode', () => {
	it('склеивает разряд и уровень', () => {
		expect(categoryCode('MS', 'B')).toBe('MSB');
		expect(categoryCode('XD', 'B+C')).toBe('XDB+C');
	});

	it('без уровня — только разряд', () => {
		expect(categoryCode('OS', null)).toBe('OS');
	});
});
