import { build } from 'esbuild';

// Свои пакеты (@volan/*) отдаются исходниками TS — их встраиваем в сборку.
// Пакеты из node_modules оставляем внешними: они ставятся рядом с dist в образе.
const externalizeDependencies = {
	name: 'externalize-dependencies',
	setup(b) {
		b.onResolve({ filter: /^[^./]/ }, (args) => {
			if (args.kind === 'entry-point' || args.path.startsWith('@volan/')) return undefined;
			return { path: args.path, external: true };
		});
	}
};

await build({
	entryPoints: ['src/main.ts'],
	outfile: 'dist/main.js',
	bundle: true,
	platform: 'node',
	format: 'esm',
	target: 'node24',
	sourcemap: true,
	plugins: [externalizeDependencies]
});
