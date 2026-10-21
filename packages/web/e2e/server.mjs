// API для сценариев Playwright: собранный сервер, чистая база во временной папке,
// учётные записи admin и org (пароль — VOLAN_DEV_PASSWORD из playwright.config.ts)
import { spawn, spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL('../../server/dist/', import.meta.url));
const database = join(tmpdir(), 'volan-e2e.sqlite');
for (const suffix of ['', '-wal', '-shm']) rmSync(database + suffix, { force: true });

const env = { ...process.env, DATABASE_PATH: database, NODE_ENV: 'test' };
const seed = spawnSync(process.execPath, [join(dist, 'cli.js'), 'dev:seed'], {
	env,
	stdio: 'inherit'
});
if (seed.status !== 0) process.exit(seed.status ?? 1);

const server = spawn(process.execPath, [join(dist, 'main.js')], { env, stdio: 'inherit' });
for (const signal of /** @type {const} */ (['SIGINT', 'SIGTERM']))
	process.on(signal, () => server.kill(signal));
server.on('exit', (code) => process.exit(code ?? 0));
