# example.com メール移行手順書
### Raspberry Pi(Postfix/Dovecot) → Cloudflare Email Routing + Gmail

## 目次

1. [背景と目的](#背景と目的)
2. [移行後の構成](#移行後の構成)
3. [Step1: Cloudflareへドメイン管理を移す](#step1-cloudflareへドメイン管理を移す)
4. [Step2: Cloudflare Email Routingを有効化](#step2-cloudflare-email-routingを有効化)
5. [Step3: 受信の転送ルールを作成](#step3-受信の転送ルールを作成)
6. [Step4: MXレコードをCloudflare側へ一本化](#step4-mxレコードをcloudflare側へ一本化)
7. [Step5: GmailでSMTP経由の送信元エイリアスを登録](#step5-gmailでsmtp経由の送信元エイリアスを登録)
8. [Step6: 所有権確認とテスト送信](#step6-所有権確認とテスト送信)
9. [Step7: SPFレコードを受信専用に整理](#step7-spfレコードを受信専用に整理)
10. [運用メモ・トラブルシューティング](#運用メモトラブルシューティング)
11. [将来の拡張(Amazon SES導入)](#将来の拡張amazon-ses導入)

---

## 背景と目的

Raspberry Pi上のPostfix + Dovecotで自前運用していたメールサーバー(mail.example.com)で、eonet回線のOP25B回避のための転送設定が原因と見られる**送信不可**の問題が発生。改善案として以下2案を比較検討した。

- **A案**: Postfix構成を維持し、送信リレーをSendGrid等に差し替え
- **B案**: Raspyを廃止し、受信はCloudflare Email Routing、送信はGmailのエイリアス機能を利用

検討の結果、SendGridは無料プランが廃止済み(2025年5月〜、60日トライアルのみ)でコストが見合わないと判断し、**B案(SendGridなし・Gmail自体のサーバー経由で送信するパターン)**を採用。

## 移行後の構成

| 経路 | 使用サービス | 役割 |
|---|---|---|
| 受信 | Cloudflare Email Routing | MXを受け、Gmailアドレスへ無料転送 |
| 送信 | Gmail(smtp.gmail.com、アプリパスワード認証) | example.comを差出人としたメール作成・送信(via gmail.com表示) |
| DNS | Cloudflare | MX/SPF/DKIM(受信用)を一元管理 |

---

## Step1: Cloudflareへドメイン管理を移す

1. Cloudflareに無料アカウントを作成し、「サイトを追加」でexample.comを入力
2. 既存DNSレコードの自動インポート内容を確認
3. Cloudflareが指定するネームサーバー2つを控える
4. ドメインのレジストラ管理画面でネームサーバーをCloudflare指定のものに変更
5. Cloudflareダッシュボードでステータスが「アクティブ」になれば反映完了

## Step2: Cloudflare Email Routingを有効化

1. Cloudflareダッシュボード → 対象ドメイン →「Email」→「Email Routing」
2. 「Get started」でMXレコード(3本)とSPF用TXTレコードが自動追加される

実際に反映されたレコード:

```
MX  example.com  48  route1.mx.cloudflare.net.
MX  example.com  56  route2.mx.cloudflare.net.
MX  example.com  95  route3.mx.cloudflare.net.
TXT cf2024-1._domainkey.example.com  "v=DKIM1; h=sha256; k=rsa; p=..."
```

3. 既存Raspy用MXレコードとの優先度競合がないか確認(この段階では削除しない)

## Step3: 受信の転送ルールを作成

1. Email Routing →「Routing rules」タブ
2. Catch-all、および個別アドレス(例: `user@example.com`)の転送先をGmailアドレスに設定
3. 初回のみGmail側でCloudflareからの所有権確認メールを承認
4. **テスト送信時の注意**: 送信元と転送先が同一Gmailアカウントだと、Gmailの重複排除機能により受信箱に表示されないことがある(Cloudflareからその旨の通知メールが届く)。**必ず別のメールアドレスから**テスト送信すること

## Step4: MXレコードをCloudflare側へ一本化

1. 受信テスト成功後、Raspy用の旧MXレコードを削除
2. `dig MX example.com` でCloudflareの3レコードのみ返ることを確認

## Step5: GmailでSMTP経由の送信元エイリアスを登録

1. Gmail →「アカウントとインポート」→「他のメールアドレスを追加」
2. 名前とメールアドレス(`user@example.com`)を入力
3. SMTPサーバー欄は自動的に受信用の`route1.mx.cloudflare.net`等が入力される場合があるが、**これは受信専用MXであり送信認証には使えないため、以下の値に修正する**

| 項目 | 入力値 |
|---|---|
| SMTPサーバー | `smtp.gmail.com` |
| ポート | `587` |
| ユーザー名 | 自分のGmailアドレス(フル) |
| パスワード | Googleアカウントの「アプリパスワード」(16桁) |
| セキュリティ | TLS |

アプリパスワードの発行手順:

1. Googleアカウント → セキュリティ → 2段階認証を有効化(未設定なら先に必須)
2. 同ページの「アプリパスワード」から新規発行
3. 表示された16桁をパスワード欄に入力

## Step6: 所有権確認とテスト送信

1. 確認コードが `user@example.com` 宛に送られ、Step3の転送ルールでGmail受信箱に届く
2. コードを入力してエイリアスの確認を完了(「確認済み」表示になればOK)
3. 新規メール作成時、差出人プルダウンから `user@example.com` を選択して送信テスト
4. **送信ボタンが押せない場合の主な原因**: エイリアスの本人確認が未完了。「アカウントとインポート」欄で「確認待ち」表示が残っていないか確認する

## Step7: SPFレコードを受信専用に整理

1. 既存のSPF(TXT)レコードからeonetリレー用の`include`記述を削除
2. Cloudflare Email Routing用のみに整理:

```
v=spf1 include:_spf.mx.cloudflare.net ~all
```

3. 送信はGmail自体のサーバーが行うため、example.com側のSPFに送信元を追加する必要はない

---

## 運用メモ・トラブルシューティング

| 症状 | 原因・対処 |
|---|---|
| テスト送信したのに受信箱に届かない | Gmail同一アカウント間の重複排除が原因のことが多い。別アドレスから再テスト |
| Gmailで送信ボタンが押せない | エイリアスの本人確認未完了が主因。「確認済み」表示を確認 |
| SMTPサーバー欄に`route1.mx.cloudflare.net`等が自動入力される | 受信専用MXのため使用不可。`smtp.gmail.com`に修正する |
| キャッチオールルールの要否 | `user@`以外の宛先にも将来メールが来る想定なら有効のまま、`user@`のみで運用するなら無効化してスパム流入を防ぐ |

## 将来の拡張(Amazon SES導入)

現状は「Gmail自体のサーバー経由(via gmail.com表示)」での送信だが、独自ドメインでの見た目統一や送信量増加に備え、将来的にAmazon SESを導入してDKIM署名を本格対応する予定。その際はSES側でドメイン検証・DKIM用CNAMEの追加・SMTP認証情報の発行が必要になる。
