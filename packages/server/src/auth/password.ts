import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import type { ScryptParams } from '../config';

const KEY_LENGTH = 64;

function derive(password: string, salt: Buffer, { N, r, p }: ScryptParams): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		// maxmem с запасом: scrypt требует 128 · N · r байт
		scrypt(password, salt, KEY_LENGTH, { N, r, p, maxmem: 256 * N * r }, (error, key) =>
			error ? reject(error) : resolve(key)
		);
	});
}

// Формат: scrypt$N$r$p$соль$хеш (base64url). Параметры хранятся в хеше — их можно менять.
export async function hashPassword(password: string, params: ScryptParams): Promise<string> {
	const salt = randomBytes(16);
	const key = await derive(password, salt, params);
	return [
		'scrypt',
		params.N,
		params.r,
		params.p,
		salt.toString('base64url'),
		key.toString('base64url')
	].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
	const [algorithm, N, r, p, salt, hash] = stored.split('$');
	if (algorithm !== 'scrypt' || !salt || !hash) return false;
	const expected = Buffer.from(hash, 'base64url');
	const key = await derive(password, Buffer.from(salt, 'base64url'), {
		N: Number(N),
		r: Number(r),
		p: Number(p)
	});
	return key.length === expected.length && timingSafeEqual(key, expected);
}
