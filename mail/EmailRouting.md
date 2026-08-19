# 独自ドメインメール構成ガイド
### Gmailエイリアス + Cloudflare Email Routing + Amazon SES

個人ドメイン `example.com` を例に、Gmail・Cloudflare・Amazon SESを組み合わせて
独自ドメインのメール送受信基盤を構築した際の設定手順と、その裏側の仕組みを
まとめた記録です。単なる操作手順だけでなく、なぜその設定が必要なのか、
DNS・SMTP・SPF/DKIM/DMARCがそれぞれ何をしているのかを、再構築・他者説明が
できるレベルまで掘り下げています。

## 目次

1. [全体像](#全体像)
2. [前提知識: SMTPの「2つの送信者」](#前提知識-smtpの2つの送信者)
3. [Part 1: Cloudflare Email Routing(受信)](#part-1-cloudflare-email-routing受信)
4. [Part 2: Gmailエイリアス(送信の入り口)](#part-2-gmailエイリアス送信の入り口)
5. [Part 3: Amazon SES(送信の実体・DKIM署名)](#part-3-amazon-ses送信の実体dkim署名)
6. [Part 4: DMARCレコードとアライメントの仕組み](#part-4-dmarcレコードとアライメントの仕組み)
7. [Part 5: 迷惑メール判定のトラブルシューティング記録](#part-5-迷惑メール判定のトラブルシューティング記録)
8. [Part 6: 診断ツール一覧](#part-6-診断ツール一覧)
9. [最終的なDNSレコード一覧](#最終的なdnsレコード一覧)
10. [トラブルシューティングまとめ表](#トラブルシューティングまとめ表)

---

## 全体像

### アーキテクチャ図

```
【受信】
外部送信者 → DNS(MXレコード参照) → Cloudflare Email Routing
    → (Cloudflareが独自DKIM署名して中継) → Gmail受信箱

【送信】
自分(Gmail Web UI) → SMTP AUTH → Amazon SES
    → (SESがexample.comのDKIM鍵で署名、Custom MAIL FROMでSPFアライメントも確保)
    → インターネット上の相手先MTA

【DNSが担う役割】
MX     : 受信の窓口をCloudflareに指定
SPF    : どのIP/サービスがexample.comとして送信してよいかを列挙
DKIM   : 公開鍵を公開し、署名の検証を可能にする
DMARC  : SPF/DKIMの結果をどう扱うか(ポリシー)と、集計レポートの送付先を指定
```

### 一言まとめ

> 受信はCloudflareという信頼できる中継所に一旦受けてもらい、そこからGmailに
> 転送してもらう。送信はGmailを入力画面として使うだけで、実際の配送と署名
> (DKIM)はAmazon SESという専門業者に代行してもらう。どちらも「自分のドメイン
> の正当性」をSPF/DKIM/DMARCというDNSベースの仕組みで証明しながら、実際の
> 重労働(24時間稼働・レピュテーション管理・鍵管理)は専門サービスに任せている。

### 最終構成

| 経路 | 使用サービス | 役割 |
|---|---|---|
| 受信 | Cloudflare Email Routing | MXを受け、Gmailアドレスへ転送 |
| 送信 | Gmail(SMTP経由でAmazon SESに中継) | 独自ドメインを差出人としたメール作成・送信、DKIM署名はSES側 |
| DNS | Cloudflare | MX/SPF/DKIM/DMARC/Custom MAIL FROMを一元管理 |

---

## 前提知識: SMTPの「2つの送信者」

すべての仕組みを理解する鍵は、SMTPには**エンベロープ送信者(Envelope-From)**
と**ヘッダー送信者(Header-From)**という、別々の"差出人"情報が存在するという
点です。

| 種類 | 該当プロトコル | 役割 | 目に見える場所 |
|---|---|---|---|
| Envelope-From | SMTPコマンドの`MAIL FROM:` | 配送エラー時の返送先(Return-Path)。SPFはこちらを検証 | 通常は非表示(ヘッダーの`Return-Path:`で確認可) |
| Header-From | メール本文中の`From:`ヘッダー | 受信者が実際に「差出人」として見る表示。DKIM/DMARCはこちらとの整合性を見る | メールソフトの「差出人」欄 |

この2つは**本来一致している必要がない**という仕様上の緩さが、なりすまし
(スプーフィング)を可能にしてしまう弱点であり、それを塞ぐためにSPF・DKIM・
DMARCが存在します。この前提を踏まえて各パートを見ていきます。

---

## Part 1: Cloudflare Email Routing(受信)

### 1-1. MXレコードとは何を指定しているのか

MXレコードは「このドメイン宛のメールを、どのSMTPサーバーに配送すればよいか」
を示すDNSレコードです。外部の送信者(のMTA)は、あなた宛にメールを送る際、
必ず以下の手順を踏みます。

```
1. 送信側MTAが example.com の MXレコードをDNS問い合わせ
2. 優先度(Preference値)が最も低いレコードから順に接続を試行
3. 接続先(この場合 routeN.mx.cloudflare.net)にSMTPで配送(ポート25)
```

つまり**MXレコードを書き換えるだけで、「誰が受信の窓口になるか」を完全に
切り替えられる**というのがDNSベースのメールルーティングの本質です。

### 1-2. Cloudflare Email Routingの内部動作(転送の技術的な中身)

Cloudflare Email Routingは、単純な「メール自動転送(Forward)」に見えて、
実際には**インバウンドSMTPリレー兼ゲートウェイ**として動作しています。

```
外部送信者
   │ SMTP (MAIL FROM: 送信者@他ドメイン, RCPT TO: user@example.com)
   ▼
Cloudflareのroute*.mx.cloudflare.net (Anycast, グローバル分散インフラ)
   │ Cloudflare内部でルーティングルールを評価
   │ (Catch-all / 個別アドレスルールに従い転送先を決定)
   ▼
Cloudflareが「新たな送信者」としてGmail宛にSMTP再送信(リレー)
   │ この際、CloudflareはDKIM署名(セレクタ: cf2024-1)を独自に付与
   ▼
Gmailの受信MTAが着信
```

### 1-3. 「直接受信」ではなく「転送」させるメリット

| メリット | 説明 |
|---|---|
| 固定IP・24時間稼働が不要 | Anycastの巨大インフラが窓口になるため、自宅回線の状態に左右されない |
| IPレピュテーションの恩恵 | Cloudflareの信頼された送信元として中継されるため、家庭用IPの評判低下の影響を受けない |
| スパムフィルタ・DDoS耐性 | Cloudflare側である程度のフィルタリング・攻撃対策が行われる |
| 保守コストゼロ | 証明書・OSパッチ・ミドルウェア管理が不要 |
| ストレージ管理不要 | Gmailの検索・ラベル機能をそのまま使える |

つまり「直接自宅で受ける」代わりに「信頼性の高い中継点を間に挟む」ことで、
可用性・レピュテーション・保守性を同時に解決しているのが、この構成の本質です。

### 1-4. 設定手順

1. Cloudflareダッシュボード → 対象ドメイン →「Email」→「Email Routing」
2. 「Get started」でMXレコード(3本)とSPF用TXTレコードが自動追加される

```
MX  example.com  10  routeN.mx.cloudflare.net.   (3本、優先度は自動割当)
```

3. 「Routing rules」タブでCatch-all、または個別アドレス(例: `user@example.com`)の
   転送先をGmailアドレスに設定
4. 初回のみGmail側でCloudflareからの所有権確認メールを承認
5. 受信テスト成功後、旧サーバー用のMXレコードがあれば削除

> **つまずきポイント**: 送信元と転送先が同一Gmailアカウントだと、Gmailの
> 重複排除機能により受信箱に表示されないことがある。テストは**必ず別のメール
> アドレスから**送信すること。

### 1-5. キャッチオールルールの要否

`user@`以外の任意のアドレス宛メールもすべて転送する「キャッチオール」は、
スパム業者のランダム送信も拾ってしまう副作用があります。

- 複数アドレスを使い分ける・想定外の宛先も拾いたい → 有効のまま
- 特定アドレスのみ運用する → 無効化してスパム流入を防ぐ

---

## Part 2: Gmailエイリアス(送信の入り口)

### 2-1. パターン1(Gmail自体のサーバー経由)で何が起きるか

「他のメールアドレスから送信」で「別のSMTPサーバーを使用」のチェックを
外した場合、Gmailの挙動は以下の通りです。

1. Gmail Web UIで作成したメールを、**Googleの送信MTAがそのまま送信**
2. `Header-From:` は指定通り `user@example.com` に書き換えられる
3. `Envelope-From(MAIL FROM)` も `user@example.com` に設定される
4. しかし **DKIM署名は`d=gmail.com`で行われる**。Googleは`example.com`の
   秘密鍵を持っていないため、これは当然の挙動

### 2-2. なぜこれが問題になるのか(DMARCアライメントの破綻)

DMARCは「SPFかDKIMのどちらかで、**Header-Fromのドメインと一致
(アライメント)**していること」を要求します。

```
Header-From: user@example.com
DKIM署名:    d=gmail.com   ← 不一致(アライメント失敗)
SPF検証対象: example.comのSPFレコード ← Googleの送信IPが含まれていなければ失敗
```

`_spf.google.com`をSPFに追加すればSPF側は通せますが、DKIMは原理的に
`gmail.com`のままなので、大手プロバイダの内部スパムスコアリング(送信元IP
の評判、コンテンツ解析など)を突破できず、迷惑メール判定が続く原因になり
ました(詳細はPart5)。

### 2-3. パターン2(外部SMTPサーバーを使用)との違い

「別のSMTPサーバーを使用して送信」にチェックを入れてSESの認証情報を登録
すると、Gmailの役割が根本的に変わります。

| 項目 | パターン1 | パターン2(SES) |
|---|---|---|
| Gmailの役割 | UI + 実際の送信MTA | **単なるUI(メール作成画面)のみ** |
| 実際に送信するサーバー | Googleのインフラ | **Amazon SES** |
| DKIM署名者 | Google(`d=gmail.com`) | **SES(`d=example.com`)** |
| Envelope-From | `user@example.com`(Google送信時) | SESが制御(Custom MAIL FROM次第) |

つまりパターン2では、Gmailは「メールを作成してSESにSMTP経由で渡すクライアント」
に過ぎず、実際の配送・署名はすべてAmazon SES側の責任になります。この構造
変化が、DKIMアライメントを実現する本質です。

### 2-4. 設定手順(最終形・SES連携)

1. Gmail →「設定」→「アカウントとインポート」→「他のメールアドレスを追加」
2. 名前と `user@example.com` を入力
3. 「別のSMTPサーバーを使用して送信」に**チェックを入れ**、SESのSMTP情報
   (後述Part3で発行)を入力
4. 確認コードが `user@example.com` 宛に送られ、Part1の転送ルールでGmail
   受信箱に届く。コードを入力してエイリアスを確認完了

> **つまずきポイント**: 「送信ボタンが押せない」場合、多くはエイリアスの
> 本人確認(所有権確認)が完了していないことが原因。「確認済み」表示になって
> いるか確認する。

---

## Part 3: Amazon SES(送信の実体・DKIM署名)

### 3-1. SESが担っている役割

SESは「送信専用のSMTPリレーサービス」です。Gmailから見ると、SESは単なる
「外部SMTPサーバー」の1つに過ぎませんが、内部では以下を行っています。

1. **SMTP AUTH認証**: 発行されたIAMベースのSMTPユーザー名/パスワードで送信元を認証
2. **DKIM署名の付与**: `example.com`用に生成された秘密鍵で、送信メールの
   ヘッダー・本文ハッシュに署名(`DKIM-Signature: d=example.com; s=<セレクタ>...`)
3. **配送(実際のインターネットへの送出)**: SESの大規模送信インフラから
   実際に相手先MTAへSMTP配送
4. **バウンス・苦情処理**: 配送失敗やスパム報告のフィードバック(本格運用では重要)

### 3-2. ドメインIDの作成(設定手順)

1. AWSコンソール → SES → リージョン選択(例: 東京 `ap-northeast-1`)
2. 「Identities」→「Create identity」→ **「Domain」を選択**
   (「Email address」ではなくこちらを選ぶのがポイント。個別アドレスの
   検証ではドメイン全体のDKIM自動署名が使えない)
3. ドメイン名に `example.com` を入力し、「Easy DKIM」を有効のまま作成

> **つまずきポイント**: SESコンソールの入り口によっては、いきなり
> 「メールアドレスを追加」という個別アドレス検証の古い画面に直接遷移する
> ことがある。その場合は一度キャンセルし、左メニューの「Identities」一覧
> から「Create identity」→「Domain」を選び直す。

### 3-3. Easy DKIMの技術的な仕組み(なぜCNAMEなのか)

SESの「Easy DKIM」は、通常のDKIM設定(TXTレコードに公開鍵を直接記載)とは
異なり、**CNAMEで中間ホスト名を指す**方式を採っています。

```
<トークン>._domainkey.example.com  CNAME  <トークン>.dkim.amazonses.com
```

これは以下の理由によります。

- DKIMの公開鍵は本来TXTレコードに直接記載するのが標準的な方式ですが、
  **鍵のローテーション(定期的な鍵の入れ替え)のたびにDNS側の変更が必要**
  になってしまいます
- CNAMEで委任しておけば、**SES側(amazonses.com側)が指す先の内容を更新
  するだけで、ユーザー側のDNSは一切変更不要**で自動ローテーションが完結
  します

**設定手順**: 表示された3本のCNAMEをCloudflare DNSに追加(「名前」欄は
`<トークン>._domainkey`のみ入力、**プロキシステータスは必ず「DNSのみ」
(グレー雲)**にする)。反映後、SES側のステータスが「検証済み」になるまで
待つ(数分〜最大72時間)。

### 3-4. サンドボックス解除(本番アクセス)

SESアカウントダッシュボードで「本番アクセスをリクエスト」の状態を確認。
未解決の場合は申請が必要(用途・想定送信数を記入)。承認されると日次送信
クォータが大幅に増える(例: 50,000通/24時間)。

### 3-5. SMTP認証情報の発行

1. SESコンソール →「SMTP settings」→「Create SMTP credentials」
2. IAMユーザーが自動作成され、SMTPユーザー名・パスワードが表示される
   (**この画面でしか表示されないため、CSVをダウンロードして必ず保存**)
3. SMTPエンドポイント(例: `email-smtp.ap-northeast-1.amazonaws.com`)も
   控える(リージョンによって値が変わる)

### 3-6. Custom MAIL FROMドメインの意味(最大のハマりどころ)

SESのデフォルト状態では、Envelope-From(MAIL FROM/Return-Path)が以下の
ようになります。

```
MAIL FROM: <ランダム文字列>@<リージョン>.amazonses.com
```

これは`example.com`とは無関係のドメインです。DKIMは`d=example.com`で
合格していても、**SPFの検証対象であるEnvelope-Fromのドメインが
`amazonses.com`のままだと、DMARCの「SPFアライメント」は不成立**になります
(DMARCはHeader-Fromと同一の"組織ドメイン"であることを要求するため)。

これを解消するのが Custom MAIL FROM です。

**設定手順**: SESコンソール →「Identities」→ 対象ドメイン →「Custom MAIL
FROM domain」→「Edit」→ サブドメインに `mail.example.com` を入力して保存。
表示されるMXレコードとTXT(SPF)レコードをCloudflareに追加:

```
MX   mail.example.com   10  feedback-smtp.<リージョン>.amazonses.com
TXT  mail.example.com   "v=spf1 include:amazonses.com ~all"
```

これにより、Envelope-Fromが `xxxx@mail.example.com` のように**`example.com`
のサブドメイン**になります。DMARCは「Organizational Domain(組織ドメイン)」
レベルでの一致を見るため、サブドメインでも`example.com`として認識され、
SPFアライメントが成立するようになります。

### 3-7. GmailのSMTP設定をSESに差し替え

Gmail →「アカウントとインポート」→ 対象エイリアスの「情報を編集」で以下に変更。

| 項目 | 値 |
|---|---|
| SMTPサーバー | `email-smtp.<リージョン>.amazonaws.com` |
| ポート | `587` |
| ユーザー名 | SESで発行したSMTPユーザー名 |
| パスワード | SESで発行したSMTPパスワード |
| セキュリティ | TLS |

### 3-8. SPFレコードの更新

```
v=spf1 include:_spf.mx.cloudflare.net include:amazonses.com ~all
```

---

## Part 4: DMARCレコードとアライメントの仕組み

### 4-1. DMARCレコードの設定

```
タイプ: TXT
名前:   _dmarc
値:     v=DMARC1; p=none; rua=mailto:user@example.com
```

`p=none`は「認証失敗しても拒否せずレポートのみ受け取る」設定。個人利用
ではこれで十分(いきなり`p=quarantine`や`p=reject`にすると正規メールまで
ブロックされるリスクがある)。

### 4-2. DKIMとSPF、どちらか一方でDMARCが合格する理由

DMARCの仕様(RFC 7489)では、以下のいずれかを満たせば合格(pass)とする
設計になっています。

```
DMARC合格 = (SPF pass かつ SPFアライメント一致) OR (DKIM pass かつ DKIMアライメント一致)
```

これは、**メール転送(Forwarding)によってSPFが壊れやすいという実運用上の
事情**を考慮した設計です。転送されるとEnvelope-Fromの送信元IPが変わるため
SPFは高確率で失敗しますが、本文・ヘッダーに対する電子署名であるDKIMは、
内容が改変されなければ転送後も有効なままです。この「OR条件」があるおかげで、
Cloudflareの転送(受信側)でもGmail/SESの送信でも、どちらか片方さえ揃えば
正規メールとして扱われる、という設計になっています。

### 4-3. DMARC集計レポートの読み方

`rua=`で指定したアドレス宛に、Google等から定期的にXML形式の集計レポートが
届きます。主な項目は以下の通りです。

| 項目 | 意味 |
|---|---|
| `source_ip` | 送信元IPアドレス |
| `spf` / `dkim` | それぞれの検証結果(pass/fail) |
| `disposition` | ポリシーに従い実施された処置(none/quarantine/reject) |
| `header_from` | 検証対象となったHeader-Fromのドメイン |

過去にGmail自体のサーバー経由(パターン1)で送信していた記録が残っている
場合、その送信元IP(Googleのメールサーバー)についてはDKIM/SPFとも`fail`
と記録されることがありますが、SES移行後の送信のみが今後継続的に`pass`と
記録されていれば、移行は正しく完了しています。

---

## Part 5: 迷惑メール判定のトラブルシューティング記録

技術設定を一通り終えた後も発生した問題と、その原因切り分けの記録です。

### 5-1. SPF追加だけでは解決しなかった問題

パターン1(Gmail自体のサーバー経由)運用時、SPFに`include:_spf.google.com`
を追加しても迷惑メール判定は解消しなかった。mail-tester.comで確認したところ、
DMARC不合格・SpamAssassinでの大幅減点が判明。原因はDKIMが`d=gmail.com`の
まま署名され続けていたこと。→ **Amazon SES導入(Part3)で解決**。

### 5-2. DMARCレコード追加直後にスコアが悪化した問題

SES導入後、DMARCレコードを追加した直後、mail-testerのスコアが悪化した
(6.3→5.7)。原因は、DMARCレコードがなかった時は「未設定」として軽い減点
だったのに対し、レコード追加によって**厳密な合否判定**が行われるようになり、
別の潜在的な不整合(Custom MAIL FROM未設定によるSPFアライメント不一致)が
表面化したため。→ **Custom MAIL FROMドメイン設定(3-6)で解決**。

### 5-3. 技術設定完了後も残った課題(レピュテーション)

SPF・DKIM・DMARC・Custom MAIL FROMをすべて正しく設定した後も、一部の相手先
で迷惑メールフォルダに入る、Outlookで「不明な送信者」警告が出る現象が残った。

MXToolbox・internet.nlともに技術設定は「合格」と判定しており、原因は
**認証設定ではなく、ドメイン・送信元IPの送信実績(レピュテーション)がまだ
確立されていないこと**と判断。新規ドメイン・新規SES送信元は実績ゼロから
のスタートとなり、大手プロバイダが慎重に扱う期間が数日〜数週間ほど発生する
のが一般的。

**対処方針**: 特効薬はなく、実績を積むことで解消していく問題として運用を
継続。受信者側で「迷惑メールではない」と手動マーク、または連絡先に登録して
もらう、少量でも継続的に送受信を行う、Google Postmaster Toolsで評価の推移
を定期的に確認する、といった対応を行う。

---

## Part 6: 診断ツール一覧

| ツール | URL | 特徴 |
|---|---|---|
| mail-tester.com | https://www.mail-tester.com | 実際にテストメールを送って総合スコア診断。無料は回数制限あり |
| MXToolbox | https://mxtoolbox.com | DNS設定(SPF/DKIM/DMARC)の構文・反映チェック。登録不要 |
| internet.nl | https://internet.nl | オランダ政府系の公的診断ツール。登録不要、SPF/DKIM/DMARC/TLSを総合診断 |
| Google Postmaster Tools | https://postmaster.google.com | Gmail側から見た自ドメインの送信レピュテーションを確認 |
| Microsoft SNDS | https://sendersupport.olc.protection.outlook.com/snds/ | 送信元IPのレピュテーションを確認(Outlook/Hotmail向け) |

---

## 最終的なDNSレコード一覧

| タイプ | 名前 | 値(概要) | 用途 |
|---|---|---|---|
| MX | example.com | route1〜3.mx.cloudflare.net | 受信(Cloudflare Email Routing) |
| TXT | example.com | `v=spf1 include:_spf.mx.cloudflare.net include:amazonses.com ~all` | SPF |
| CNAME ×3 | `<トークン>._domainkey.example.com` | `<トークン>.dkim.amazonses.com` | DKIM(SES Easy DKIM) |
| MX | mail.example.com | `feedback-smtp.<リージョン>.amazonses.com` | Custom MAIL FROM |
| TXT | mail.example.com | `v=spf1 include:amazonses.com ~all` | Custom MAIL FROM用SPF |
| TXT | _dmarc.example.com | `v=DMARC1; p=none; rua=mailto:user@example.com` | DMARC |

---

## トラブルシューティングまとめ表

| 症状 | 原因 | 対処 |
|---|---|---|
| Cloudflareのテスト転送メールが受信箱に見当たらない | 同一Gmailアカウント間の重複排除 | 別アドレスから再テスト |
| Gmailエイリアス追加時、SMTP欄に`route*.mx.cloudflare.net`が自動入力される | 受信専用MXが誤って提示されている | `smtp.gmail.com`(または後述のSESエンドポイント)に修正 |
| Gmailで送信ボタンが押せない | エイリアスの本人確認未完了 | 「確認済み」表示を確認、未確認ならテスト受信を先に完了 |
| SPF追加だけでは迷惑メール判定が解消しない | DKIMが`d=gmail.com`のままアライメント不一致 | Amazon SES等で独自ドメインDKIM署名に切り替え |
| DMARCレコード追加後にスコアが悪化 | Custom MAIL FROM未設定でSPFアライメント不一致が顕在化 | SESでCustom MAIL FROMドメインを設定 |
| 認証設定が全て正常でも迷惑メール判定・不明な送信者警告が残る | 送信ドメイン・IPのレピュテーション不足(新規ドメインのため) | 時間をかけて送信実績を積む、受信者に手動マークしてもらう |
