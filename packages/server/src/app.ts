import Fastify, { type FastifyInstance } from 'fastify';
import { STATE_VERSION } from '@volan/domain';

export type AppOptions = {
	logger?: boolean;
};

export function buildApp(options: AppOptions = {}): FastifyInstance {
	const app = Fastify({ logger: options.logger ?? false });

	// stateVersion нужен клиенту, чтобы понять, совместима ли его версия приложения с сервером
	app.get('/api/health', async () => ({ status: 'ok', stateVersion: STATE_VERSION }));

	return app;
}
