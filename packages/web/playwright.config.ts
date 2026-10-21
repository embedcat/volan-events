import { defineConfig, devices } from '@playwright/test';

// Сценарии в браузере (D150): Chromium, телефон — эмуляцией. Сервер и интерфейс — из сборки
// (сначала `pnpm build`), на своих портах и с чистой базой, чтобы не мешать разработке.
const API_PORT = '3100';
const WEB_PORT = 4174;
process.env.E2E_PASSWORD ??= 'e2e-password';

export default defineConfig({
	testDir: 'e2e',
	timeout: 120_000,
	expect: { timeout: 10_000 },
	// Одна база на все сценарии — по очереди
	workers: 1,
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
	use: {
		baseURL: `http://localhost:${WEB_PORT}`,
		locale: 'ru-RU',
		timezoneId: 'Europe/Moscow',
		trace: 'retain-on-failure'
	},
	projects: [
		{ name: 'desktop', use: { ...devices['Desktop Chrome'] }, testIgnore: /phone/ },
		{ name: 'phone', use: { ...devices['Pixel 7'] }, testMatch: /phone/ }
	],
	webServer: [
		{
			command: 'node e2e/server.mjs',
			url: `http://127.0.0.1:${API_PORT}/api/health`,
			env: { API_PORT, VOLAN_DEV_PASSWORD: process.env.E2E_PASSWORD },
			reuseExistingServer: false
		},
		{
			command: `pnpm exec vite preview --port ${WEB_PORT} --strictPort`,
			url: `http://localhost:${WEB_PORT}`,
			env: { API_PORT },
			reuseExistingServer: false
		}
	]
});
