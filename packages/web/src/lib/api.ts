import { connection } from './connection.svelte.js';

// Запросы к серверу: JSON туда и обратно, ошибки — ApiError с кодом из ответа
export class ApiError extends Error {
	constructor(
		readonly status: number, // 0 — нет связи
		readonly code: string,
		readonly details: Record<string, unknown> = {}
	) {
		super(code);
	}

	get offline(): boolean {
		return this.status === 0;
	}
}

export async function api<T>(
	path: string,
	init: { method?: string; body?: unknown; signal?: AbortSignal } = {}
): Promise<T> {
	const hasBody = init.body !== undefined;
	let response: Response;
	try {
		response = await fetch(`/api${path}`, {
			method: init.method ?? (hasBody ? 'POST' : 'GET'),
			headers: hasBody ? { 'Content-Type': 'application/json' } : {},
			body: hasBody ? JSON.stringify(init.body) : undefined,
			credentials: 'same-origin',
			signal: init.signal
		});
	} catch {
		connection.online = false;
		throw new ApiError(0, 'network');
	}
	// 502–504 — сервер за прокси недоступен: для нас это тоже «нет связи»
	if (response.status >= 502 && response.status <= 504) {
		connection.online = false;
		throw new ApiError(0, 'network');
	}
	connection.online = true;
	const data = await response.json().catch(() => null);
	if (!response.ok) {
		const error = (data?.error ?? {}) as Record<string, unknown>;
		throw new ApiError(response.status, String(error.code ?? 'http'), error);
	}
	return data as T;
}
