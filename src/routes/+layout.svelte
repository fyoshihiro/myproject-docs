<script lang="ts">
	import favicon from '#lib/assets/favicon.svg';
	import { nav } from '#lib/nav.js';
	import { page } from '$app/state';
	import './layout.css';

	let { children } = $props();
	let open = $state(false);

	const isActive = (href: string) => page.url.pathname.replace(/\/$/, '') === href.replace(/\/$/, '');
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Docs</title>
</svelte:head>

<button class="menu" aria-label="メニュー" onclick={() => (open = !open)}>☰</button>

<div class="shell">
	<nav class="sidebar" class:open>
		{#each nav as section}
			{#if section.title}<h2>{section.title}</h2>{/if}
			<ul>
				{#each section.items as item}
					<li>
						<a
							href={item.href}
							class:active={isActive(item.href)}
							onclick={() => (open = false)}>{item.title}</a
						>
					</li>
				{/each}
			</ul>
		{/each}
	</nav>
	<main class="content">
		{@render children()}
	</main>
</div>
