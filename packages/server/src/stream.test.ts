import { afterEach, describe, expect, it } from 'vitest';
import { createEventDraft, createTestApp, eventCommand } from './test-app';

let ctx: Awaited<ReturnType<typeof createTestApp>>;
let base = '';

afterEach(async () => {
	ctx.app.server.closeAllConnections();
	await ctx.app.close();
	ctx.close();
});

async function start() {
	ctx = await createTestApp();
	await ctx.app.listen({ port: 0, host: '127.0.0.1' });
	const address = ctx.app.server.address();
	base = typeof address === 'object' && address ? `http://127.0.0.1:${address.port}` : '';
}

async function send(cookie: string, commands: unknown[]) {
	await ctx.app.inject({
		method: 'POST',
		url: '/api/commands',
		headers: { cookie },
		payload: { commands }
	});
}

// Открыть поток и читать, пока в нём не появится нужное (или таймаут)
async function openStream(path: string, headers: Record<string, string> = {}) {
	const response = await fetch(`${base}${path}`, { headers });
	const reader = response.body!.getReader();
	const decoder = new TextDecoder();
	let text = '';
	return {
		status: response.status,
		async until(fragment: string, timeoutMs = 2000): Promise<string> {
			const deadline = Date.now() + timeoutMs;
			while (!text.includes(fragment)) {
				const left = deadline - Date.now();
				if (left <= 0) throw new Error(`не дождались «${fragment}», есть: ${text}`);
				const chunk = await Promise.race([
					reader.read(),
					new Promise<never>((_, reject) => setTimeout(() => reject(new Error('таймаут')), left))
				]);
				if (chunk.done) throw new Error(`поток закрыт, есть: ${text}`);
				text += decoder.decode(chunk.value, { stream: true });
			}
			return text;
		},
		close: () => reader.cancel()
	};
}

describe('SSE /api/events/:id/stream', () => {
	it('владелец получает применённые команды', async () => {
		await start();
		const anna = await ctx.userWithSession('anna');
		await send(anna.cookie, [eventCommand('ev1', createEventDraft(anna.id))]);

		const stream = await openStream('/api/events/ev1/stream', { cookie: anna.cookie });
		expect(stream.status).toBe(200);
		await stream.until('"mode":"owner"');

		await send(anna.cookie, [
			eventCommand('ev1', { type: 'event.update', payload: { title: 'Новое' } })
		]);
		const text = await stream.until('event: command');
		expect(text).toContain('id: 2');
		expect(text).toContain('"title":"Новое"');
		await stream.close();
	});

	it('гость опубликованного события получает только сигнал «изменилось»', async () => {
		await start();
		const anna = await ctx.userWithSession('anna');
		await send(anna.cookie, [
			eventCommand('ev1', createEventDraft(anna.id)),
			eventCommand('ev1', { type: 'event.setVisibility', payload: { visibility: 'published' } })
		]);

		const stream = await openStream('/api/events/ev1/stream');
		await stream.until('"mode":"guest"');
		await send(anna.cookie, [
			eventCommand('ev1', { type: 'event.update', payload: { title: 'Секретное название' } })
		]);
		const text = await stream.until('event: changed');
		expect(text).toContain('"version":3');
		expect(text).not.toContain('Секретное');
		await stream.close();
	});

	it('черновик гостю недоступен', async () => {
		await start();
		const anna = await ctx.userWithSession('anna');
		await send(anna.cookie, [eventCommand('ev1', createEventDraft(anna.id))]);
		const response = await fetch(`${base}/api/events/ev1/stream`);
		expect(response.status).toBe(404);
	});

	it('при переподключении приходят пропущенные команды', async () => {
		await start();
		const anna = await ctx.userWithSession('anna');
		await send(anna.cookie, [
			eventCommand('ev1', createEventDraft(anna.id)),
			eventCommand('ev1', { type: 'event.update', payload: { title: 'Два' } }),
			eventCommand('ev1', { type: 'event.update', payload: { title: 'Три' } })
		]);
		const stream = await openStream('/api/events/ev1/stream', {
			cookie: anna.cookie,
			'last-event-id': '1'
		});
		const text = await stream.until('id: 3');
		expect(text).toContain('id: 2');
		expect(text).not.toContain('id: 1\n');
		await stream.close();
	});
});
