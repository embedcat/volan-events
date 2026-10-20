<script lang="ts">
	import { resolve } from '$app/paths';
	import { outbox } from '../outbox.svelte.js';

	const waiting = $derived(outbox.pending.length);
</script>

<!-- Состояние связи у организатора (docs/screens.md, «Шапка и индикатор связи») -->
{#if outbox.status === 'unauthorized'}
	<a class="sync bad" href={resolve('/login')}>Вход истёк — войдите снова · ждут: {waiting}</a>
{:else if outbox.status === 'offline'}
	<span class="sync bad">○ нет связи · ждут отправки: {waiting}</span>
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
</style>
