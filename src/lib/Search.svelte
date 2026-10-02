<script lang="ts">
	import { onMount } from 'svelte';

	let container: HTMLDivElement;
	let unavailable = $state(false);

	onMount(async () => {
		try {
			// Pagefind のインデックスは `npm run build` 後にだけ存在する
			await new Promise<void>((resolve, reject) => {
				if ((window as any).PagefindUI) return resolve();
				const script = document.createElement('script');
				script.src = '/pagefind/pagefind-ui.js';
				script.onload = () => resolve();
				script.onerror = () => reject(new Error('pagefind not found'));
				document.head.appendChild(script);
			});
			const link = document.createElement('link');
			link.rel = 'stylesheet';
			link.href = '/pagefind/pagefind-ui.css';
			document.head.appendChild(link);
			new (window as any).PagefindUI({
				element: container,
				showSubResults: true,
				showImages: false,
				translations: { placeholder: '検索' }
			});
		} catch {
			unavailable = true;
		}
	});
</script>

<div class="search" bind:this={container}></div>
{#if unavailable}
	<p class="hint">検索は本番ビルドでのみ使えます(npm run build && npm run preview)</p>
{/if}

<style>
	.search {
		--pagefind-ui-scale: 0.8;
		--pagefind-ui-primary: var(--accent);
		--pagefind-ui-text: var(--fg);
		--pagefind-ui-background: var(--bg);
		--pagefind-ui-border: var(--border);
		--pagefind-ui-font: inherit;
		margin-bottom: 1rem;
	}
	.hint {
		font-size: 0.75rem;
		color: var(--muted);
	}
</style>
