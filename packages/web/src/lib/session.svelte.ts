import { ApiError, api } from './api.js';
import { deviceId } from './device.js';

export type User = {
	id: string;
	login: string;
	displayName: string;
	role: 'superuser' | 'organizer';
};

class Session {
	user = $state<User | null>(null);
	loaded = $state(false);

	async load(): Promise<void> {
		try {
			this.user = (await api<{ user: User }>('/auth/me')).user;
		} catch (error) {
			if (error instanceof ApiError && error.status === 401) this.user = null;
		} finally {
			this.loaded = true;
		}
	}

	async login(login: string, password: string): Promise<void> {
		const result = await api<{ user: User }>('/auth/login', {
			body: { login, password, deviceId: deviceId() }
		});
		this.user = result.user;
	}

	async logout(): Promise<void> {
		await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
		this.user = null;
	}
}

export const session = new Session();
