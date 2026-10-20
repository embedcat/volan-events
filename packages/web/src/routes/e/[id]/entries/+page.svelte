<script lang="ts">
	import EntryList from '#lib/ui/EntryList.svelte';
	import EntriesSection from '#lib/ui/settings/EntriesSection.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const store = $derived(data.store);
	const guest = $derived(data.guest);
</script>

<svelte:head>
	<title>Участники — {(store ?? guest)?.view?.title ?? 'событие'}</title>
</svelte:head>

<div class="entries">
	{#if store}
		<EntriesSection {store} />
	{:else if guest?.view}
		<EntryList ev={guest.view} lookup={guest.name} />
	{/if}
</div>

<style>
	.entries {
		max-width: 860px;
	}
</style>
