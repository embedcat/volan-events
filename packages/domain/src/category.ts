export type Discipline = 'MS' | 'WS' | 'MD' | 'WD' | 'XD' | 'OS' | 'OD';

// Код категории = разряд + уровень: MSB, WDE, XDB+C; без уровня — просто разряд
export function categoryCode(discipline: Discipline, level: string | null): string {
	return discipline + (level ?? '');
}
