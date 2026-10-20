import { createSubscriber } from 'svelte/reactivity';

// Текущее время для «на корте 14 мин» и «отдых 8 мин». Обновляется, только пока его
// кто-то показывает; чаще раза в минуту, чтобы минуты не отставали.
class Clock {
	#subscribe = createSubscriber((update) => {
		const timer = setInterval(update, 20_000);
		return () => clearInterval(timer);
	});

	get now(): number {
		this.#subscribe();
		return Date.now();
	}
}

export const clock = new Clock();
