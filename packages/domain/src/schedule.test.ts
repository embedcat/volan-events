import { describe, expect, it } from 'vitest';
import { createRng, shuffle } from './prng';
import { entryRating, seedOrder } from './seeding';
import { roundRobin } from './schedule';

function ids(n: number): string[] {
	return Array.from({ length: n }, (_, i) => `e${i + 1}`);
}

describe('createRng / shuffle', () => {
	it('одно и то же зерно — одна и та же последовательность', () => {
		const a = createRng(42);
		const b = createRng(42);
		const seqA = [a(), a(), a()];
		expect([b(), b(), b()]).toEqual(seqA);
		for (const x of seqA) {
			expect(x).toBeGreaterThanOrEqual(0);
			expect(x).toBeLessThan(1);
		}
	});

	it('перемешивание детерминировано и не теряет элементов', () => {
		const items = ids(10);
		const once = shuffle(items, createRng(7));
		expect(shuffle(items, createRng(7))).toEqual(once);
		expect([...once].sort()).toEqual([...items].sort());
		expect(items).toEqual(ids(10));
	});
});

describe('entryRating', () => {
	it('одиночка — рейтинг игрока', () => {
		expect(entryRating([{ rating: 420 }])).toBe(420);
	});

	it('пара — сумма', () => {
		expect(entryRating([{ rating: 420 }, { rating: 380 }])).toBe(800);
	});

	it('если у кого-то рейтинга нет — рейтинг участника неизвестен', () => {
		expect(entryRating([{ rating: 420 }, { rating: null }])).toBeNull();
		expect(entryRating([{ rating: null }])).toBeNull();
	});
});

describe('seedOrder', () => {
	it('по убыванию рейтинга', () => {
		const entries = [
			{ id: 'a', rating: 300 },
			{ id: 'b', rating: 500 },
			{ id: 'c', rating: 400 }
		];
		expect(seedOrder(entries, 1)).toEqual(['b', 'c', 'a']);
	});

	it('без рейтинга — в конце', () => {
		const entries = [
			{ id: 'x', rating: null },
			{ id: 'a', rating: 300 },
			{ id: 'y', rating: null },
			{ id: 'b', rating: 500 }
		];
		const order = seedOrder(entries, 1);
		expect(order.slice(0, 2)).toEqual(['b', 'a']);
		expect([...order.slice(2)].sort()).toEqual(['x', 'y']);
	});

	it('порядок среди равных и без рейтинга задаёт зерно', () => {
		const entries = ids(8).map((id) => ({ id, rating: null }));
		const orders = new Set([1, 2, 3, 4, 5].map((seed) => seedOrder(entries, seed).join()));
		expect(seedOrder(entries, 3)).toEqual(seedOrder(entries, 3));
		expect(orders.size).toBeGreaterThan(1);
	});
});

describe('roundRobin', () => {
	it('4 участника — порядок как рекомендует BWF, 1–2 в последнем туре', () => {
		expect(roundRobin(ids(4))).toEqual([
			{
				round: 1,
				pairs: [
					['e1', 'e4'],
					['e2', 'e3']
				]
			},
			{
				round: 2,
				pairs: [
					['e1', 'e3'],
					['e4', 'e2']
				]
			},
			{
				round: 3,
				pairs: [
					['e1', 'e2'],
					['e3', 'e4']
				]
			}
		]);
	});

	it('меньше двух участников — расписания нет', () => {
		expect(roundRobin([])).toEqual([]);
		expect(roundRobin(['e1'])).toEqual([]);
	});

	it.each([2, 3, 4, 5, 6, 7, 8, 9, 10, 11])(
		'%i участников: каждый с каждым ровно один раз',
		(n) => {
			const rounds = roundRobin(ids(n));
			const met = new Map<string, number>();

			expect(rounds).toHaveLength(n % 2 === 0 ? n - 1 : n);
			for (const { pairs } of rounds) {
				expect(pairs).toHaveLength(Math.floor(n / 2));
				const inRound = pairs.flat();
				expect(new Set(inRound).size).toBe(inRound.length);
				for (const [a, b] of pairs) {
					const key = [a, b].sort().join('-');
					met.set(key, (met.get(key) ?? 0) + 1);
				}
			}
			expect(met.size).toBe((n * (n - 1)) / 2);
			expect([...met.values()].every((count) => count === 1)).toBe(true);
		}
	);

	it.each([3, 5, 7, 9])('%i участников: каждый отдыхает ровно один тур', (n) => {
		const rounds = roundRobin(ids(n));
		for (const id of ids(n)) {
			const resting = rounds.filter(({ pairs }) => !pairs.flat().includes(id));
			expect(resting).toHaveLength(1);
		}
	});

	it.each([2, 3, 4, 5, 6, 7, 8, 9, 10])(
		'%i участников: первый и второй — в последнем туре',
		(n) => {
			const rounds = roundRobin(ids(n));
			const last = rounds[rounds.length - 1];
			expect(last?.pairs.some((pair) => pair.includes('e1') && pair.includes('e2'))).toBe(true);
		}
	);
});
