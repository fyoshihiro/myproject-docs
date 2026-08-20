# Cloudflare Workers & Pages 構築手順

静的サイトをCloudflare Workersにデプロイし、独自ドメインの特定パス(例: `non-pro.net/code/`)で公開するための手順書。

## 前提

- Cloudflareアカウントを持っている
- 対象ドメイン(例: `non-pro.net`)がCloudflareにゾーン登録済み
- Node.js がインストール済み(`node -v` で確認)

---

## 1. Wranglerのインストール

Wranglerは、Cloudflareが提供する公式CLIツール。ブラウザ操作なしでWorkers/Pagesの管理ができる。

```bash
npm install -g wrangler
```

インストール確認:

```bash
wrangler --version
```

---

## 2. Cloudflareへログイン

```bash
wrangler login
```

ブラウザが自動で開くので、Cloudflareアカウントでログインし、アクセスを許可する。

---

## 3. 作業フォルダの準備

公開したいサイトのファイル一式を、公開パスと同じ名前のフォルダにまとめる。

例: `non-pro.net/code/` で公開したい場合

```
deploy/
└── code/
    ├── index.html
    ├── style.css
    ├── script.js
    └── img/
        └── sample.png
```

> **ポイント**: ダッシュボードのドラッグ&ドロップアップロードは、フォルダを選択してもフォルダ名が保持されず中身だけ展開されてしまう場合がある。Wranglerを使うとフォルダ構造を正確に保ったままアップロードできる。

---

## 4. `wrangler.toml` の作成

`deploy` フォルダ直下に `wrangler.toml` を新規作成する。

```toml
name = "tec"
compatibility_date = "2026-08-19"

[assets]
directory = "."
```

- `name`: Workerの名前(公開URL `<name>.<アカウント名>.workers.dev` に使われる)
- `compatibility_date`: デプロイ実行日を指定
- `[assets] directory`: 公開対象のルートディレクトリ(`.` = `wrangler.toml` と同じ階層)

---

## 5. デプロイ実行

```bash
cd ~/Desktop/deploy
wrangler deploy
```

事前に内容を確認したい場合(実際にはアップロードしない):

```bash
wrangler deploy --dry-run
```

アップロード対象ファイルの一覧をローカルで確認:

```bash
find code -type f
```

---

## 6. 独自ドメインのパスに割り当て(Routes設定)

Cloudflareダッシュボード → Workers & Pages → 対象Worker → **Settings → Triggers → Routes** で以下を追加。

| Route | Zone |
|---|---|
| `non-pro.net/code/*` | non-pro.net |

> DNS側は該当ドメインのAレコードが「プロキシ済み(オレンジ雲)」になっていれば、既存の自宅サーバー等と共存可能。Routesに一致しないパスは通常通りAレコード先(実サーバー)に流れる。

動作確認:

```
https://non-pro.net/code/index.html
```

---

## 7. セキュリティヘッダーの設定(`_headers`)

`deploy/code/` フォルダ直下に `_headers` という名前のファイル(拡張子なし)を作成する。

```
/*
  Content-Security-Policy: script-src 'self' 'unsafe-inline' 'unsafe-eval'
```

### 内容の意味

| 項目 | 意味 |
|---|---|
| `/*` | サイト内の全パスに適用 |
| `Content-Security-Policy` | 読み込み可能なリソースの出所を制限するセキュリティヘッダー |
| `script-src 'self'` | スクリプトは自サイトのみ許可 |
| `'unsafe-inline'` | HTML内の `<script>` タグ直書きを許可 |
| `'unsafe-eval'` | `eval()` など動的スクリプト実行を許可 |

> `unsafe-inline` / `unsafe-eval` はセキュリティ的には緩い設定。動作確認のためにまず許可し、将来的には外部ファイル化してより厳格な設定(`'unsafe-inline'` を外す等)に移行するのが望ましい。

設定後、再度 `wrangler deploy` を実行して反映する。

---

## 8. 更新時の流れ(まとめ)

サイト内容を変更したら、以下だけでOK。

```bash
cd ~/Desktop/deploy
wrangler deploy
```

---

## トラブルシューティング

| 症状 | 原因 | 対処 |
|---|---|---|
| `/code` で404 | ルートが `/code/*` のみで末尾スラッシュなしに未対応 | `https://non-pro.net/code/` のように末尾スラッシュを付けてアクセス、または `/code`(完全一致)のルートを追加 |
| `/code/index.html` で404 | フォルダ構造が崩れてアップロードされている | Wranglerで `wrangler.toml` の `directory` 設定を確認し、フォルダごと再デプロイ |
| 新バージョンが反映されない | トラフィックが古いバージョンのまま | ダッシュボードの「デプロイ」タブでトラフィックを100%に切り替え |
