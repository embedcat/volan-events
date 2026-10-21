export type Toast = {
	id: number;
	text: string;
	kind: 'info' | 'error';
	action?: { label: string; run: () => void };
	sticky?: boolean; // не исчезает сама и не вытесняется новыми (новая версия приложения)
};

const LIFETIME = { info: 8000, error: 12000 };

// Плашки внизу экрана: «Матч №9 вызван на корт 2 [Отменить]» вместо подтверждений (D72)
class Toasts {
	items = $state.raw<Toast[]>([]);
	private next = 1;

	show(text: string, options: Omit<Partial<Toast>, 'id' | 'text'> = {}): number {
		const toast: Toast = {
			id: this.next++,
			text,
			kind: options.kind ?? 'info',
			action: options.action,
			sticky: options.sticky
		};
		const sticky = this.items.filter((t) => t.sticky);
		const recent = this.items.filter((t) => !t.sticky).slice(-2);
		this.items = [...sticky, ...recent, toast];
		if (!toast.sticky) setTimeout(() => this.dismiss(toast.id), LIFETIME[toast.kind]);
		return toast.id;
	}

	error(text: string): number {
		return this.show(text, { kind: 'error' });
	}

	dismiss(id: number): void {
		this.items = this.items.filter((t) => t.id !== id);
	}
}

export const toasts = new Toasts();
