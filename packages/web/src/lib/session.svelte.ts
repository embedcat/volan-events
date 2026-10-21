import { ApiError, api } from './api.js';
import { deviceId } from './device.js';
import { localDb } from './local-db.js';

export type User = {
	id: string;
	login: string;
	displayName: string;
	role: 'superuser' | 'organizer';
};

// Текущий пользователь. Вход требует сети хотя бы раз; дальше без сети приложение работает
// под последним вошедшим (docs/architecture.md, «Оффлайн»).
class Session {
	user = $state<User | null>(null);
	loaded = $state(false);
	offline = $state(false); // пользователь взят из сохранённого: сервер не ответил

	async load(): Promise<void> {
		try {
			await this.adopt((await api<{ user: User }>('/auth/me')).user);
		} catch (error) {
			if (error instanceof ApiError && error.status === 401) {
				// Сессия истекла: данные и очередь остаются до нового входа того же пользователя
				this.user = null;
			} else {
				this.user = (await localDb.getMeta<User>('user')) ?? null;
				this.offline = this.user !== null;
			}
		} finally {
			this.loaded = true;
		}
	}

	async login(login: string, password: string): Promise<{ switched: boolean }> {
		const result = await api<{ user: User }>('/auth/login', {
			body: { login, password, deviceId: deviceId() }
		});
		return this.adopt(result.user);
	}

	// Выход: на этом устройстве не остаётся ни данных, ни очереди (общие устройства)
	async logout(): Promise<void> {
		await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
		await localDb.clearUserData();
		this.user = null;
	}

	// Вошёл другой пользователь — данные прежнего на этом устройстве стираются
	private async adopt(user: User): Promise<{ switched: boolean }> {
		const previous = await localDb.getMeta<User>('user');
		const switched = !!previous && previous.id !== user.id;
		if (switched) await localDb.clearUserData();
		await localDb.setMeta('user', user);
		this.user = user;
		this.offline = false;
		void localDb.persist();
		return { switched };
	}
}

export const session = new Session();
