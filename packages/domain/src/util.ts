// structuredClone есть и в браузере, и в Node, но domain собирается без типов окружения
declare function structuredClone<T>(value: T): T;

export function clone<T>(value: T): T {
	return structuredClone(value);
}

// Структурное сравнение данных из JSON: порядок ключей не важен
export function deepEqual(a: unknown, b: unknown): boolean {
	if (a === b) return true;
	if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
	if (Array.isArray(a) !== Array.isArray(b)) return false;
	if (Array.isArray(a) && Array.isArray(b)) {
		return a.length === b.length && a.every((item, i) => deepEqual(item, b[i]));
	}
	const keysA = Object.keys(a);
	const keysB = Object.keys(b);
	if (keysA.length !== keysB.length) return false;
	const recordB = b as Record<string, unknown>;
	const recordA = a as Record<string, unknown>;
	return keysA.every((key) => key in recordB && deepEqual(recordA[key], recordB[key]));
}

// Вставка в массив по индексу с ограничением границами
export function insertAt<T>(items: T[], index: number, item: T): void {
	items.splice(Math.max(0, Math.min(index, items.length)), 0, item);
}

export function removeItem<T>(items: T[], item: T): number {
	const index = items.indexOf(item);
	if (index >= 0) items.splice(index, 1);
	return index;
}
