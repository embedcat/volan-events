import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import type { Db } from '../db';
import { sessions, users } from '../db/schema';

export type AuthUser = {
	id: string;
	login: string;
	displayName: string;
	role: 'superuser' | 'organizer';
	sessionId: string;
};

const DAY = 24 * 60 * 60 * 1000;
// Продлевать сессию не чаще раза в час — чтобы не писать в базу на каждый запрос
const TOUCH_INTERVAL = 60 * 60 * 1000;

export function hashToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

export function createSession(
	db: Db,
	userId: string,
	device: { id: string; label: string },
	ttlDays: number,
	now = new Date()
): string {
	const token = randomBytes(32).toString('base64url');
	db.insert(sessions)
		.values({
			id: hashToken(token),
			userId,
			deviceId: device.id,
			deviceLabel: device.label,
			createdAt: now,
			lastSeenAt: now,
			expiresAt: new Date(now.getTime() + ttlDays * DAY)
		})
		.run();
	return token;
}

// Пользователь по токену из cookie. Сессия продлевается на ttlDays от последнего обращения.
// renewed = true — сессию продлили, cookie надо выставить заново.
export function resolveSession(
	db: Db,
	token: string,
	ttlDays: number,
	now = new Date()
): { user: AuthUser; renewed: boolean } | null {
	const id = hashToken(token);
	const row = db
		.select({ session: sessions, user: users })
		.from(sessions)
		.innerJoin(users, eq(users.id, sessions.userId))
		.where(and(eq(sessions.id, id), isNull(sessions.revokedAt), gt(sessions.expiresAt, now)))
		.get();
	if (!row || !row.user.isActive) return null;

	let renewed = false;
	if (now.getTime() - row.session.lastSeenAt.getTime() > TOUCH_INTERVAL) {
		db.update(sessions)
			.set({ lastSeenAt: now, expiresAt: new Date(now.getTime() + ttlDays * DAY) })
			.where(eq(sessions.id, id))
			.run();
		renewed = true;
	}
	const { user } = row;
	return {
		user: {
			id: user.id,
			login: user.login,
			displayName: user.displayName,
			role: user.role,
			sessionId: id
		},
		renewed
	};
}

export function revokeSession(db: Db, sessionId: string, now = new Date()): void {
	db.update(sessions).set({ revokedAt: now }).where(eq(sessions.id, sessionId)).run();
}

export function revokeUserSessions(db: Db, userId: string, now = new Date()): void {
	db.update(sessions)
		.set({ revokedAt: now })
		.where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)))
		.run();
}

// Короткая подпись устройства для списка сессий: «Chrome, Android»
export function deviceLabel(userAgent: string | undefined): string {
	const ua = userAgent ?? '';
	const browser = /Edg\//.test(ua)
		? 'Edge'
		: /Firefox\//.test(ua)
			? 'Firefox'
			: /Chrome\//.test(ua)
				? 'Chrome'
				: /Safari\//.test(ua)
					? 'Safari'
					: 'Браузер';
	const os = /Android/.test(ua)
		? 'Android'
		: /iPhone|iPad|iPod/.test(ua)
			? 'iOS'
			: /Windows/.test(ua)
				? 'Windows'
				: /Mac OS X/.test(ua)
					? 'macOS'
					: /Linux/.test(ua)
						? 'Linux'
						: '';
	return os ? `${browser}, ${os}` : browser;
}
