<script lang="ts">
	import { groupEvents } from '#lib/events.js';
	import { todayIso } from '#lib/format.js';
	import EventList from '#lib/ui/EventList.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const groups = $derived(groupEvents(data.events, todayIso()));
</script>

<svelte:head>
	<title>Турниры — volan-events</title>
</svelte:head>

<h1>Турниры</h1>

{#if data.error}
	<p class="error-text">{data.error}</p>
{:else if data.events.length === 0}
	<p class="muted">Опубликованных турниров пока нет.</p>
{/if}

{#each [['Идут', groups.running], ['Предстоят', groups.upcoming], ['Прошли', groups.past]] as const as [label, events] (label)}
	{#if events.length > 0}
		<section>
			<h2>{label}</h2>
			<EventList {events} />
		</section>
	{/if}
{/each}

<style>
	section {
		margin-bottom: 24px;
	}
</style>
