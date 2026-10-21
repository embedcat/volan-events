import { expect, test } from '@playwright/test';
import {
	createRunningEvent,
	enterWinByStronger,
	login,
	serverMatch,
	waitForServiceWorker
} from './helpers';

// Критерий 3 MVP: посреди турнира пропадает интернет, организатор продолжает на телефоне
// и вводит результаты; при появлении связи всё уходит на сервер, гости видят таблицу
const STRENGTH = ['Альфин', 'Бетов', 'Гаммин', 'Дельтов'];

test('без сети на телефоне: результаты сохраняются и уходят при появлении связи', async ({
	page,
	context,
	browser
}) => {
	await login(page, 'org');
	const eventId = await createRunningEvent(page, {
		title: 'Сценарий: без сети',
		players: STRENGTH,
		published: true
	});
	await page.goto(`/e/${eventId}/courts`);
	await waitForServiceWorker(page);
	const courts = page.locator('.court');
	await expect(courts).toHaveCount(2);
	const indicator = page.locator('header.top .sync');
	await expect(indicator).toHaveText('● онлайн');

	// Связь пропала: вызвать оба матча первого тура и ввести результаты
	await context.setOffline(true);
	for (let i = 0; i < 2; i++) {
		await courts.getByRole('button', { name: 'Вызвать', exact: true }).first().click();
	}
	for (let i = 0; i < 2; i++) {
		await courts.getByRole('button', { name: 'Результат' }).first().click();
		await enterWinByStronger(page, STRENGTH);
	}
	await expect(indicator).toContainText('нет связи');
	await expect(indicator).toContainText('ждут отправки: 4');

	// Приложение перезапустили без сети: всё на месте
	await page.reload();
	await expect(page.locator('header.event h1')).toHaveText('Сценарий: без сети');
	await expect(indicator).toContainText('ждут отправки: 4');
	await page.getByRole('link', { name: 'Матчи' }).click();
	await expect(page.getByRole('tab', { name: /Сыграны/ })).toContainText('2');

	// Связь вернулась: очередь уходит сама
	await context.setOffline(false);
	await expect(indicator).toHaveText('● онлайн', { timeout: 40_000 });
	expect((await serverMatch(page, eventId, 1))?.result?.games).toEqual([[21, 10]]);
	expect((await serverMatch(page, eventId, 2))?.result?.games).toEqual([[21, 10]]);

	// Гость без входа видит актуальную таблицу
	const guest = await browser.newPage();
	await guest.goto(`/e/${eventId}/table`);
	await expect(guest.locator('nav.tabs')).not.toContainText('Настройки');
	const leader = guest.locator('.grid tbody tr', { hasText: 'Альфин Тест' });
	await expect(leader.locator('td.num').first()).toHaveText('1-0');
	await guest.close();
});
