<script lang="ts">
	import EntriesSection from '#lib/ui/settings/EntriesSection.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const store = $derived(data.store);
</script>

<svelte:head>
	<title>Участники — {store?.view?.title ?? 'событие'}</title>
</svelte:head>

{#if store}
	<div class="entries">
		<EntriesSection {store} />
	</div>
{/if}

<style>
	.entries {
		max-width: 860px;
	}
</style>
