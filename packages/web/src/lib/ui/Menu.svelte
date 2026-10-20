<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		label = '⋯',
		title = 'Ещё',
		disabled = false,
		variant = 'ghost',
		children
	}: {
		label?: string;
		title?: string;
		disabled?: boolean;
		variant?: 'ghost' | 'plain';
		children: Snippet;
	} = $props();

	const uid = $props.id();
	const id = `menu-${uid}`;
	let trigger = $state<HTMLButtonElement>();
	let menu = $state<HTMLDivElement>();

	// Меню — в верхнем слое (popover): его не обрезает прокрутка таблиц, щелчок мимо и Esc
	// закрывают его сами. Место — под кнопкой по правому краю; не помещается снизу — над ней.
	function place(event: ToggleEvent) {
		if (event.newState !== 'open' || !trigger || !menu) return;
		const anchor = trigger.getBoundingClientRect();
		menu.style.top = `${anchor.bottom + 4}px`;
		menu.style.right = `${Math.max(8, innerWidth - anchor.right)}px`;
		requestAnimationFrame(() => {
			if (!menu) return;
			const box = menu.getBoundingClientRect();
			if (box.bottom > innerHeight - 8) {
				menu.style.top = `${Math.max(8, anchor.top - box.height - 4)}px`;
			}
		});
	}

	// Выбор пункта (кнопки или ссылки) закрывает меню
	function onclick(event: MouseEvent) {
		if ((event.target as HTMLElement).closest('button, a')) menu?.hidePopover();
	}
</script>

<button
	bind:this={trigger}
	type="button"
	class="btn small"
	class:ghost={variant === 'ghost'}
	popovertarget={id}
	{disabled}
	{title}
	aria-label={label === '⋯' ? title : undefined}
>
	{label}
</button>
<!-- Щелчок ловится от кнопок-пунктов (Enter на них — тоже щелчок), у самого div действий нет -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div bind:this={menu} {id} popover="auto" class="menu" onbeforetoggle={place} {onclick}>
	{@render children()}
</div>

<style>
	.menu {
		position: fixed;
		inset: auto;
		margin: 0;
		min-width: 200px;
		max-width: calc(100vw - 16px);
		max-height: min(420px, calc(100vh - 16px));
		overflow: auto;
		padding: 4px;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius);
		background: var(--surface);
		color: var(--text);
		box-shadow: 0 6px 24px rgb(0 0 0 / 0.18);
	}
	.menu :global(.menu-item) {
		display: block;
		box-sizing: border-box;
		text-decoration: none;
		width: 100%;
		padding: 8px 10px;
		border: none;
		border-radius: 4px;
		background: none;
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	.menu :global(.menu-item:hover:not(:disabled)) {
		background: var(--accent-soft);
	}
	.menu :global(.menu-item:disabled) {
		color: var(--text-2);
		cursor: default;
	}
	.menu :global(.menu-label) {
		padding: 6px 10px 2px;
		font-size: 12px;
		color: var(--text-2);
	}
	.menu :global(.menu-sep) {
		margin: 4px 0;
		border: none;
		border-top: 1px solid var(--border);
	}
</style>
