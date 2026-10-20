<script lang="ts">
	import { resolve } from '$app/paths';
	import { conflicts } from '../conflicts.svelte.js';
	import { outbox } from '../outbox.svelte.js';

	const waiting = $derived(outbox.pending.length);
</script>

<!-- Состояние связи у организатора (docs/screens.md, «Шапка и индикатор связи») -->
{#if outbox.status === 'unauthorized'}
	<a class="sync bad" href={resolve('/login')}>Вход истёк — войдите снова · ждут: {waiting}</a>
{:else if outbox.status === 'offline'}
	<span class="sync bad">○ нет связи · ждут отправки: {waiting}</span>
{:else if conflicts.items.length > 0}
	<a class="sync warn" href={resolve('/sync')}>▲ конфликты: {conflicts.items.length}</a>
{:else if waiting > 0}
	<span class="sync">◐ отправка…</span>
{:else}
	<span class="sync ok">● онлайн</span>
{/if}

<style>
	.sync {
		font-size: 13px;
		white-space: nowrap;
		color: var(--text-2);
	}
	.ok {
		color: var(--ok);
	}
	.bad {
		color: var(--danger);
	}
	.warn {
		color: var(--warn);
		font-weight: 600;
	}
</style>
