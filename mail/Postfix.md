# Postfix(メールサーバーの構築)

Postfix(送信・受信を扱うMTA)とDovecot(IMAP/POPでメールを受信するためのサーバー)を使い、独自ドメインでメールサーバーを構築する手順をまとめます。OP25B対策(プロバイダ経由のリレー)を伴う構成です。

## 目次

- [参考リンク](#参考リンク)
- [1. Postfixのインストール](#1-postfixのインストール)
- [2. 初期設定ウィザード](#2-初期設定ウィザード)
- [3. main.cfの設定](#3-maincfの設定)
- [4. TLS証明書の取得(Let's Encrypt)](#4-tls証明書の取得lets-encrypt)
- [5. プロバイダ認証情報の設定](#5-プロバイダ認証情報の設定)
- [6. 送信元アドレスの変換(sender_canonical)](#6-送信元アドレスの変換sender_canonical)
- [7. OpenDKIM連携](#7-opendkim連携)
- [8. 設定の確認と反映](#8-設定の確認と反映)
- [9. ファイアウォール・ポート開放](#9-ファイアウォールポート開放)
- [Dovecot(IMAP/POPサーバー)](#dovecotimappopサーバー)
- [動作確認(コマンドでのテスト送信)](#動作確認コマンドでのテスト送信)
- [トラブルシューティング](#トラブルシューティング)

---

## 参考リンク

- [Ubuntu 20.04にPostfixをインストールして設定する方法](https://www.digitalocean.com/community/tutorials/how-to-install-and-configure-postfix-on-ubuntu-20-04-ja)
- [eo光環境でPostfixによるOP25B対策](https://lv73.net/eo-op25b/)
- [PostfixでSTARTTLSを有効にしてみる](https://www.sendmagic.jp/techinfo/starttls-postfix/)
- [Postfixのセキュリティ対策](http://www.criterion.sc/sub_notes/Postfix_Security.html)

---

## 1. Postfixのインストール

```bash
sudo apt install postfix sasl2-bin
```

---

## 2. 初期設定ウィザード

| 質問項目 | 回答 |
|---|---|
| メール設定の一般的なタイプ | **Internet Site** |
| システムメール名 | `example.com`(`mail.example.com` ではなくドメイン本体を指定) |
| root・postmasterのメール受信者 | プライマリのLinuxアカウントユーザー名 |
| メールを受信する他の宛先 | `$myhostname`, `example.com`, `mail.example.com`, `localhost.example.com`, `localhost` |
| メールキューの同期更新を強制するか | **No** |
| ローカルネットワーク | `127.0.0/8 [::ffff:127.0.0.0]/104 [::1]/128` |
| メールボックスのサイズ制限 | `0`(無制限) |
| ローカルアドレス拡張文字 | `+` |
| 使用するインターネットプロトコル | **IPv4のみ**(IPv6未対応環境の場合) |

### 設定ウィザードを再実行したい場合

```bash
sudo dpkg-reconfigure postfix
```

---

## 3. main.cfの設定

```bash
sudo nano /etc/postfix/main.cf
```

```ini
biff = no
append_dot_mydomain = no
readme_directory = no
compatibility_level = 2

# 基本設定
myhostname = mail.example.com
mydomain = example.com
myorigin = $mydomain
mydestination = $myhostname, example.com, localhost.localdomain, localhost

# ネットワーク待受(外部からの接続を受け付ける)
inet_interfaces = all
inet_protocols = ipv4
mynetworks = 127.0.0.0/8 [::ffff:127.0.0.0]/104 [::1]/128

# メールボックス
home_mailbox = Maildir/
mailbox_size_limit = 0
recipient_delimiter = +
message_size_limit = 40960000

# エイリアス
alias_maps = hash:/etc/aliases
alias_database = hash:/etc/aliases

# リレーホスト(OP25B対策)
relayhost = [smtpauth.eonet.ne.jp]:587

# SASL認証(プロバイダへのリレー送信用)
smtp_sasl_auth_enable = yes
smtp_sasl_password_maps = hash:/etc/postfix/isp_auth
smtp_sasl_security_options = noanonymous
smtp_sasl_mechanism_filter = plain, login

# 送信側TLS
smtp_use_tls = yes
smtp_tls_security_level = may
smtp_tls_CAfile = /etc/ssl/certs/ca-certificates.crt
smtp_tls_session_cache_database = btree:${data_directory}/smtp_scache
smtp_tls_loglevel = 1
smtp_address_preference = ipv4

# 受信側TLS(Let's Encrypt証明書。取得方法は4章を参照)
smtpd_use_tls = yes
smtpd_tls_cert_file = /etc/letsencrypt/live/mail.example.com/fullchain.pem
smtpd_tls_key_file = /etc/letsencrypt/live/mail.example.com/privkey.pem

# 受信側SASL認証(Dovecot経由)
smtpd_sasl_type = dovecot
smtpd_sasl_path = private/auth
smtpd_sasl_auth_enable = yes

# 受信制限(スパム・不正中継対策)
smtpd_recipient_restrictions =
    permit_mynetworks,
    permit_sasl_authenticated,
    reject_unauth_destination,
    reject_unknown_recipient_domain,
    reject_non_fqdn_recipient,
    reject_invalid_hostname,
    reject_non_fqdn_sender,
    reject_unknown_sender_domain

smtpd_relay_restrictions = permit_mynetworks, permit_sasl_authenticated, reject_unauth_destination

smtpd_sender_restrictions = permit_mynetworks, reject_unknown_sender_domain, reject_non_fqdn_sender

smtpd_helo_required = yes
smtpd_helo_restrictions =
    permit_mynetworks,
    reject_invalid_helo_hostname,
    reject_non_fqdn_helo_hostname,
    reject_unknown_helo_hostname

# MTA情報の隠蔽
smtpd_banner = $myhostname ESMTP unknown
disable_vrfy_command = yes

# 送信元アドレスの変換(6章を参照)
sender_canonical_maps = hash:/etc/postfix/sender_canonical
sender_canonical_classes = envelope_sender, header_sender

# OpenDKIM連携(7章を参照)
milter_default_action = accept
milter_protocol = 6
smtpd_milters = inet:localhost:8891
non_smtpd_milters = inet:localhost:8891

# 日本語ヘッダを含むメールをOP25Bリレー経由で送る際の必須設定
smtputf8_enable = no
```

### 主要パラメータの意味

| パラメータ | 内容 |
|---|---|
| `inet_interfaces = all` | 外部ネットワークからの接続を受け付ける。`loopback-only` のままだと外部から一切メールを受信できない |
| `relayhost` | OP25B対策として、自ドメインからの送信をプロバイダのSMTPサーバー経由で中継する指定 |
| `smtpd_sasl_type = dovecot` | ユーザー認証をDovecot経由で行う指定(後述のDovecot設定と連動) |
| `sender_canonical_maps` | 送信者アドレスを、リレー先プロバイダが許可するアカウントに書き換える(6章で詳説) |
| `smtputf8_enable = no` | プロバイダのリレーサーバーがSMTPUTF8拡張に非対応の場合、`no` にしないと日本語ヘッダを含むメールが `bounced` になる |
| `disable_vrfy_command` | `VRFY` コマンド(アカウント存在確認)を無効化し、内部ユーザー名の推測を防ぐ |

---

## 4. TLS証明書の取得(Let's Encrypt)

Cloudflareのオリジン証明書などをそのままメールサーバーに流用すると、一般のメールクライアントから「信頼されない証明書」として拒否されるため、**公開CAが発行するLet's Encrypt証明書を別途取得**します。

### インストール

```bash
sudo apt install certbot
```

すでに `python3-certbot-nginx` を入れていてプラグインエラーが出る場合は、standaloneモードのみで運用するため削除して問題ありません。

```bash
sudo apt remove --purge python3-certbot-nginx
```

### 証明書の取得(nginxなど80番ポートを使うサービスがある場合)

```bash
sudo systemctl stop nginx
sudo certbot certonly --standalone -d mail.example.com --preferred-challenges http
sudo systemctl start nginx
```

証明書は以下に生成されます。

```
/etc/letsencrypt/live/mail.example.com/fullchain.pem
/etc/letsencrypt/live/mail.example.com/privkey.pem
```

### 自動更新の設定

`--standalone` は更新のたびに80番ポートを使うサービスと衝突するため、更新前後にそのサービスを自動で止め・再開させるフックを設定します。

```bash
sudo nano /etc/letsencrypt/renewal/mail.example.com.conf
```

`[renewalparams]` セクションに以下を追加します。

```ini
pre_hook = systemctl stop nginx
post_hook = systemctl start nginx
```

### 更新テスト

```bash
sudo certbot renew --dry-run --cert-name mail.example.com
```

`Congratulations, all simulated renewals succeeded` と表示されればOKです。

---

## 5. プロバイダ認証情報の設定

`relayhost` で指定したプロバイダのSMTPサーバーへの認証情報を設定します。

```bash
sudo nano /etc/postfix/isp_auth
```

```
[smtpauth.eonet.ne.jp]:587 プロバイダのSMTPアカウント:パスワード
```

```bash
sudo chmod 600 /etc/postfix/isp_auth
sudo postmap /etc/postfix/isp_auth
```

---

## 6. 送信元アドレスの変換(sender_canonical)

多くのプロバイダは、**リレーを許可している自社アカウントを名乗るメールしか中継しません**。ローカルのLinuxユーザー(`pi`など)や自ドメイン(`example.com`)のアドレスのまま送信すると、以下のように拒否されます。

```
550 5.7.1 Sender rejected (in reply to MAIL FROM command)
```

これを避けるため、送信者アドレスをプロバイダのアカウントに書き換える設定を行います。

```bash
sudo nano /etc/postfix/sender_canonical
```

```
pi@raspberrypi        プロバイダのアカウント@プロバイダのドメイン
root@raspberrypi       プロバイダのアカウント@プロバイダのドメイン
@raspberrypi           @プロバイダのドメイン
```

**別のPCやメールソフトから送信する場合**、そのログインに使うユーザー名(SASL認証名)ごとに変換ルールを追加する必要があります。ここに登録されていないユーザー名で送信すると、同じく `Sender rejected` になります。

編集後は必ず反映させます(これを忘れると変更が反映されません)。

```bash
sudo postmap /etc/postfix/sender_canonical
sudo systemctl restart postfix
```

> **注意**: `sender_canonical_classes = envelope_sender, header_sender` としているため、相手側に表示される送信元アドレスもプロバイダのアカウント名になります。自ドメインのアドレスとして表示したい場合は `envelope_sender` のみに絞るなど別途調整が必要です。

---

## 7. OpenDKIM連携

送信メールにDKIM署名を付与するための設定です(インストール・鍵生成手順は別途)。main.cfには以下を追加します。

```ini
milter_default_action = accept
milter_protocol = 6
smtpd_milters = inet:localhost:8891
non_smtpd_milters = inet:localhost:8891
```

OpenDKIM自体が `localhost:8891` でリッスンしている前提の設定です。

---

## 8. 設定の確認と反映

```bash
sudo postconf -d   # デフォルト値を表示
sudo postconf -n   # デフォルトと異なる(変更した)値のみ表示
sudo systemctl restart postfix
```

---

## 9. ファイアウォール・ポート開放

Postfix自体のufw設定に加え、**ルーター側でのポートフォワーディング**も必要です。

```bash
sudo ufw allow Postfix
sudo ufw allow 'Postfix SMTPS'
```

| ポート | 用途 | 転送先 |
|---|---|---|
| 25 | 外部からのメール受信(SMTP) | Raspberry PiのローカルIP |
| 587 | 外部のメールソフトからの送信(Submission) | 同上 |
| 993 | 外部のメールソフトからのIMAP受信 | 同上 |

いずれか1つでも転送漏れがあると、その用途だけ外部から使えなくなるので、下記のようなポートスキャンツールで開通しているか確認しておくと確実です。

- https://www.yougetsignal.com/tools/open-ports/

---

## Dovecot(IMAP/POPサーバー)

### インストール

```bash
sudo apt install dovecot-core dovecot-imapd dovecot-pop3d
```

### 待受アドレスの設定(dovecot.conf)

```bash
sudo nano /etc/dovecot/dovecot.conf
```

```ini
listen = *, ::
```

### Postfixとの認証連携(10-master.conf)

```bash
sudo nano /etc/dovecot/conf.d/10-master.conf
```

```ini
  # Postfix smtp-auth
  unix_listener /var/spool/postfix/private/auth {
    mode = 0666
    user = postfix
    group = postfix
  }
```

### メールの保存形式(10-mail.conf)

```bash
sudo nano /etc/dovecot/conf.d/10-mail.conf
```

```ini
mail_location = maildir:~/Maildir
```

### 認証方式(10-auth.conf)

```bash
sudo nano /etc/dovecot/conf.d/10-auth.conf
```

```ini
disable_plaintext_auth = no
auth_mechanisms = plain login
```

> **注意**: `disable_plaintext_auth = no` は平文認証を許可する設定です。TLS/SSLで暗号化された通信の上でのみ使われる前提で許可されますが、暗号化なしの接続でも平文認証が通ってしまう構成には注意してください。

### SSL証明書の設定(10-ssl.conf)

Postfixと同じLet's Encrypt証明書を指定します。CloudflareオリジナルSSL証明書など、公開CA以外の証明書を指定すると外部のメールクライアントから接続エラー・証明書エラーになるため注意してください。

```bash
sudo nano /etc/dovecot/conf.d/10-ssl.conf
```

```ini
ssl = yes
ssl_cert = </etc/letsencrypt/live/mail.example.com/fullchain.pem
ssl_key = </etc/letsencrypt/live/mail.example.com/privkey.pem
```

### 再起動

```bash
sudo systemctl restart dovecot
```

---

## 動作確認(コマンドでのテスト送信)

### mailコマンドでのテスト送信

```bash
sudo apt install mailutils
echo "テスト本文" | mail -s "テスト" 送信先@example.com
```

### ログでの結果確認

```bash
sudo grep -a "status=" /var/log/mail.log | tail -5
```

`status=sent` なら成功、`status=bounced` なら失敗です。エラー内容は同じ行の末尾に表示されます。

### telnetでの手動テスト(ローカル経由での送信確認)

```bash
telnet localhost 25
```

```smtp
HELO localhost
MAIL FROM:<hoge@localhost>
RCPT TO:<huga@example.com>
DATA
Subject:Send Test Mail
From:hogehoge<hoge@localhost>
To:hoge<hogehoge@gmail.com>
This is test mail
from telnet
.
```

### opensslでのIMAP接続テスト(外部ネットワークから実施)

証明書の信頼性まで含めて確認したい場合は、opensslで直接接続します。

```bash
openssl s_client -connect mail.example.com:993 -crlf
```

`* OK ... Dovecot ready.` が返れば接続成功。続けてログインコマンドを打つと認証まで確認できます。

```
a1 LOGIN ユーザー名 パスワード
```

---

## トラブルシューティング

| 症状 | ログに出るエラー | 原因 | 対処 |
|---|---|---|---|
| 送信メールがすべて失敗する | `status=bounced (SMTPUTF8 is required, but was not offered by host ...)` | 日本語ヘッダを含むメールで、リレー先がSMTPUTF8拡張に非対応 | `smtputf8_enable = no` を設定 |
| 特定の送信元だけ失敗する | `550 5.7.1 Sender rejected (in reply to MAIL FROM command)` | 送信者アドレスがプロバイダの許可アカウントになっていない | `sender_canonical` に該当ユーザーの変換ルールを追加し、`postmap` を実行 |
| `sender_canonical` を直したのに直らない | 特になし(変換されないまま) | `postmap` の実行漏れ | `sudo postmap /etc/postfix/sender_canonical` を実行し忘れていないか確認。`ls -la` で `.db` ファイルの更新日時を比較 |
| 外部からメールソフトで接続できない(送受信とも) | (メールソフト側でエラー、サーバーログには出ないことが多い) | TLS証明書が公開CA発行でない(Cloudflareオリジン証明書など) | Let's Encrypt証明書に切り替える(4章) |
| Gmail等から受信できない | `connect error (111): Connection refused` | `inet_interfaces = loopback-only` のままになっている、またはルーターのポート25転送漏れ | `inet_interfaces = all` に変更し、ポートフォワーディングを確認 |
| 送信ログ自体が見つからない | `grep` してもdovecotの行しか出ない、または起動ログしか出ない | `postfix/smtp` で検索すると受信側の `postfix/smtpd` にも一致してしまう。ログがローテーションされている | `grep "status="` で絞り込む。テスト送信直後に確認する |
| `grep: /var/log/mail.log: binary file matches` と出る | - | ログファイルにバイナリとみなされる文字が含まれている | `grep -a` オプションを付けてテキストとして扱う |
