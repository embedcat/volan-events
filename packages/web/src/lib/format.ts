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
