export type ThemeMode = 'system' | 'light' | 'dark';

const KEY = 'volan.theme';

function read(): ThemeMode {
	try {
		const value = localStorage.getItem(KEY);
		return value === 'light' || value === 'dark' ? value : 'system';
	} catch {
		return 'system';
	}
}

// Тема: по системе или вручную; выбор хранится в браузере
class Theme {
	mode = $state<ThemeMode>(read());

	set(mode: ThemeMode): void {
		this.mode = mode;
		try {
			if (mode === 'system') localStorage.removeItem(KEY);
			else localStorage.setItem(KEY, mode);
		} catch {
			// хранилище недоступно — тема действует до перезагрузки
		}
		apply(mode);
	}

	next(): void {
		this.set(this.mode === 'system' ? 'light' : this.mode === 'light' ? 'dark' : 'system');
	}
}

function apply(mode: ThemeMode): void {
	if (mode === 'system') delete document.documentElement.dataset.theme;
	else document.documentElement.dataset.theme = mode;
}

export const theme = new Theme();
