// Иконки приложения «Волан» (D151): белая буква «В» на цвете акцента.
// Рисуются в Chromium из Playwright, чтобы не тянуть графические библиотеки:
//   pnpm --filter @volan/web icons
import { writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const ACCENT = '#1f63d6';
const OUT = new URL('../static/icons/', import.meta.url);

// rounded — скруглённый квадрат (обычная иконка); иначе — во всю площадь (maskable, iPhone)
const ICONS = [
	{ file: 'icon-192.png', size: 192, rounded: true, scale: 0.62 },
	{ file: 'icon-512.png', size: 512, rounded: true, scale: 0.62 },
	{ file: 'icon-maskable-512.png', size: 512, rounded: false, scale: 0.46 },
	{ file: 'apple-touch-icon.png', size: 180, rounded: false, scale: 0.58 }
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const icon of ICONS) {
	const base64 = await page.evaluate(
		({ size, rounded, scale, accent }) => {
			const canvas = document.createElement('canvas');
			canvas.width = canvas.height = size;
			const g = canvas.getContext('2d');
			g.fillStyle = accent;
			if (rounded) {
				g.beginPath();
				g.roundRect(0, 0, size, size, size * 0.22);
				g.fill();
			} else {
				g.fillRect(0, 0, size, size);
			}
			g.fillStyle = '#ffffff';
			g.font = `700 ${Math.round(size * scale)}px "Segoe UI", "DejaVu Sans", sans-serif`;
			g.textAlign = 'center';
			g.textBaseline = 'alphabetic';
			const m = g.measureText('В');
			// по вертикали — центр самой буквы, а не строки
			g.fillText(
				'В',
				size / 2,
				size / 2 + (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2
			);
			return canvas.toDataURL('image/png').split(',')[1];
		},
		{ ...icon, accent: ACCENT }
	);
	await writeFile(new URL(icon.file, OUT), Buffer.from(base64, 'base64'));
	console.log(icon.file);
}
await browser.close();
