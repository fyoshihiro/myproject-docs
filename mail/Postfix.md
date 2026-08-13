# Postfix(メールサーバーの構築)

Postfix(送信・受信を扱うMTA)とDovecot(IMAP/POPでメールを受信するためのサーバー)を使い、独自ドメインでメールサーバーを構築する手順をまとめます。

## 目次

- [参考リンク](#参考リンク)
- [1. Postfixのインストール](#1-postfixのインストール)
- [2. 初期設定ウィザード](#2-初期設定ウィザード)
- [3. main.cfの設定](#3-maincfの設定)
- [4. master.cfの設定(SMTPS)](#4-master-cfの設定smtps)
- [5. プロバイダ認証情報の設定](#5-プロバイダ認証情報の設定)
- [6. 設定の確認と反映](#6-設定の確認と反映)
- [7. ファイアウォールの設定](#7-ファイアウォールの設定)
- [8. メールアカウントの作成](#8-メールアカウントの作成)
- [Dovecot(IMAP/POPサーバー)](#dovecotimappopサーバー)
- [動作確認(telnetでのメール送信テスト)](#動作確認telnetでのメール送信テスト)

---

## 参考リンク

- [Ubuntu 20.04にPostfixをインストールして設定する方法](https://www.digitalocean.com/community/tutorials/how-to-install-and-configure-postfix-on-ubuntu-20-04-ja)
- [eo光環境でPostfixによるOP25B対策](https://lv73.net/eo-op25b/)
- [PostfixでSTARTTLSを有効にしてみる](https://www.sendmagic.jp/techinfo/starttls-postfix/)
- [Postfixのセキュリティ対策](http://www.criterion.sc/sub_notes/Postfix_Security.html)
- [Postfixによる、セキュリティに配慮したメールサーバの構築方法](https://oxynotes.com/?p=4646)
- [【初心者向け】EC2を利用したメールサーバーの構築(Postfix + Dovecot)](https://blog.denet.co.jp/ec2-postfix-dovecot-mail-server-setup/)

---

## 1. Postfixのインストール

```bash
sudo apt install postfix sasl2-bin
```

---

## 2. 初期設定ウィザード

インストール中(または後述の再設定コマンド実行時)に、対話形式の設定ウィザードが表示されます。以下の内容で回答します。

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
| 使用するインターネットプロトコル | **ALL** |

### 設定ウィザードを再実行したい場合

```bash
sudo dpkg-reconfigure postfix
```

---

## 3. main.cfの設定

Postfixの主要な設定ファイルを編集します。

```bash
sudo nano /etc/postfix/main.cf
```

> **補足**: 各パラメータの詳しい意味は `man 5 postconf` で確認できます。

```ini
# See /usr/share/postfix/main.cf.dist for a commented, more complete version
biff = no
append_dot_mydomain = no
readme_directory = no
compatibility_level = 2

# TLS parameters
smtpd_use_tls = yes
smtpd_tls_security_level = may
smtpd_tls_cert_file = /etc/letsencrypt/live/example.com/fullchain.pem
smtpd_tls_key_file = /etc/letsencrypt/live/example.com/privkey.pem
smtpd_relay_restrictions = permit_mynetworks permit_sasl_authenticated defer_unauth_destination
smtpd_recipient_restrictions = permit_mynetworks permit_sasl_authenticated reject_unauth_destination

# SASL Setting
smtpd_sasl_auth_enable = yes
smtpd_sasl_authenticated_header = yes
broken_sasl_auth_clients = yes
smtpd_sasl_type = dovecot
smtpd_sasl_path = private/auth
smtpd_tls_session_cache_database = btree:/etc/postfix/smtpd_scache
smtpd_tls_session_cache_timeout = 3600s

smtp_tls_CApath = /etc/ssl/certs
smtp_tls_security_level = may
smtp_tls_session_cache_database = btree:${data_directory}/smtp_scache
smtp_sasl_auth_enable = yes
smtp_sasl_password_maps = hash:/etc/postfix/isp_auth
smtp_sasl_security_options = noanonymous
smtp_sasl_mechanism_filter = login plain

myhostname = mail.example.com
alias_maps = hash:/etc/aliases
alias_database = hash:/etc/aliases
myorigin = /etc/mailname
mydestination = $myhostname, mail.example.com, example.com, raspberrypi, localhost.localdomain, localhost
relayhost = [smtpauth.eonet.ne.jp]:587
mynetworks = 127.0.0.0/8 [::ffff:127.0.0.0]/104 [::1]/128
mailbox_size_limit = 0
recipient_delimiter = +
inet_interfaces = all
inet_protocols = all
home_mailbox = Maildir/
message_size_limit = 20480000

# MTA情報の隠蔽
smtpd_banner = ESMTP MTA
# 内部ユーザの隠蔽
disable_vrfy_command = yes
# HELOコマンドを必須にする
smtpd_helo_required = yes
# 相手のホスト名がDNSに登録されていない、FQDNが解決できない、ホスト名の文法が不正の場合に拒否
smtpd_helo_restrictions = permit_mynetworks, reject_unknown_hostname, reject_non_fqdn_hostname, reject_invalid_hostname, permit
# ドメインが解決できない、FQDNが解決できない場合に拒否
smtpd_sender_restrictions = permit_mynetworks, reject_unknown_sender_domain, reject_non_fqdn_sender
```

### 主要パラメータの意味

| パラメータ | 内容 |
|---|---|
| `smtpd_use_tls` / `smtpd_tls_*` | 受信時のTLS暗号化を有効化し、証明書・鍵のパスを指定 |
| `smtpd_sasl_type = dovecot` | ユーザー認証をDovecot経由で行う指定(後述のDovecot設定と連動) |
| `myhostname` | このサーバー自身のホスト名 |
| `mydestination` | 自ドメイン宛として配送を受け付けるドメイン一覧 |
| `relayhost` | 自ドメインの送信をプロバイダのSMTPサーバー経由で中継する場合の指定(OP25B対策) |
| `mynetworks` | 認証なしでメール送信を許可するネットワーク範囲(自ホストのみに限定) |
| `disable_vrfy_command` | `VRFY` コマンド(アカウント存在確認)を無効化し、内部ユーザー名の推測を防ぐ |
| `smtpd_helo_restrictions` / `smtpd_sender_restrictions` | 不正な送信元(FQDNが解決できない、なりすまし濃厚なもの)からの受信を拒否 |

---

## 4. master.cfの設定(SMTPS)

SMTPS(暗号化必須のSMTP、465番ポート)を有効にする設定です。

```bash
sudo nano /etc/postfix/master.cf
```

```ini
smtp      inet  n       -       n       -       -       smtpd
smtps     inet  n       -       n       -       -       smtpd
  -o smtpd_tls_wrappermode=yes
  -o smtpd_sasl_auth_enable=yes
  -o smtpd_relay_restrictions=permit_sasl_authenticated,reject
```

- `smtpd_tls_wrappermode=yes`: 接続開始時点から常時TLS暗号化する(SMTPSの動作)
- `smtpd_relay_restrictions=permit_sasl_authenticated,reject`: SASL認証済みのユーザーのみ中継を許可し、それ以外は拒否

---

## 5. プロバイダ認証情報の設定

`relayhost` で指定したプロバイダのSMTPサーバーへの認証情報を設定します。

```bash
sudo nano /etc/postfix/isp_auth
```

```
[smtpauth.eonet.ne.jp]:587 プロバイダのSMTPアカウント:パスワード
```

ファイルの権限を絞り、Postfixが参照できる形式(ハッシュデータベース)に変換します。

```bash
sudo chmod 600 /etc/postfix/isp_auth
sudo postmap /etc/postfix/isp_auth
```

---

## 6. 設定の確認と反映

現在の設定値を確認します。

```bash
sudo postconf -d   # デフォルト値を表示
sudo postconf -n   # デフォルトと異なる(変更した)値のみ表示
```

設定を反映するため、Postfixを再起動します。

```bash
sudo systemctl restart postfix
```

---

## 7. ファイアウォールの設定

```bash
sudo ufw allow Postfix
sudo ufw allow 'Postfix SMTPS'
```

---

## 8. メールアカウントの作成

### メール保存用ディレクトリのひな形を用意する

新規ユーザー作成時に自動でメール保存用ディレクトリ(Maildir形式)が作られるよう、ひな形を用意しておきます。

```bash
sudo mkdir -p /etc/skel/Maildir/{new,cur,tmp}
sudo chmod -R 700 /etc/skel/Maildir/
```

### ユーザーを作成する

メールアカウントとしてのみ使う(サーバーにログインさせない)場合は、シェルを `/sbin/nologin` に設定します。

```bash
sudo useradd -m new_user
sudo useradd -s /sbin/nologin new_user
```

### パスワードを設定する

```bash
sudo passwd new_user
```

### ユーザーを削除する場合

```bash
sudo userdel -r new_user
```

### SASL認証情報を追加する(Dovecot SASLを使わない場合)

```bash
sudo saslpasswd2 -u example.com -c new_user
sudo sasldblistusers2   # ユーザーが追加されているか確認
```

> **補足**: 上記のmain.cf設定では `smtpd_sasl_type = dovecot` としているため、通常はこの手順は不要です。Dovecot側の認証を使わず、Postfix独自のSASL認証を使いたい場合にのみ実行してください。

---

## Dovecot(IMAP/POPサーバー)

メールクライアントからIMAP/POPでメールボックスにアクセスできるようにするためのサーバーです。また、Postfixからのユーザー認証(SASL)の実処理も担います。

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

IPv4・IPv6の両方で待ち受ける設定です。

### Postfixとの認証連携(10-master.conf)

Postfixからのユーザー認証をDovecot経由で行うためのソケットを設定します。

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

Postfix側の `home_mailbox = Maildir/` 設定と対応させ、メールの保存形式(Maildir形式)を揃えています。

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

## 動作確認(telnetでのメール送信テスト)

`telnet` を使って、SMTPコマンドを手動で送信し、メールが正しく送信できるか確認できます。

```bash
telnet localhost 25
```

接続後、以下のコマンドを順番に入力します。

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

### コマンドの意味

| コマンド | 内容 |
|---|---|
| `HELO localhost` | SMTPセッションを開始し、自分のホスト名を名乗る |
| `MAIL FROM:<...>` | 送信元アドレスを指定(実際に使うアドレスに置き換える) |
| `RCPT TO:<...>` | 宛先アドレスを指定(実際に使うアドレスに置き換える) |
| `DATA` | 本文の入力を開始する宣言 |
| `Subject:` / `From:` / `To:` | メールヘッダー(件名・送信元・宛先の表示名) |
| 本文 | ヘッダーの後、空行を挟んで本文を記述 |
| `.`(行頭にドットのみ) | 本文の終端を表す特別な行。**これがないとメールが送信されないため注意** |

正常に処理されると `250 2.0.0 Ok: queued as ...` のような応答が返り、指定した宛先にメールが届きます。
