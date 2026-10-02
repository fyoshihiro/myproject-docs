// ```mermaid コードブロックを図(SVG)に置き換える。mermaid 本体は必要になったときだけ読み込む。
let seq = 0;

export async function renderMermaid(root: ParentNode) {
	const blocks = [...root.querySelectorAll<HTMLPreElement>('pre.language-mermaid')].filter(
		(pre) => !pre.dataset.mermaid
	);
	if (blocks.length === 0) return;

	let mermaid: typeof import('mermaid').default;
	try {
		mermaid = (await import('mermaid')).default;
	} catch (e) {
		// 読み込みに失敗しても、元のコードブロックがそのまま表示される
		console.error('Mermaid load failed', e);
		return;
	}
	const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
	mermaid.initialize({ startOnLoad: false, theme: dark ? 'dark' : 'default' });

	for (const pre of blocks) {
		pre.dataset.mermaid = 'done';
		const source = pre.querySelector('code')?.textContent ?? pre.textContent ?? '';
		try {
			const { svg } = await mermaid.render(`mermaid-${seq++}`, source);
			const figure = document.createElement('div');
			figure.className = 'mermaid-diagram';
			figure.innerHTML = svg;
			pre.replaceWith(figure);
		} catch (e) {
			console.error('Mermaid render failed', e);
		}
	}
}
