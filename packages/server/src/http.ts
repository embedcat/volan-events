import type { Actor } from '@volan/domain';
import type { FastifyRequest } from 'fastify';
import type { z } from 'zod';
import type { AuthUser } from './auth/sessions';

// Ошибка с HTTP-статусом и кодом; ответ: { error: { code, ...details } }
export class HttpError extends Error {
	constructor(
		readonly status: number,
		readonly code: string,
		readonly details: Record<string, unknown> = {}
	) {
		super(code);
	}
}

export function requireUser(request: FastifyRequest): AuthUser {
	if (!request.user) throw new HttpError(401, 'auth.required');
	return request.user;
}

export function requireSuperuser(request: FastifyRequest): AuthUser {
	const user = requireUser(request);
	if (user.role !== 'superuser') throw new HttpError(403, 'auth.forbidden');
	return user;
}

export function actorOf(user: AuthUser): Actor {
	return { userId: user.id, role: user.role };
}

export function parseWith<T>(schema: z.ZodType<T>, value: unknown): T {
	const parsed = schema.safeParse(value);
	if (!parsed.success) throw new HttpError(400, 'request.invalid', { issues: parsed.error.issues });
	return parsed.data;
}
