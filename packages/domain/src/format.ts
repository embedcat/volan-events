export type GamePoints = 21 | 15;

export type MatchFormat = {
	points: GamePoints;
	bestOf: 1 | 3;
	// Очки решающей (третьей) партии при bestOf = 3
	deciderPoints: GamePoints;
};

// Предел партии: при счёте (предел − 1):(предел − 1) побеждает следующее очко
export function gameCap(points: GamePoints): number {
	return points === 21 ? 30 : 21;
}

// Очки партии с номером index (с нуля)
export function gamePointsAt(format: MatchFormat, index: number): GamePoints {
	return format.bestOf === 3 && index === 2 ? format.deciderPoints : format.points;
}

export function gamesToWin(format: MatchFormat): number {
	return format.bestOf === 3 ? 2 : 1;
}
