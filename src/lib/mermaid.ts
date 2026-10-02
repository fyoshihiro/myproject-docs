// ```mermaid コードブロックを図(SVG)に置き換える。mermaid 本体は必要になったときだけ読み込む。
let seq = 0;

type Mermaid = typeof import('mermaid').default;

function initTheme(mermaid: Mermaid) {
	const dark = document.documentElement.dataset.theme === 'dark';
	mermaid.initialize({ startOnLoad: false, theme: dark ? 'dark' : 'default' });
}

// テーマ切り替え時に、描画済みの図を新しい配色で描き直す
export async function rerenderMermaid(root: ParentNode) {
	const figures = [...root.querySelectorAll<HTMLElement>('.mermaid-diagram[data-source]')];
	if (figures.length === 0) return;
	const mermaid: Mermaid = (await import('mermaid')).default;
	initTheme(mermaid);
	for (const figure of figures) {
		try {
			const { svg } = await mermaid.render(`mermaid-${seq++}`, figure.dataset.source!);
			figure.innerHTML = svg;
		} catch (e) {
			console.error('Mermaid render failed', e);
		}
	}
}

export async function renderMermaid(root: ParentNode) {
	const blocks = [...root.querySelectorAll<HTMLPreElement>('pre.language-mermaid')].filter(
		(pre) => !pre.dataset.mermaid
	);
	if (blocks.length === 0) return;

	let mermaid: Mermaid;
	try {
		mermaid = (await import('mermaid')).default;
	} catch (e) {
		// 読み込みに失敗しても、元のコードブロックがそのまま表示される
		console.error('Mermaid load failed', e);
		return;
	}
	initTheme(mermaid);

	for (const pre of blocks) {
		pre.dataset.mermaid = 'done';
		const source = pre.querySelector('code')?.textContent ?? pre.textContent ?? '';
		try {
			const { svg } = await mermaid.render(`mermaid-${seq++}`, source);
			const figure = document.createElement('div');
			figure.className = 'mermaid-diagram';
			figure.dataset.source = source;
			figure.innerHTML = svg;
			pre.replaceWith(figure);
		} catch (e) {
			console.error('Mermaid render failed', e);
		}
	}
}
