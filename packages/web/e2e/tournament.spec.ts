import { expect, test } from '@playwright/test';
import { enterWinByStronger, login } from './helpers';

// Критерий 1 MVP (docs/mvp.md): турнир на 6 участников и 2 корта — от создания события
// до итоговой таблицы, всё через интерфейс
const STRENGTH = ['Первов', 'Вторых', 'Третьяков', 'Четвертаков', 'Пятов', 'Шестаков'];

test('турнир на 6 участников и 2 корта от создания до итогов', async ({ page }) => {
	await login(page, 'org');

	// Событие
	await page.getByRole('link', { name: 'Создать событие' }).click();
	await page.getByLabel('Название').fill('Сценарий: полный турнир');
	await page.getByLabel('Кортов').fill('2');
	await page.getByRole('button', { name: 'Создать', exact: true }).click();
	await expect(page).toHaveURL(/\/settings$/);

	// Категория MS
	await page.getByRole('button', { name: 'Создать категорию' }).click();
	await page.getByLabel('Разряд').selectOption('MS');
	await page.getByRole('button', { name: 'Создать', exact: true }).click();

	// Участники: новые игроки прямо из поиска, рейтинг — по силе
	for (const [i, lastName] of STRENGTH.entries()) {
		await page.getByLabel('Игрок', { exact: true }).fill(`${lastName} Тест`);
		await page.getByRole('button', { name: `Новый игрок «${lastName} Тест»` }).click();
		await page.getByLabel('Рейтинг', { exact: true }).fill(String(900 - i * 100));
		await page.getByRole('button', { name: 'Создать игрока' }).click();
		await page.getByRole('button', { name: 'Добавить', exact: true }).click();
	}
	await expect(page.getByText('Участники · 6')).toBeVisible();

	await page.getByRole('button', { name: 'Составить расписание' }).click();
	await expect(page.getByText('15 матчей, 5 туров.', { exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Начать турнир' }).click();

	// Пульт: вызывать подсказанные матчи и вводить результаты, пока очередь не опустеет
	await page.getByRole('link', { name: 'Пульт' }).click();
	const courts = page.locator('.court');
	await expect(courts).toHaveCount(2);
	for (let step = 0; step < 40; step++) {
		const busy = courts.filter({ has: page.getByRole('button', { name: 'Результат' }) });
		const free = courts.filter({ has: page.getByRole('button', { name: 'Вызвать', exact: true }) });
		if ((await free.count()) > 0) {
			await free.first().getByRole('button', { name: 'Вызвать', exact: true }).click();
		} else if ((await busy.count()) > 0) {
			await busy.first().getByRole('button', { name: 'Результат' }).click();
			await enterWinByStronger(page, STRENGTH);
		} else {
			break;
		}
	}
	await expect(page.getByText('Очередь пуста.')).toBeVisible();

	// Итоги: места по силе, все матчи сыграны
	await page.getByRole('link', { name: 'Таблица' }).click();
	await expect(page.getByText('все матчи сыграны')).toBeVisible();
	for (const [i, lastName] of STRENGTH.entries()) {
		const row = page.locator('.grid tbody tr', { hasText: `${lastName} Тест` });
		await expect(row.locator('td.place')).toHaveText(String(i + 1));
		await expect(row.locator('td.num').first()).toHaveText(`${5 - i}-${i}`); // П-П
	}

	await page.getByRole('link', { name: 'Матчи' }).click();
	await expect(page.getByRole('tab', { name: /Сыграны/ })).toContainText('15');

	await page.getByRole('link', { name: 'Настройки' }).click();
	await page.getByRole('button', { name: 'Завершить турнир' }).click();
	await expect(page.locator('header.event')).toContainText('Завершено');
});
