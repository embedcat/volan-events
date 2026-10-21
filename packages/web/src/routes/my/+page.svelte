<script lang="ts">
	import { resolve } from '$app/paths';
	import { groupEvents } from '#lib/events.js';
	import { todayIso } from '#lib/format.js';
	import EventList from '#lib/ui/EventList.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const groups = $derived(groupEvents(data.events, todayIso()));
</script>

<svelte:head>
	<title>Мои события — volan-events</title>
</svelte:head>

<div class="head">
	<h1>Мои события</h1>
	<a class="btn primary" href={resolve('/my/new')}>Создать событие</a>
</div>

{#if data.offline}
	<p class="muted">Нет связи — список на момент последней загрузки.</p>
{/if}
{#if data.error}
	<p class="error-text">{data.error}</p>
{:else if data.events.length === 0}
	<p class="muted">Событий пока нет.</p>
{/if}

{#each [['Идут', groups.running], ['Предстоят', groups.upcoming], ['Прошли', groups.past]] as const as [label, events] (label)}
	{#if events.length > 0}
		<section>
			<h2>{label}</h2>
			<EventList {events} showVisibility />
		</section>
	{/if}
{/each}

<style>
	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 12px;
	}
	.head h1 {
		margin: 0;
	}
	section {
		margin-bottom: 24px;
	}
</style>
