const MONTHS = [
	'января',
	'февраля',
	'марта',
	'апреля',
	'мая',
	'июня',
	'июля',
	'августа',
	'сентября',
	'октября',
	'ноября',
	'декабря'
];

// 2026-10-26 → «26 октября 2026»
export function formatDate(iso: string): string {
	const [year, month, day] = iso.split('-').map(Number);
	return `${day} ${MONTHS[(month ?? 1) - 1]} ${year}`;
}

// Сегодня по часам устройства в формате YYYY-MM-DD
export function todayIso(now = new Date()): string {
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export const PROGRESS_LABEL = {
	setup: 'Подготовка',
	running: 'Идёт',
	finished: 'Завершено'
} as const;

export const VISIBILITY_LABEL = {
	draft: 'Черновик',
	published: 'Опубликовано'
} as const;

// «1 партия до 21» / «до 2 побед, до 21, решающая до 15»
export function formatLabel(format: {
	points: number;
	bestOf: number;
	deciderPoints: number;
}): string {
	if (format.bestOf === 1) return `1 партия до ${format.points}`;
	const decider =
		format.deciderPoints !== format.points ? `, решающая до ${format.deciderPoints}` : '';
	return `до 2 побед, до ${format.points}${decider}`;
}

// Склонение по числу: plural(3, ['матч', 'матча', 'матчей']) → «3 матча»
export function plural(n: number, [one, few, many]: [string, string, string]): string {
	const mod10 = n % 10;
	const mod100 = n % 100;
	const word =
		mod10 === 1 && mod100 !== 11
			? one
			: mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
				? few
				: many;
	return `${n} ${word}`;
}

export const MATCHES: [string, string, string] = ['матч', 'матча', 'матчей'];
export const ROUNDS: [string, string, string] = ['тур', 'тура', 'туров'];
