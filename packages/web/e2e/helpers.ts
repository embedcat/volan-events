import { randomUUID } from 'node:crypto';
import { type APIRequestContext, type Page, expect } from '@playwright/test';

// Общее для сценариев: вход через интерфейс и быстрая подготовка событий командами API

export const PASSWORD = process.env.E2E_PASSWORD ?? 'e2e-password';

export async function login(page: Page, name: string, password = PASSWORD): Promise<void> {
	await page.goto('/login');
	await page.getByLabel('Логин').fill(name);
	await page.getByLabel('Пароль').fill(password);
	await page.getByRole('button', { name: 'Войти' }).click();
	await expect(page).toHaveURL(/\/my$/);
}

type Draft = { type: string; payload: Record<string, unknown> };

function envelope(eventId: string, draft: Draft) {
	return {
		...draft,
		id: randomUUID(),
		scope: 'event',
		eventId,
		issuedAt: new Date().toISOString(),
		deviceId: 'e2e-setup',
		schemaVersion: 1
	};
}

async function send(request: APIRequestContext, commands: unknown[]): Promise<void> {
	const response = await request.post('/api/commands', { data: { commands } });
	expect(response.ok()).toBeTruthy();
	const { results } = (await response.json()) as { results: { status: string }[] };
	expect(results.map((r) => r.status)).toEqual(commands.map(() => 'applied'));
}

export type EventSetup = {
	title: string;
	players: string[]; // фамилии по силе: первая — сильнейшая
	courts?: number;
	published?: boolean;
};

// Идущий турнир: категория MS, одиночки с рейтингом по силе, расписание, старт.
// Запросы — от имени того, кто вошёл в контексте страницы (page.request делит с ней cookie).
export async function createRunningEvent(page: Page, setup: EventSetup): Promise<string> {
	const request = page.request;
	const me = (await (await request.get('/api/auth/me')).json()) as { user: { id: string } };
	const eventId = randomUUID();
	const players = setup.players.map((lastName, i) => ({
		id: randomUUID(),
		lastName,
		firstName: 'Тест',
		gender: 'M',
		club: null,
		rating: 900 - i * 100,
		birthYear: null,
		contact: null,
		externalId: null,
		createdBy: me.user.id
	}));
	const draft = (type: string, payload: Record<string, unknown>) =>
		envelope(eventId, { type, payload });
	await send(request, [
		draft('event.create', {
			title: setup.title,
			date: new Date().toISOString().slice(0, 10),
			venue: null,
			courts: setup.courts ?? 2,
			defaultFormat: { points: 21, bestOf: 1, deciderPoints: 21 },
			ownerId: me.user.id
		}),
		...(setup.published ? [draft('event.setVisibility', { visibility: 'published' })] : []),
		draft('category.create', {
			id: 'ms',
			discipline: 'MS',
			level: null,
			customName: null,
			ratingMin: null,
			ratingMax: null
		}),
		...players.map((p) => ({
			id: randomUUID(),
			type: 'player.create',
			scope: 'registry',
			payload: p,
			issuedAt: new Date().toISOString(),
			deviceId: 'e2e-setup',
			schemaVersion: 1
		})),
		...players.map((p, i) =>
			draft('entry.add', {
				id: `e${i + 1}`,
				categoryId: 'ms',
				players: [{ playerId: p.id, gender: 'M', rating: p.rating, club: null }]
			})
		),
		draft('group.generateSchedule', { groupId: 'ms/A', seed: 1 }),
		draft('event.start', {})
	]);
	return eventId;
}

type ServerMatch = {
	number: number;
	status: string;
	result: { games: [number, number][] } | null;
};

export async function serverMatch(page: Page, eventId: string, number: number) {
	const { state } = (await (await page.request.get(`/api/events/${eventId}`)).json()) as {
		state: { matches: Record<string, ServerMatch> };
	};
	return Object.values(state.matches).find((m) => m.number === number);
}

// Окно результата: победа сильнейшего 21:10 (по порядку фамилий в списке силы)
export async function enterWinByStronger(page: Page, strength: string[]): Promise<void> {
	const dialog = page.locator('dialog.result');
	await expect(dialog).toBeVisible();
	const [nameA = '', nameB = ''] = await dialog.locator('.scores .name').allInnerTexts();
	const rank = (name: string) => strength.findIndex((s) => name.startsWith(s));
	const aWins = rank(nameA) < rank(nameB);
	const inputs = dialog.locator('input.score');
	await inputs.nth(0).fill(aWins ? '21' : '10');
	await inputs.nth(1).fill(aWins ? '10' : '21');
	await dialog.getByRole('button', { name: 'Сохранить', exact: true }).click();
	await expect(dialog).toBeHidden();
}

// Service worker взял страницу под управление: дальше она откроется и без сети
export async function waitForServiceWorker(page: Page): Promise<void> {
	await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15_000 });
}
