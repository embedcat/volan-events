import { resolve } from '$app/paths';
import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';

// Без раздела: владельцу в подготовке — настройки; пока турнир идёт — корты (пульт),
// иначе — таблица
export const load: PageLoad = async ({ parent, params }) => {
	const { store, guest } = await parent();
	const progress = (store ?? guest)?.view?.progress;
	if (!progress) return;
	if (progress === 'setup' && store) redirect(307, resolve('/e/[id]/settings', { id: params.id }));
	if (progress === 'running') redirect(307, resolve('/e/[id]/courts', { id: params.id }));
	redirect(307, resolve('/e/[id]/table', { id: params.id }));
};
