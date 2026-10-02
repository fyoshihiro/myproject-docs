<script lang="ts">
	import favicon from '#lib/assets/favicon.svg';
	import { nav } from '#lib/nav.js';
	import { page } from '$app/state';
	import Search from '#lib/Search.svelte';
	import { renderMermaid } from '#lib/mermaid.js';
	import './layout.css';

	let { children } = $props();
	let open = $state(false);

	// 各コードブロックにコピーボタンを付ける(ページ遷移のたびに再実行)
	$effect(() => {
		page.url.pathname;
		renderMermaid(document.querySelector('.content')!);
		for (const pre of document.querySelectorAll<HTMLPreElement>('.content pre:not(.language-mermaid)')) {
			if (pre.querySelector('.copy-btn')) continue;
			const btn = document.createElement('button');
			btn.className = 'copy-btn';
			btn.type = 'button';
			btn.textContent = 'Copy';
			btn.addEventListener('click', async () => {
				const code = pre.querySelector('code')?.innerText ?? pre.innerText;
				try {
					await navigator.clipboard.writeText(code);
					btn.textContent = 'Copied!';
				} catch {
					btn.textContent = 'Failed';
				}
				setTimeout(() => (btn.textContent = 'Copy'), 1500);
			});
			pre.appendChild(btn);
		}
	});

	const isActive = (href: string) => page.url.pathname.replace(/\/$/, '') === href.replace(/\/$/, '');
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Docs</title>
</svelte:head>

<button class="menu" aria-label="メニュー" onclick={() => (open = !open)}>☰</button>

<div class="shell">
	<nav class="sidebar" class:open>
		<Search />
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
	<main class="content" data-pagefind-body>
		{@render children()}
	</main>
</div>
