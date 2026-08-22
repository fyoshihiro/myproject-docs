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

    // 3. それ以外は静的ファイルを配信(独自ドメインのサブパスで公開する場合は
    //    セクション9の pathPrefix 対応版に置き換える)
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
  <li><a href="{{ post.url | url }}">{{ post.data.title }}</a></li>
{% endfor %}
</ul>
```

> **つまずきポイント**:`post.url`をそのまま使うと`pathPrefix`(独自ドメインのサブパス設定)が反映されないことがある。`{{ post.url | url }}`のように`url`フィルターを明示的に通すこと。

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

## 9. 独自ドメインのサブパスに接続する(例:`non-pro.net/blog/`)

`workers.dev` の代わりに、既存の独自ドメイン配下(サブパス)で公開したい場合の手順。**Routes設定だけでは不十分**で、サイト内リンクとファイル配信の両方に対応が必要になる。

### 9-1. Eleventyにサブパスを教える(`pathPrefix`)

`.eleventy.js` に `return` を追加し、サイト内のリンク(`{{ post.url }}` など)を自動的に `/blog/...` の形に書き換えさせる。

```js
module.exports = function(eleventyConfig) {
  eleventyConfig.addPassthroughCopy("admin");
  eleventyConfig.addCollection("post", function(collectionApi) {
    return collectionApi.getFilteredByGlob("posts/*.md");
  });

  return {
    pathPrefix: "/blog/"
  };
};
```

### 9-2. テンプレート内の固定リンクも書き換える

`{{ '/posts/' | url }}` のように `url` フィルターを通したリンクに直しておく(固定文字列のままだと `pathPrefix` が反映されない)。

```html
<a href="{{ '/posts/' | url }}">← 記事一覧に戻る</a>
```

> **つまずきポイント**:`pathPrefix`は**HTML内のリンク文字列だけ**を書き換える機能で、ビルド後の実際のファイル配置(`_site`フォルダの中身)は変わらない。`_site/blog/index.html`のようなフォルダは作られず、従来通り`_site/index.html`のまま。ここを勘違いすると次の設定を忘れて404になる。

### 9-3. WorkerコードでURLのプレフィックスを除去する

`/blog/`宛のリクエストが来たら、内部的には`/blog/`を取り除いた上で`_site`の中身を探しに行くよう、`src/index.js`の末尾を修正する。

```js
// 3. それ以外は静的ファイルを配信(/blog/ プレフィックスを除去)
const newUrl = new URL(request.url);
if (newUrl.pathname.startsWith("/blog/")) {
  newUrl.pathname = newUrl.pathname.replace("/blog/", "/") || "/";
} else if (newUrl.pathname === "/blog") {
  newUrl.pathname = "/";
}
return env.ASSETS.fetch(new Request(newUrl.toString(), request));
```

### 9-4. Cloudflareダッシュボードでルートを追加

Workers & Pages → 対象Worker → **Settings → Triggers → Routes → Add route**

| Route | Zone |
|---|---|
| `non-pro.net/blog/*` | non-pro.net |

> 前提として、対象ドメイン(`non-pro.net`)がCloudflareにゾーン登録済みで、ルート(`@`)がプロキシ済み(オレンジ雲)になっている必要がある。既存の自宅サーバー等と共存可能(Routesに一致しないパスは通常通り実サーバーへ流れる)。

### 9-5. プッシュして確認

```bash
cd ~/Desktop/my-blog
git add .
git commit -m "Add pathPrefix for /blog/ deployment"
git push
```

反映後、以下にアクセスして確認する。

```
https://non-pro.net/blog/
https://non-pro.net/blog/posts/
https://non-pro.net/blog/admin/
```

---

## 10. トップページから記事一覧へのリンク

`index.md` に1行追加するだけ。固定文字列ではなく `url` フィルターを通すのがポイント。

```markdown
---
layout: base.njk
title: はじめてのブログ
---

# はじめてのブログ

これはEleventyでビルドしたテストページです。

[記事一覧を見る]({{ '/posts/' | url }})
```

---

## 11. CSSで見た目を整える

### 11-1. CSSファイルを作成

`my-blog` フォルダ直下に `style.css` を作成する(内容は自由)。

### 11-2. Eleventyにコピー対象として追加

`.eleventy.js` に1行追加:

```js
module.exports = function(eleventyConfig) {
  eleventyConfig.addPassthroughCopy("admin");
  eleventyConfig.addPassthroughCopy("style.css");
  eleventyConfig.addCollection("post", function(collectionApi) {
    return collectionApi.getFilteredByGlob("posts/*.md");
  });

  return {
    pathPrefix: "/blog/"
  };
};
```

### 11-3. レイアウトファイルに読み込み設定を追加

`_includes/base.njk` と `_includes/post.njk` の両方の `<head>` 内に追加する。

```html
<link rel="stylesheet" href="{{ '/style.css' | url }}">
```

> **つまずきポイント**:CSSのリンクも記事リンクと同様、固定文字列(`/style.css`)のままだと`pathPrefix`が反映されず、独自ドメイン配下では読み込まれない。必ず`| url`フィルターを通すこと。

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
| `/blog`(末尾スラッシュなし)で404 | Routesの`/blog/*`パターンは末尾スラッシュなしに一致しない | `/blog/`のように末尾スラッシュを付けてアクセス |
| `/blog/`配下すべてが404 | `pathPrefix`はリンク文字列のみ書き換え、実ファイル配置は`_site`直下のまま | `src/index.js`で`/blog/`プレフィックスを除去してから`ASSETS.fetch`する処理を追加(セクション9-3) |
| `git push`が`[rejected]`になる | GitHub側に自分のローカルにない変更がある(CMSからの投稿など) | `git pull`(初回は`git config pull.rebase false`でマージ方式を指定)してから再度`git push` |
| 記事一覧や記事本文の一部リンクだけ`/blog/`が付かず404 | テンプレート内のリンクで`url`フィルターの通し忘れがある | `{{ post.url }}`や固定文字列のhrefを`{{ post.url | url }}`のように`| url`フィルターを通す |

---

## 今後の拡張候補(未着手)

- なし(基本構成は完成)
