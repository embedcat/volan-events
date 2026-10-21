import { type Page, expect, test } from '@playwright/test';
import { createRunningEvent, login, serverMatch, waitForServiceWorker } from './helpers';

// Критерий 4 MVP: один и тот же матч введён с двух устройств с разным счётом — организатор
// видит конфликт и выбирает вариант

async function enterResult(page: Page, a: string, b: string): Promise<void> {
	const row = page.locator('.matches li', { hasText: '№1' }).first();
	await row.getByRole('button', { name: 'Результат' }).click();
	const dialog = page.locator('dialog.result');
	const inputs = dialog.locator('input.score');
	await inputs.nth(0).fill(a);
	await inputs.nth(1).fill(b);
	await dialog.getByRole('button', { name: 'Сохранить', exact: true }).click();
	await expect(dialog).toBeHidden();
}

test('конфликт результата с двух устройств: «Применить моё»', async ({ browser }) => {
	const phone = await (await browser.newContext()).newPage();
	const laptop = await (await browser.newContext()).newPage();
	await login(phone, 'org');
	await login(laptop, 'org');
	const eventId = await createRunningEvent(laptop, {
		title: 'Сценарий: конфликт',
		players: ['Иксов', 'Игреков', 'Зетов', 'Омегин']
	});

	await phone.goto(`/e/${eventId}/matches`);
	await waitForServiceWorker(phone);
	await laptop.goto(`/e/${eventId}/matches`);

	// Телефон без сети вводит 21:15, ноутбук со связью — 21:10
	await phone.context().setOffline(true);
	await enterResult(phone, '21', '15');
	await enterResult(laptop, '21', '10');
	expect((await serverMatch(laptop, eventId, 1))?.result?.games).toEqual([[21, 10]]);

	// Связь на телефоне вернулась: сервер не принял его счёт — конфликт
	await phone.context().setOffline(false);
	const indicator = phone.locator('header.top .sync');
	await expect(indicator).toHaveText('▲ конфликты: 1', { timeout: 40_000 });
	await indicator.click();
	const card = phone.locator('.conflict');
	await expect(card).toContainText('Матч №1: результат');
	await expect(card).toContainText('21:15');
	await expect(card).toContainText('21:10');

	await card.getByRole('button', { name: 'Применить моё' }).click();
	await expect(phone.getByText('Конфликтов нет')).toBeVisible();
	await expect
		.poll(async () => (await serverMatch(laptop, eventId, 1))?.result?.games)
		.toEqual([[21, 15]]);
});
