<script lang="ts">
	import favicon from '#lib/assets/favicon.svg';
	import { nav } from '#lib/nav.js';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import Search from '#lib/Search.svelte';
	import { renderMermaid, rerenderMermaid } from '#lib/mermaid.js';
	import './layout.css';

	let { children } = $props();
	let open = $state(false);
	let theme = $state<'light' | 'dark'>('light');

	onMount(() => {
		theme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
	});

	function toggleTheme() {
		theme = theme === 'dark' ? 'light' : 'dark';
		document.documentElement.dataset.theme = theme;
		try {
			localStorage.setItem('theme', theme);
		} catch {}
		rerenderMermaid(document.querySelector('.content')!);
	}

	let progress = $state(0);
	let showTop = $state(false);
	let zoomSrc = $state<string | null>(null);

	function onScroll() {
		const max = document.documentElement.scrollHeight - innerHeight;
		progress = max > 0 ? Math.min(100, (scrollY / max) * 100) : 0;
		showTop = scrollY > 300;
	}

	function onContentClick(e: MouseEvent) {
		const el = e.target;
		if (el instanceof HTMLImageElement) zoomSrc = el.currentSrc || el.src;
	}

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

<svelte:window onscroll={onScroll} onresize={onScroll} onkeydown={(e) => e.key === 'Escape' && (zoomSrc = null)} />

<div class="progress" style:width="{progress}%"></div>

<button
	class="theme-toggle"
	aria-label={theme === 'dark' ? 'ライトモードに切り替え' : 'ダークモードに切り替え'}
	title="テーマ切り替え"
	onclick={toggleTheme}>{theme === 'dark' ? '☀' : '☾'}</button
>
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
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
	<main class="content" data-pagefind-body onclick={onContentClick}>
		{@render children()}
	</main>
</div>

{#if showTop}
	<button
		class="back-to-top"
		aria-label="ページの先頭へ"
		onclick={() => scrollTo({ top: 0, behavior: 'smooth' })}>↑</button
	>
{/if}

{#if zoomSrc}
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<div class="zoom-overlay" onclick={() => (zoomSrc = null)}>
		<img src={zoomSrc} alt="" />
	</div>
{/if}
