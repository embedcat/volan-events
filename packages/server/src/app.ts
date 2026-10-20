import cookie from '@fastify/cookie';
import { STATE_VERSION } from '@volan/domain';
import Fastify, { type FastifyInstance } from 'fastify';
import { resolveSession, type AuthUser } from './auth/sessions';
import type { Config } from './config';
import type { Db } from './db';
import { HttpError } from './http';
import type { EventHub } from './hub';
import { SESSION_COOKIE, authRoutes, setSessionCookie } from './routes/auth';
import { commandRoutes } from './routes/commands';
import { eventRoutes } from './routes/events';
import { userRoutes } from './routes/users';

declare module 'fastify' {
	interface FastifyRequest {
		user: AuthUser | null;
	}
}

export type AppDeps = { db: Db; hub: EventHub; config: Config };

export type AppOptions = {
	logger?: boolean;
};

export function buildApp(deps: AppDeps, options: AppOptions = {}): FastifyInstance {
	const app = Fastify({ logger: options.logger ?? false, trustProxy: true });

	// Изменяющие запросы принимаем только с JSON: форма с другого сайта не может прислать JSON
	// без предварительного запроса CORS — это защита от подделки запросов вместе с SameSite=Lax
	app.removeContentTypeParser('text/plain');
	app.register(cookie);

	app.decorateRequest('user', null);
	app.addHook('onRequest', async (request, reply) => {
		const token = request.cookies[SESSION_COOKIE];
		if (!token) return;
		const session = resolveSession(deps.db, token, deps.config.sessionTtlDays);
		if (!session) return;
		request.user = session.user;
		if (session.renewed) setSessionCookie(reply, token, deps);
	});

	app.setErrorHandler((error, request, reply) => {
		if (error instanceof HttpError) {
			reply.status(error.status).send({ error: { code: error.code, ...error.details } });
			return;
		}
		const { statusCode, message } = error as { statusCode?: number; message?: string };
		const status = statusCode ?? 500;
		if (status >= 500) request.log.error(error);
		reply.status(status).send({
			error: { code: status >= 500 ? 'server.error' : 'request.invalid', message }
		});
	});

	// stateVersion нужен клиенту, чтобы понять, совместима ли его версия приложения с сервером
	app.get('/api/health', async () => ({ status: 'ok', stateVersion: STATE_VERSION }));

	app.register(async (scope) => {
		authRoutes(scope, deps);
		userRoutes(scope, deps);
		commandRoutes(scope, deps);
		eventRoutes(scope, deps);
	});

	return app;
}
