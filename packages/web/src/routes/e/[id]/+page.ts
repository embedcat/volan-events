import { resolve } from '$app/paths';
import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';

// Без раздела: в подготовке — настройки, пока турнир идёт — пульт, после — таблица
export const load: PageLoad = async ({ parent, params }) => {
	const { store } = await parent();
	const progress = store?.view?.progress;
	if (progress === 'setup') redirect(307, resolve('/e/[id]/settings', { id: params.id }));
	if (progress === 'running') redirect(307, resolve('/e/[id]/courts', { id: params.id }));
	if (progress) redirect(307, resolve('/e/[id]/table', { id: params.id }));
};
