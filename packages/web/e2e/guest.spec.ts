import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { createRunningEvent, login } from './helpers';

// Гость без входа: опубликованное событие в списке, просмотр без кнопок и настроек,
// обновление по SSE без перезагрузки страницы (D64, D142)
test('гость видит опубликованное событие и его изменения сразу', async ({ page, browser }) => {
	await login(page, 'org');
	const eventId = await createRunningEvent(page, {
		title: 'Сценарий: для гостей',
		players: ['Лидеров', 'Средних', 'Догоняев'],
		published: true
	});

	const guest = await browser.newPage();
	await guest.goto('/');
	await guest.getByRole('link', { name: /Сценарий: для гостей/ }).click();
	await expect(guest).toHaveURL(/\/courts$/);
	await expect(guest.locator('nav.tabs a')).toHaveText(['Корты', 'Таблица', 'Матчи', 'Участники']);
	await expect(guest.getByRole('button', { name: 'Вызвать', exact: true })).toHaveCount(0);
	await expect(guest.locator('header.event')).toContainText('обновлено в');

	// Организатор вводит результат — у гостя меняется таблица без перезагрузки
	await guest.getByRole('link', { name: 'Таблица' }).click();
	const leader = guest.locator('.grid tbody tr', { hasText: 'Лидеров Тест' });
	await expect(leader.locator('td.num').first()).toHaveText('0-0');

	const { state } = (await (await page.request.get(`/api/events/${eventId}`)).json()) as {
		state: {
			queue: string[];
			matches: Record<string, { id: string; sideA: string; sideB: string }>;
		};
	};
	// Первый матч очереди с участием лидера (e1): при трёх участниках кто-то отдыхает
	const match = state.queue
		.map((id) => state.matches[id])
		.find((m) => m?.sideA === 'e1' || m?.sideB === 'e1');
	const leaderSide = match?.sideA === 'e1' ? 'A' : 'B';
	const response = await page.request.post('/api/commands', {
		data: {
			commands: [
				{
					id: randomUUID(),
					type: 'match.recordResult',
					scope: 'event',
					eventId,
					payload: {
						matchId: match?.id,
						result: {
							kind: 'played',
							winner: leaderSide,
							games: [leaderSide === 'A' ? [21, 5] : [5, 21]],
							nonStandard: false
						},
						expectedResult: null
					},
					issuedAt: new Date().toISOString(),
					deviceId: 'e2e-organizer',
					schemaVersion: 1
				}
			]
		}
	});
	expect(response.ok()).toBeTruthy();
	await expect(leader.locator('td.num').first()).toHaveText('1-0');

	// Черновик чужим не виден
	await guest.goto('/');
	await expect(guest.getByText('Сценарий: для гостей')).toBeVisible();
	await guest.close();
});

test('черновик события гостю не виден', async ({ page, browser }) => {
	await login(page, 'org');
	const eventId = await createRunningEvent(page, {
		title: 'Сценарий: черновик',
		players: ['Тайнов', 'Скрытов']
	});
	const guest = await browser.newPage();
	await guest.goto(`/e/${eventId}/table`);
	await expect(guest.getByText('Событие не найдено или ещё не опубликовано.')).toBeVisible();
	await guest.close();
});
