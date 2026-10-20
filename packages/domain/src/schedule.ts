export type Round = {
	round: number; // с единицы
	pairs: [string, string][];
};

// Круговая система методом вращения: первый участник на месте, остальные сдвигаются по кругу.
// При таком порядке первый по посеву встречается со вторым в последнем туре, как рекомендует BWF.
// При нечётном числе участников добавляется пустое место: кто с ним в паре — отдыхает этот тур.
export function roundRobin(entryIds: readonly string[]): Round[] {
	if (entryIds.length < 2) return [];

	const slots: (string | null)[] = [...entryIds];
	if (slots.length % 2 === 1) slots.push(null);
	const size = slots.length;
	const rounds: Round[] = [];

	for (let r = 0; r < size - 1; r++) {
		const pairs: [string, string][] = [];
		for (let i = 0; i < size / 2; i++) {
			const a = slots[i];
			const b = slots[size - 1 - i];
			if (a && b) pairs.push([a, b]);
		}
		rounds.push({ round: r + 1, pairs });

		// Сдвиг всех, кроме первого, на одно место по кругу
		const last = slots.pop() ?? null;
		slots.splice(1, 0, last);
	}

	return rounds;
}
