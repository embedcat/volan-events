// UUIDv7: первые 48 бит — время в мс, ID новых записей упорядочены по времени создания
export function uuidv7(now = Date.now()): string {
	const bytes = new Uint8Array(16);
	crypto.getRandomValues(bytes);
	let time = now;
	for (let i = 5; i >= 0; i--) {
		bytes[i] = time % 256;
		time = Math.floor(time / 256);
	}
	bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x70; // версия 7
	bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80; // вариант RFC 9562
	const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// Зерно жеребьёвки для команды
export function randomSeed(): number {
	return crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
}
