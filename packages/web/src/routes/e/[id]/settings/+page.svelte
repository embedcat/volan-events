<script lang="ts">
	import CategorySection from '#lib/ui/settings/CategorySection.svelte';
	import CourtsSection from '#lib/ui/settings/CourtsSection.svelte';
	import EntriesSection from '#lib/ui/settings/EntriesSection.svelte';
	import EventSection from '#lib/ui/settings/EventSection.svelte';
	import Readiness from '#lib/ui/settings/Readiness.svelte';
	import ScheduleSection from '#lib/ui/settings/ScheduleSection.svelte';
	import TournamentSection from '#lib/ui/settings/TournamentSection.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const store = $derived(data.store);
</script>

<svelte:head>
	<title>Настройки — {store?.view?.title ?? 'событие'}</title>
</svelte:head>

{#if store}
	<div class="sections">
		<Readiness {store} />
		<EventSection {store} />
		<CourtsSection {store} />
		<CategorySection {store} />
		<EntriesSection {store} />
		<ScheduleSection {store} />
		<TournamentSection {store} />
	</div>
{/if}

<style>
	.sections {
		display: flex;
		flex-direction: column;
		gap: 16px;
		max-width: 860px;
	}
</style>
