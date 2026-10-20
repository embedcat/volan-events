<script lang="ts">
	import type { EventCommand, PublicPlayer } from '@volan/domain';
	import { api } from '../../api.js';
	import { buildExport, eventPlayerIds, exportFileName } from '../../event-export.js';
	import type { EventStore } from '../../event-store.svelte.js';
	import { nowIso } from '../../format.js';
	import { apiErrorText } from '../../messages.js';
	import { registry } from '../../registry.svelte.js';
	import { toasts } from '../../toasts.svelte.js';

	let { store }: { store: EventStore } = $props();
	let busy = $state(false);

	// Файл — из подтверждённого сервером состояния и журнала до той же версии (D147)
	async function download() {
		const state = store.confirmed;
		if (!state) return;
		busy = true;
		try {
			const version = store.version;
			const { commands } = await api<{ commands: { seq: number; command: EventCommand }[] }>(
				`/events/${store.id}/commands?after=0`
			);
			const players = eventPlayerIds(state).map((id) => {
				const known = registry.players[id];
				const name = store.names[id];
				return (known ?? {
					id,
					lastName: name?.lastName ?? '',
					firstName: name?.firstName ?? '',
					gender: 'M',
					club: null,
					rating: null,
					mergedIntoId: null,
					createdBy: ''
				}) as PublicPlayer & Record<string, unknown>;
			});
			const file = buildExport({
				state,
				version,
				players,
				commands: commands.filter((c) => c.seq <= version),
				exportedAt: nowIso()
			});
			const blob = new Blob([JSON.stringify(file, null, '\t')], { type: 'application/json' });
			const url = URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = url;
			link.download = exportFileName(state);
			link.click();
			setTimeout(() => URL.revokeObjectURL(url), 1000);
		} catch (error) {
			toasts.error(apiErrorText(error));
		} finally {
			busy = false;
		}
	}
</script>

<section class="card">
	<h2>Выгрузка</h2>
	<p class="muted">
		Файл JSON с состоянием события, игроками и всей историей изменений — резервная копия и перенос.
		Закрытые поля игроков в файл не попадают.
	</p>
	{#if store.local.length > 0}
		<p class="warn-text">
			Ещё не отправлено изменений: {store.local.length} — в файл попадёт то, что принял сервер.
		</p>
	{/if}
	<button class="btn" disabled={busy || !store.confirmed} onclick={download}>
		{busy ? 'Готовлю файл…' : 'Выгрузить в JSON'}
	</button>
</section>
