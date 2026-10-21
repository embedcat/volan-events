import { expect, test } from '@playwright/test';
import { PASSWORD, login } from './helpers';

// Суперюзер заводит организатора; тот входит и видит пустой список своих событий
test('суперюзер создаёт организатора, организатор входит', async ({ page }) => {
	const loginName = `org-${Date.now()}`;
	await login(page, 'admin');

	await page.getByRole('button', { name: 'Администратор ▾' }).click();
	await page.getByRole('link', { name: 'Пользователи' }).click();
	await expect(page.getByRole('heading', { name: 'Пользователи' })).toBeVisible();

	await page.getByLabel('Логин').fill(loginName);
	await page.getByLabel('Имя для показа').fill('Новый Организатор');
	await page.getByLabel('Пароль (не короче 8 символов)').fill(PASSWORD);
	await page.getByRole('button', { name: 'Создать', exact: true }).click();
	const row = page.locator('tbody tr', { hasText: loginName });
	await expect(row).toContainText('организатор');
	await expect(row).toContainText('активен');

	// Выход и вход новым организатором
	await page.getByRole('button', { name: 'Администратор ▾' }).click();
	await page.getByRole('button', { name: 'Выйти' }).click();
	await expect(page).toHaveURL(/\/$/);
	await login(page, loginName);
	await expect(page.getByText('Событий пока нет.')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Новый Организатор ▾' })).toBeVisible();

	// Раздела «Пользователи» у организатора нет
	await page.getByRole('button', { name: 'Новый Организатор ▾' }).click();
	await expect(page.getByRole('link', { name: 'Пользователи' })).toHaveCount(0);
});
