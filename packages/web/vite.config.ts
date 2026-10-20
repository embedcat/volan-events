import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			// SPA: все адреса отдаются одной страницей-оболочкой, маршрутизация в браузере
			adapter: adapter({ fallback: 'index.html' })
		})
	],
	server: {
		// В разработке API обслуживает отдельный процесс @volan/server
		proxy: {
			'/api': 'http://127.0.0.1:3000'
		}
	}
});
