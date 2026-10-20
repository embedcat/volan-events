import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.ts';

// Отдельно от vite.config.ts: режим разработки не загружает Vitest
export default mergeConfig(
	viteConfig,
	defineConfig({
		test: {
			expect: { requireAssertions: true },
			environment: 'node',
			include: ['src/**/*.test.ts']
		}
	})
);
