export type ScryptParams = { N: number; r: number; p: number };

export type Config = {
	databasePath: string;
	cookieSecure: boolean;
	sessionTtlDays: number;
	scrypt: ScryptParams;
};

// Параметры scrypt по рекомендации OWASP: N = 2^17, r = 8, p = 1 (≈128 МБ памяти на хеш)
export const DEFAULT_SCRYPT: ScryptParams = { N: 2 ** 17, r: 8, p: 1 };

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
	const production = env.NODE_ENV === 'production';
	return {
		databasePath: env.DATABASE_PATH ?? './data/volan.sqlite',
		// Secure-cookie требует HTTPS; в разработке сервер работает по HTTP
		cookieSecure: env.COOKIE_SECURE ? env.COOKIE_SECURE === 'true' : production,
		sessionTtlDays: Number(env.SESSION_TTL_DAYS ?? 30),
		scrypt: DEFAULT_SCRYPT
	};
}
