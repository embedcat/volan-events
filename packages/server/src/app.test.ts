import { describe, expect, it } from 'vitest';
import { STATE_VERSION } from '@volan/domain';
import { buildApp } from './app';

describe('GET /api/health', () => {
	it('отвечает ok и версией формы состояния', async () => {
		const app = buildApp();
		const response = await app.inject({ method: 'GET', url: '/api/health' });

		expect(response.statusCode).toBe(200);
		expect(response.json()).toEqual({ status: 'ok', stateVersion: STATE_VERSION });
	});
});
