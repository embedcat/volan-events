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

// Сколько полных минут прошло с момента iso до now (мс)
export function minutesSince(iso: string, now: number): number {
	return Math.max(0, Math.floor((now - Date.parse(iso)) / 60_000));
}

// «14 мин», «1 ч 05 мин»
export function formatMinutes(minutes: number): string {
	if (minutes < 60) return `${minutes} мин`;
	return `${Math.floor(minutes / 60)} ч ${String(minutes % 60).padStart(2, '0')} мин`;
}

// «12:05» по часам устройства
export function formatTime(iso: string): string {
	const date = new Date(iso);
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// «20.10.2026 14:32» по часам устройства
export function formatDateTime(iso: string): string {
	const date = new Date(iso);
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${formatTime(iso)}`;
}

// Сейчас по часам устройства, ISO
export function nowIso(): string {
	return new Date().toISOString();
}
