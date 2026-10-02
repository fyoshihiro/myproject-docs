# Cloudflare DNS・SSL設定(初心者向け)

独自ドメインを取得済みの状態から、Cloudflare経由でDNS管理とSSL化、メール認証(SPF/DKIM/DMARC)までを設定する手順です。すべて無料プランの範囲で完結します。

## 目次

- [1. Cloudflareアカウントを作成する](#1-cloudflareアカウントを作成する)
- [2. サイト(ドメイン)を追加する](#2-サイトドメインを追加する)
- [3. DNSレコードを設定する](#3-dnsレコードを設定する)
- [4. ネームサーバーをレジストラ側で変更する](#4-ネームサーバーをレジストラ側で変更する)
- [5. SSL/TLSを設定する](#5-ssltlsを設定する)
- [6. SPF・DKIM・DMARCを設定する(メール認証)](#6-spfdkimdmarcを設定するメール認証)
- [7. 動作確認](#7-動作確認)

---

## 1. Cloudflareアカウントを作成する

1. https://dash.cloudflare.com/sign-up にアクセス
2. メールアドレスとパスワードで登録
3. 確認メールのリンクをクリックして認証

---

## 2. サイト(ドメイン)を追加する

1. ダッシュボードで「Add a site」をクリック
2. 管理したいドメイン名を入力(例: `example.com`)
3. プランは「Free」を選択
4. 既存のDNSレコードが自動スキャンされるので、内容を確認して次へ進む

> **ポイント**: 自動スキャンは既存レコードを取りこぼすことがあるため、次のステップで必ず内容を見比べてください。

---

## 3. DNSレコードを設定する

自動スキャンで拾えなかったレコードがあれば、「DNS」タブから手動で追加します。

### 代表的なレコードタイプ

| タイプ | 用途 | 例 |
|---|---|---|
| A | ドメイン → IPv4アドレス | `example.com` → `203.0.113.1` |
| CNAME | サブドメイン → 別ホスト名 | `www` → `example.com` |
| MX | メールサーバー指定 | 使用中のメールサービスに依存 |
| TXT | ドメイン所有権確認・SPF/DKIM/DMARCなど | Step 6で設定 |

### レコード追加コマンド例(API経由)

ブラウザ操作の代わりに、CloudflareのAPIから直接登録することもできます。`YOUR_API_TOKEN` と `YOUR_ZONE_ID` は実際の値に置き換えてください。

```bash
curl -X POST "https://api.cloudflare.com/client/v4/zones/YOUR_ZONE_ID/dns_records" \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"type":"A","name":"example.com","content":"203.0.113.1","ttl":120,"proxied":true}'
```

> **ポイント**: オレンジ色の雲マーク(Proxied)がオンだと、Cloudflareを経由してSSLやCDN・保護機能が効きます。特別な理由がなければオンのままでOKです。

---

## 4. ネームサーバーをレジストラ側で変更する

1. Cloudflareが指定する2つのネームサーバー(例: `xxx.ns.cloudflare.com`)をメモする
2. ドメインを購入したレジストラ(お名前.com、Route53など)の管理画面にログイン
3. ネームサーバー設定を、Cloudflareが指定した2つに書き換える
4. 保存する

反映には数分〜24時間程度かかります。Cloudflareのダッシュボードで「Active」表示になれば完了です。

---

## 5. SSL/TLSを設定する

Cloudflareダッシュボード → 対象サイト → 「SSL/TLS」タブ

### 推奨設定

- **モード**: `Full (strict)` を選択(オリジンサーバーに有効なSSL証明書がある場合)
  - オリジン側に証明書がまだない場合は、まず `Full` にしておき、後述のOrigin証明書を発行してから `Full (strict)` に切り替える
- **Edge Certificates**: Cloudflareが自動でユニバーサルSSL証明書を発行(無料・自動更新)
- **Always Use HTTPS**: オンにする(http→httpsへ自動リダイレクト)
- **Automatic HTTPS Rewrites**: オンにする(混在コンテンツ対策)

### オリジンサーバー側の証明書が必要な場合

1. 「SSL/TLS」→「Origin Server」→「Create Certificate」
2. 生成された証明書と秘密鍵をサーバーに設置
3. 有効期限は最長15年、無料

---

## 6. SPF・DKIM・DMARCを設定する(メール認証)

なりすましメール対策として、TXTレコードで設定します。メールサービス(Gmail、Google Workspace、Microsoft 365など)ごとに正確な値が異なるため、利用中のサービスの管理画面で発行された値をそのまま登録するのが基本です。

### SPF(送信元サーバーを認可)

Cloudflareダッシュボード → 「DNS」→「Add record」

| 項目 | 値 |
|---|---|
| Type | TXT |
| Name | `@`(ルートドメイン) |
| Content | `v=spf1 include:_spf.google.com ~all`(例: Google Workspaceの場合) |
| Proxy status | DNS only(グレー雲) |

> **ポイント**: SPFレコードは1ドメインにつき1つだけ。複数の送信元がある場合は `include:` を追記して1レコードにまとめる。

### DKIM(電子署名で改ざん検知)

1. 利用中のメールサービス側でDKIM設定を有効化し、発行されたセレクタ名と公開鍵をコピーする
2. Cloudflareで以下を追加する

| 項目 | 値 |
|---|---|
| Type | TXT |
| Name | `セレクタ名._domainkey`(例: `google._domainkey`) |
| Content | サービスが発行した `v=DKIM1; k=rsa; p=...` の文字列 |

### DMARC(SPF/DKIM失敗時の処理方針を宣言)

| 項目 | 値 |
|---|---|
| Type | TXT |
| Name | `_dmarc` |
| Content | `v=DMARC1; p=none; rua=mailto:you@example.com` |

> **ポイント**: いきなり `p=reject`(拒否)にせず、まず `p=none`(監視のみ)で数週間レポートを確認し、問題なければ `p=quarantine` → `p=reject` と段階的に強化するのが安全。

### 設定後の確認

- https://mxtoolbox.com/SuperTool.aspx でドメイン名を入力し、SPF/DKIM/DMARCそれぞれのチェックが通るか確認する
- Gmail宛にテストメールを送り、「メッセージのソースを表示」でSPF=pass、DKIM=passになっているか確認する

---

## 7. 動作確認

1. ブラウザで `https://ドメイン名` にアクセスし、鍵マークが表示されるか確認する
2. https://www.ssllabs.com/ssltest/ で証明書の状態をチェックする(任意)
3. `http://` でアクセスして `https://` に自動転送されるか確認する

```bash
# HTTPS化とリダイレクトの確認例
curl -I http://example.com
curl -I https://example.com
```

---

## つまずきやすいポイント

- ネームサーバー変更後、反映まで待てずに「動かない」と慌てるケースが多い → 最大24時間待つ
- Proxied(オレンジ雲)がオフだとCloudflareのSSLが効かない → DNSのみ(グレー雲)にする理由がなければオンのままにする
- `Full (strict)` にしてオリジン証明書が無いとエラーになる → 先に `Full` で動作確認してから切り替える
- SPFレコードを2つ以上作ってしまい認証エラーになる → 1つのレコードに `include:` で統合する
- DKIM/DMARCのTXTレコードでProxy status(オレンジ雲)をオンにしてしまう → メール認証系のTXTは必ず「DNS only」(グレー雲)にする
- DMARCをいきなり `p=reject` にして正規メールまでブロックしてしまう → `p=none` から段階的に強化する
- サブドメインでメールを使う予定がなくても、`_dmarc` にnullレコード(`v=spf1 -all` 等)を設定してなりすまし対策をしておくと安全

---

## まとめ表

| ステップ | 場所 | 所要時間目安 |
|---|---|---|
| アカウント作成 | Cloudflare | 5分 |
| サイト追加・DNS確認 | Cloudflare | 10分 |
| ネームサーバー変更 | レジストラ | 5分(反映待ち別) |
| SSL/TLS設定 | Cloudflare | 5分 |
| SPF/DKIM/DMARC設定 | Cloudflare + メールサービス管理画面 | 15分 |
| 動作確認 | ブラウザ・mxtoolbox・Gmail | 10分 |
