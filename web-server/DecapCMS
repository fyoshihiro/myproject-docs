# Decap CMS + Eleventy + Cloudflare Workers 構築手順

ブラウザの管理画面から記事を書くだけで公開できる、WordPress的なブログ環境を、完全無料のCloudflare構成で作る手順書。

## 全体の仕組み

```
管理画面(/admin/)でログイン・記事作成
        ↓
GitHubリポジトリに自動コミット
        ↓
Cloudflareが自動検知してビルド(Eleventy)
        ↓
Workerが独自ドメイン配下でサイトを配信
        ↓
記事一覧・個別ページが自動生成
```

- **Eleventy**:Markdownの記事をHTMLサイトに変換する静的サイトジェネレーター
- **Decap CMS**:ブラウザ上で記事を書ける管理画面(GitHubにMarkdownとして保存される)
- **Cloudflare Workers**:サイトの公開・OAuth認証処理を担当

---

## 1. Eleventyでサイトの土台を作る

### 1-1. 作業フォルダの作成

```bash
mkdir my-blog
cd my-blog
npm init -y
npm install @11ty/eleventy
```

### 1-2. トップページを作成

`index.md` を作成:

```markdown
---
layout: base.njk
title: はじめてのブログ
---

# はじめてのブログ

これはEleventyでビルドしたテストページです。
```

> **つまずきポイント**:`layout`の指定がないと`<head>`タグや`charset`指定がされず、**日本語が文字化けする**。必ずレイアウトファイルを用意すること。

### 1-3. レイアウトファイルを作成

`_includes` フォルダを作成し、その中に `base.njk`:

```html
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{ title }}</title>
</head>
<body>
  {{ content | safe }}
</body>
</html>
```

### 1-4. ビルド確認

```bash
npx @11ty/eleventy
cat _site/index.html
```

---

## 2. GitHubリポジトリ化

```bash
git init
```

`.gitignore` を作成:

```
node_modules
_site
```

```bash
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<ユーザー名>/my-blog.git
git push -u origin main
```

---

## 3. Cloudflareで自動ビルド・公開設定

1. Cloudflareダッシュボード → Workers & Pages → Create → GitHubリポジトリと連携
2. ビルド設定:

| 項目 | 値 |
|---|---|
| ビルドコマンド | `npx @11ty/eleventy` |
| デプロイコマンド | `npx wrangler deploy` |

3. `wrangler.toml` をリポジトリ直下に作成:

```toml
name = "my-blog"
compatibility_date = "2026-08-19"

[assets]
directory = "_site"
```

4. コミット&プッシュすると自動デプロイされる

> **つまずきポイント**:ビルド設定画面に「出力フォルダ」の指定項目がない場合、`wrangler.toml`の`[assets] directory`で指定する必要がある。

---

## 4. Decap CMS(管理画面)を追加

### 4-1. 管理画面ファイルを作成

`admin/index.html`:

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>管理画面</title>
</head>
<body>
  <script src="https://unpkg.com/decap-cms@^3.0.0/dist/decap-cms.js"></script>
</body>
</html>
```

`admin/config.yml`:

```yaml
backend:
  name: github
  repo: <ユーザー名>/my-blog
  branch: main
  base_url: https://<ワーカー名>.<アカウント名>.workers.dev
  auth_endpoint: auth

media_folder: "img"
public_folder: "/img"

collections:
  - name: "posts"
    label: "記事"
    folder: "posts"
    create: true
    slug: "{{slug}}"
    fields:
      - { label: "タイトル", name: "title", widget: "string" }
      - { label: "本文", name: "body", widget: "markdown" }
      - { label: "レイアウト", name: "layout", widget: "hidden", default: "post.njk" }
```

> **`base_url` と `auth_endpoint` を忘れると**、Decap CMSはデフォルトでNetlifyの認証サービスにアクセスしようとし、404エラーになる。自前のOAuthサーバー(後述のWorker)を使うことを明示する必要がある。

### 4-2. Eleventyに`admin`フォルダをコピーさせる設定

`.eleventy.js` を作成:

```js
module.exports = function(eleventyConfig) {
  eleventyConfig.addPassthroughCopy("admin");
};
```

> **つまずきポイント**:Eleventyはデフォルトで`.yml`ファイルをコピーしないため、これを書かないと管理画面で `Failed to load config.yml (404)` エラーになる。

---

## 5. GitHub OAuth認証を設定

Decap CMSがGitHubにログインするための認証設定。

### 5-1. GitHubでOAuth Appを作成

[https://github.com/settings/developers](https://github.com/settings/developers) → New OAuth App

| 項目 | 値 |
|---|---|
| Application name | 任意(例:`my-blog-cms`) |
| Homepage URL | `https://<ワーカー名>.<アカウント名>.workers.dev` |
| Authorization callback URL | `https://<ワーカー名>.<アカウント名>.workers.dev/callback` |

登録後、**Client ID** と **Client Secret**(この時しか表示されない)を控える。

### 5-2. Cloudflareに環境変数として登録

Workers & Pages → 対象Worker → **Settings → Variables and Secrets**

> **つまずきポイント**:Cloudflareには変数の登録画面が複数存在する場合がある。Workerが実行時に`env.XXX`として読み取れるのは **「Runtime variables and secrets」** に登録した変数のみ。ビルド用の変数欄に登録しても実行時には反映されない。

| Type | 名前 | 値 |
|---|---|---|
| Secret | `GITHUB_CLIENT_ID` | 取得したClient ID |
| Secret | `GITHUB_CLIENT_SECRET` | 取得したClient Secret |

---

## 6. OAuth認証処理のWorkerコード

### 6-1. `src/index.js` を作成

```js
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // 1. 認証開始:GitHubへリダイレクト
    if (url.pathname === "/auth") {
      const githubAuthUrl = new URL("https://github.com/login/oauth/authorize");
      githubAuthUrl.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
      githubAuthUrl.searchParams.set("scope", "repo,user");
      return Response.redirect(githubAuthUrl.toString(), 302);
    }

    // 2. コールバック:GitHubからのコードをトークンに交換
    if (url.pathname === "/callback") {
      const code = url.searchParams.get("code");

      const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          client_id: env.GITHUB_CLIENT_ID,
          client_secret: env.GITHUB_CLIENT_SECRET,
          code: code,
        }),
      });

      const tokenData = await tokenRes.json();
      const token = tokenData.access_token;

      const script = `
        <script>
          (function() {
            function receiveMessage(e) {
              window.opener.postMessage(
                'authorization:github:success:${JSON.stringify({ token })}',
                e.origin
              );
            }
            window.addEventListener("message", receiveMessage, false);
            window.opener.postMessage("authorizing:github", "*");
          })();
        </script>
      `;

      return new Response(script, {
        headers: { "Content-Type": "text/html" },
      });
    }

    // 3. それ以外は静的ファイルを配信
    return env.ASSETS.fetch(request);
  },
};
```

### 6-2. `wrangler.toml` を修正

`main`と`binding`を追加する。

```toml
name = "my-blog"
compatibility_date = "2026-08-19"
main = "src/index.js"

[assets]
directory = "_site"
binding = "ASSETS"
```

> **つまずきポイント**:`main`にWorkerコードを指定すると、静的ファイル配信は自動では行われなくなる。`env.ASSETS.fetch(request)` を明示的に呼び出すコードが必要。

---

## 7. 記事一覧・個別ページの表示

Decap CMSで記事を投稿しても、そのままではサイト上に表示されない。以下を追加する。

### 7-1. 記事をコレクションとして認識させる

`.eleventy.js` を修正:

```js
module.exports = function(eleventyConfig) {
  eleventyConfig.addPassthroughCopy("admin");
  eleventyConfig.addCollection("post", function(collectionApi) {
    return collectionApi.getFilteredByGlob("posts/*.md");
  });
};
```

### 7-2. 記事一覧ページ

`posts.njk` を作成:

```njk
---
layout: base.njk
title: 記事一覧
---

<h1>記事一覧</h1>
<ul>
{% for post in collections.post %}
  <li><a href="{{ post.url }}">{{ post.data.title }}</a></li>
{% endfor %}
</ul>
```

### 7-3. 個別記事のレイアウト

`_includes/post.njk` を作成:

```html
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{ title }}</title>
</head>
<body>
  <a href="/posts/">← 記事一覧に戻る</a>
  <h1>{{ title }}</h1>
  {{ content | safe }}
</body>
</html>
```

---

## 8. 記事投稿後、ローカルとの同期を忘れずに

Decap CMSで投稿した記事はGitHub上にのみ保存される。ローカルで動作確認する場合は必ず取り込む。

```bash
git pull
```

> **つまずきポイント**:`git pull`を忘れたままローカルでビルドすると、投稿したはずの記事が存在せず「反映されない」と誤解しやすい。

---

## 運用の流れ(完成後)

普段の記事投稿はターミナル操作不要。

1. `https://<ワーカー名>.<アカウント名>.workers.dev/admin/` にアクセス
2. 「Login with GitHub」でログイン
3. 「+ 記事」で新規作成、Publish

裏側で自動的に GitHub保存 → Cloudflare再ビルド → サイト反映 が行われる。

---

## トラブルシューティング一覧

| 症状 | 原因 | 対処 |
|---|---|---|
| 日本語が文字化けする | HTMLに`charset`指定がない | レイアウトファイル(`base.njk`等)で`<meta charset="UTF-8">`を指定 |
| `Failed to load config.yml (404)` | `admin`フォルダがビルド時にコピーされていない | `.eleventy.js`に`addPassthroughCopy("admin")`を追加 |
| `Not Found`(Netlifyのドメインが開く) | `config.yml`にOAuthサーバーの指定がない | `base_url`と`auth_endpoint`を追加 |
| `client_id=undefined` | 環境変数がWorker実行時に読めていない | 「Runtime variables and secrets」に登録し直す |
| 投稿した記事がローカルビルドで反映されない | ローカルとGitHubが同期していない | `git pull`を実行 |
| 記事の個別ページが生成されない | Eleventyが`posts`フォルダを認識していない | `.eleventy.js`に`addCollection`を追加 |

---

## 今後の拡張候補(未着手)

- 独自ドメイン(例:`non-pro.net/blog/`)への接続(Workers Routesで設定可能)
- トップページから記事一覧へのリンク追加
- CSSによる見た目の装飾
