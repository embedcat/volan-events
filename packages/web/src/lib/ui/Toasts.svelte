<script lang="ts">
	import { toasts } from '../toasts.svelte.js';
</script>

<div class="toasts" aria-live="polite">
	{#each toasts.items as toast (toast.id)}
		<div class="toast" class:error={toast.kind === 'error'}>
			<span>{toast.text}</span>
			{#if toast.action}
				<button
					class="btn small"
					onclick={() => {
						toast.action?.run();
						toasts.dismiss(toast.id);
					}}
				>
					{toast.action.label}
				</button>
			{/if}
			<button class="close" aria-label="Закрыть" onclick={() => toasts.dismiss(toast.id)}>×</button>
		</div>
	{/each}
</div>

<style>
	.toasts {
		position: fixed;
		left: 50%;
		bottom: 16px;
		transform: translateX(-50%);
		display: flex;
		flex-direction: column;
		gap: 8px;
		z-index: 50;
		width: min(560px, calc(100vw - 32px));
	}
	/* Телефон: над панелью разделов события */
	@media (max-width: 640px) {
		.toasts {
			bottom: calc(64px + env(safe-area-inset-bottom));
		}
	}
	.toast {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 8px 8px 14px;
		background: var(--text);
		color: var(--bg);
		border-radius: var(--radius);
		box-shadow: 0 4px 16px rgb(0 0 0 / 0.2);
	}
	.toast.error {
		background: var(--danger);
		color: #fff;
	}
	.toast span {
		flex: 1;
	}
	.close {
		border: none;
		background: transparent;
		color: inherit;
		font-size: 18px;
		cursor: pointer;
		padding: 0 6px;
	}
</style>
