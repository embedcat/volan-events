import { createRng, shuffle } from './prng';

// Рейтинг участника: игрок — его рейтинг, пара — сумма.
// Если рейтинга нет хотя бы у одного игрока, рейтинг участника неизвестен:
// сумма по одному игроку занизила бы силу пары.
export function entryRating(players: readonly { rating: number | null }[]): number | null {
	if (players.length === 0) return null;
	let sum = 0;
	for (const { rating } of players) {
		if (rating === null) return null;
		sum += rating;
	}
	return sum;
}

// Порядок посева: по убыванию рейтинга, участники без рейтинга — в конце.
// Порядок среди равных по рейтингу и среди участников без рейтинга — жребий по зерну.
export function seedOrder(
	entries: readonly { id: string; rating: number | null }[],
	seed: number
): string[] {
	// Перемешиваем заранее: устойчивая сортировка сохранит случайный порядок среди равных
	const shuffled = shuffle(entries, createRng(seed));
	const rated = shuffled
		.filter((e): e is { id: string; rating: number } => e.rating !== null)
		.sort((a, b) => b.rating - a.rating);
	const unrated = shuffled.filter((e) => e.rating === null);
	return [...rated, ...unrated].map((e) => e.id);
}
