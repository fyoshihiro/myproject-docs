# SPF / DKIM / DMARC(送信ドメイン認証)

SPF・DKIM・DMARCは、自ドメインを騙ったなりすましメール(送信ドメイン認証)を防ぐための仕組みです。3つを組み合わせることで、受信側のメールサーバーが「このメールは本当にそのドメインから送られたものか」を検証できるようになります。

## 目次

- [SPF(Sender Policy Framework)](#spfsender-policy-framework)
- [DKIM(DomainKeys Identified Mail)](#dkimdomainkeys-identified-mail)
- [DMARC](#dmarc)

---

## SPF(Sender Policy Framework)

SPFは、「このドメインからのメールは、このサーバーからしか送信されない」という送信元サーバーの一覧をDNSに公開する仕組みです。受信側は、実際にメールを送ってきたサーバーがこの一覧に含まれているかを確認します。

### 参考リンク

- [SPFチェックツール(kitterman.com)](https://www.kitterman.com/spf/validate.html)
- [SPFチェックツール(MXToolbox)](https://mxtoolbox.com/emailhealth/)
- [SPFレコードとは?正しい書き方を徹底解説](https://www.kagoya.jp/howto/it-glossary/mail/spf/)
- [SPFレコードを定義する: 詳細設定(Google)](https://support.google.com/a/answer/10683907)
- [SPF(Sender Policy Framework)の解説](https://salt.iajapan.org/wpmu/anti_spam/admin/tech/explanation/spf/)

### 指定方法のパターン

DNSにTXTレコードとして登録します。パターンごとの例は以下の通りです。

**Aレコード/MXレコードで指定する方法**

```
example.jp. IN TXT "v=spf1 a:mail.example.jp ~all"
example.jp. IN TXT "v=spf1 mx ~all"
```

**IPアドレスで指定する方法**

```
example.jp. IN TXT "v=spf1 ip4:192.168.100.3 ~all"
```

**IPアドレスの範囲(CIDR)で指定する方法**

```
example.jp. IN TXT "v=spf1 +ip4:192.168.100.0/24 ~all"
```

**他ドメインのSPFレコードを取り込む方法(例: kagoya.netの設定を利用する場合)**

```
example.jp. IN TXT "v=spf1 include:kagoya.net ~all"
```

**複数の送信元をまとめて指定する方法**

```
example.jp. IN TXT "v=spf1 +ip4:192.168.10.0/24 +ip4:10.1.2.0/24 ~all"
```

### 末尾の `all` 修飾子について

| 指定 | 意味 |
|---|---|
| `~all`(ソフトフェイル) | 一覧にないサーバーからの送信は「詐称の可能性がある」として扱う(受信は許容されることが多い) |
| `-all`(ハードフェイル) | 一覧にないサーバーからの送信は「詐称されている」として明確に拒否を推奨する |

**使い分けの目安**

- 自ドメインからのメールが、**必ず**SPFレコードに列挙したサーバーのみから送信される(メールマガジン配信サービスなど外部サーバーの利用が一切ない)場合は `-all` を指定します。
- 一方、外部のメール配信サービスなど、把握しきれていない送信元がある可能性が少しでもある場合は `~all` を使います。実務では `~all` が選ばれることの方が多いです。

---

## DKIM(DomainKeys Identified Mail)

DKIMは、送信するメールに電子署名を付与し、受信側がその署名をDNS上の公開鍵で検証することで、メールの内容が途中で改ざんされていないこと・正当なドメインから送られたことを保証する仕組みです。

参考: [Ubuntu 18.04でDKIM設定](https://yaasita.github.io/2018/08/18/dkim/)

### 1. インストール

```bash
apt install opendkim opendkim-tools
```

### 2. 鍵ペアを生成する

```bash
mkdir /etc/postfix/dkim/
opendkim-genkey -D /etc/postfix/dkim/ -d example.com -s mail
chgrp opendkim /etc/postfix/dkim/*
chmod g+r /etc/postfix/dkim/*
```

| オプション | 内容 |
|---|---|
| `-D` | 鍵ファイルの出力先ディレクトリ |
| `-d` | 対象ドメイン |
| `-s` | セレクタ(同じドメインで複数の鍵を使い分けるための識別名。DNSレコード名にも使われる) |

### 3. opendkimの設定(/etc/opendkim.conf)

```bash
sudo nano /etc/opendkim.conf
```

```ini
Syslog                  yes
SyslogSuccess           yes
LogWhy                  yes
Canonicalization        relaxed/relaxed
Mode                    sv
OversignHeaders         From
KeyTable                file:/etc/postfix/dkim/keytable
SigningTable            file:/etc/postfix/dkim/signingtable
UserID                  opendkim
UMask                   007
PidFile                 /run/opendkim/opendkim.pid
TrustAnchorFile         /usr/share/dns/root.key
```

| パラメータ | 内容 |
|---|---|
| `Mode sv` | 署名(sign)と検証(verify)の両方を行うモード |
| `KeyTable` / `SigningTable` | どのドメイン・セレクタにどの秘密鍵を使うかを定義したファイルの場所 |
| `OversignHeaders From` | `From` ヘッダーへの署名を強化し、改ざん耐性を高める |

### 4. 鍵とドメインの対応を設定する

```bash
sudo nano /etc/postfix/dkim/keytable
```

```
mail._domainkey.example.com example.com:mail:/etc/postfix/dkim/mail.private
```

```bash
sudo nano /etc/postfix/dkim/signingtable
```

```
example.com mail._domainkey.example.com
```

### 5. 設定を反映する

```bash
sudo systemctl restart opendkim
```

### 6. Postfixと連携させる(main.cf)

Postfixからのメール送信時にopendkimへ署名処理を渡すよう設定します。

```bash
sudo nano /etc/postfix/main.cf
```

```ini
milter_default_action = tempfail
milter_protocol = 2
smtpd_milters = inet:localhost:8891
non_smtpd_milters = inet:localhost:8891
```

- `milter_default_action = tempfail`: 署名処理(milter)に接続できない場合、一時エラーとしてメールを保留する(署名なしでの送信を防ぐ)
- `smtpd_milters` / `non_smtpd_milters`: opendkimが待ち受けるポート(8891番)を指定

### 7. 公開鍵をDNSに登録する

鍵生成時に作成される `mail.txt` の内容を、DNSのTXTレコードとして登録します。

```
mail._domainkey	IN	TXT	( "v=DKIM1; h=sha256; k=rsa; "
      "p=MIIB..."
      "...." )  ; ----- DKIM key mail for example.com
```

### 8. 動作確認

```bash
opendkim-testkey -d example.com -s mail -vvv
```

`key OK` のように表示されれば、DNSへの登録・鍵の設定ともに正しく機能しています。

---

## DMARC

DMARCは、SPF・DKIMの検証結果をもとに「認証に失敗したメールをどう扱うか」というポリシーを送信ドメイン側が定義し、受信側に伝える仕組みです。あわせて、認証結果のレポートを受け取ることもできます。

DNSに以下のようなTXTレコードを登録します。

```
_dmarc.example.com TXT 360 "v=DMARC1;p=none;rua=mailto:admin@example.com;ruf=mailto:admin@example.com;rf=afrf;pct=100"
```

### パラメータの意味

| パラメータ | 内容 |
|---|---|
| `v=DMARC1` | DMARCのバージョン指定(固定値) |
| `p=none` | 認証に失敗したメールへのポリシー。`none`(何もしない/監視のみ)、`quarantine`(迷惑メール扱い)、`reject`(拒否)の3段階 |
| `rua=mailto:...` | 集計レポート(送信状況のサマリー)の送付先アドレス |
| `ruf=mailto:...` | 個別の失敗レポートの送付先アドレス |
| `rf=afrf` | 失敗レポートのフォーマット指定 |
| `pct=100` | ポリシーを適用する対象メールの割合(100 = 全件) |

> **運用のポイント**: いきなり `p=reject` にすると、正規のメールまで誤って拒否されるリスクがあります。まずは `p=none` で運用し、`rua` に届くレポートを確認しながら、問題がなければ `quarantine` → `reject` の順に段階的に厳しくしていくのが一般的です。

参考: [DMARCとは?](https://sendgrid.kke.co.jp/blog/?p=3137)