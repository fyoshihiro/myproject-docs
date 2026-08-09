# Nginx

Nginxは高性能なWebサーバー/リバースプロキシです。このドキュメントでは、インストールから静的サイトの公開、複数ドメインの設定(バーチャルホスト)、PHPとの連携までをまとめます。

関連ドキュメント: [MariaDB](../database/MariaDB.md) / [phpMyAdmin](../database/phpMyAdmin.md) / [WordPress](../cms/WordPress.md)

## 目次

- [1. インストール](#1-インストール)
- [2. ファイアウォールの設定](#2-ファイアウォールの設定)
- [3. サイトディレクトリの準備](#3-サイトディレクトリの準備)
- [4. サイト設定ファイルの作成](#4-サイト設定ファイルの作成)
- [5. 複数ドメイン(SSL)をバーチャルホストで公開する](#5-複数ドメインsslをバーチャルホストで公開する)
- [6. 設定の検証と反映](#6-設定の検証と反映)
- [PHPのインストールとNginxとの連携](#phpのインストールとnginxとの連携)

---

## 1. インストール

```bash
sudo apt update
sudo apt install nginx
```

インストール後、サービスが起動しているか確認します。

```bash
systemctl status nginx
```

`active (running)` と表示されていれば正常に起動しています。

---

## 2. ファイアウォールの設定

Nginxインストール時に、ufw用のアプリケーションプロファイルが自動登録されます。まずはどのプロファイルが使えるか確認します。

```bash
sudo ufw app list
```

HTTP(80番)とHTTPS(443番)の両方を許可するプロファイルを有効にします。

```bash
sudo ufw allow 'Nginx Full'
```

許可状況を確認します。

```bash
sudo ufw status
```

---

## 3. サイトディレクトリの準備

公開するサイトのファイルを置くディレクトリを作成します。`your_domain` の部分は実際のドメイン名に置き換えてください。

```bash
sudo mkdir -p /var/www/your_domain/html
sudo chown -R $USER:$USER /var/www/your_domain/html
sudo chmod -R 755 /var/www/your_domain
```

| コマンド | 内容 |
|---|---|
| `mkdir -p` | ディレクトリを(親ディレクトリごと)作成 |
| `chown -R $USER:$USER` | 所有者を現在のログインユーザーに変更(編集しやすくするため) |
| `chmod -R 755` | 所有者は読み書き実行可、それ以外は読み取り・実行のみ |

動作確認用のシンプルなHTMLファイルを作成しておきます。

```bash
vi /var/www/your_domain/html/index.html
```

---

## 4. サイト設定ファイルの作成

Nginxでは、ドメインごとの設定を `sites-available` に作成し、`sites-enabled` にシンボリックリンクを貼ることで有効化する構成が一般的です。

```bash
sudo nano /etc/nginx/sites-available/your_domain
```

```nginx
server {
        listen 80;
        listen [::]:80;

        root /var/www/your_domain/html;
        index index.html index.htm index.nginx-debian.html;

        server_name your_domain www.your_domain;

        location / {
                try_files $uri $uri/ =404;
        }
}
```

- `listen 80` / `listen [::]:80`: IPv4・IPv6それぞれの80番ポート(HTTP)で待ち受け
- `root`: 公開するファイルの場所
- `server_name`: このブロックが処理する対象ドメイン
- `try_files $uri $uri/ =404`: リクエストされたパスのファイル・ディレクトリが存在すれば返し、なければ404を返す

作成した設定を有効化するため、`sites-enabled` にシンボリックリンクを作成します。

```bash
sudo ln -s /etc/nginx/sites-available/your_domain /etc/nginx/sites-enabled/
```

---

## 5. 複数ドメイン(SSL)をバーチャルホストで公開する

1台のサーバーで複数のドメイン・サブドメインをSSL付きで公開する場合、`server` ブロックをドメインの数だけ用意します。以下は `example.com` と `home.example.com` の2つを公開する例です。

```bash
sudo vi /etc/nginx/nginx.conf
```

```nginx
server {
        listen 443 default_server;
        ssl on;
        server_name example.com;
        ssl_certificate /etc/letsencrypt/live/example.com/fullchain.pem;
        ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;

        root /var/www/html/default;
        index index.html index.htm index.nginx-debian.html index.php;

        location / {
                try_files $uri $uri/ =404;
        }

        location ~ \.php$ {
                include snippets/fastcgi-php.conf;
                fastcgi_pass unix:/run/php/php7.4-fpm.sock;
        }
}

server {
        listen 443;
        ssl on;
        server_name home.example.com;
        ssl_certificate /etc/letsencrypt/live/example.com/fullchain.pem;
        ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;

        root /var/www/html/home;
        index index.html index.htm index.nginx-debian.html index.php;

        location / {
                try_files $uri $uri/ =404;
        }

        location ~ \.php$ {
                include snippets/fastcgi-php.conf;
                fastcgi_pass unix:/run/php/php7.4-fpm.sock;
        }
}
```

### ポイント

- `listen 443 default_server`: このブロックを、該当する `server_name` がない場合の**デフォルト応答先**として指定
- `root` をブロックごとに変える: ドメイン(サブドメイン)ごとに公開するファイルを分けられる
- `location ~ \.php$`: `.php` で終わるリクエストをPHP-FPMに渡す設定(詳細は後述)
- SSL証明書は [Let's Encrypt](../dns/Lets_Encrypt.md) のドキュメントを参照

---

## 6. 設定の検証と反映

設定ファイルに文法ミスがないか、必ず反映前に確認します。

```bash
sudo nginx -t
```

`syntax is ok` / `test is successful` と表示されればOKです。エラーがある場合はNginxが起動できなくなるため、必ずこの確認を挟んでください。

問題なければ設定を反映します。

```bash
sudo systemctl restart nginx
```

---

## PHPのインストールとNginxとの連携

### PHPとPHP-FPMをインストール

```bash
sudo apt install php php-fpm
```

### Nginxの設定で `.php` リクエストをPHP-FPMに渡す

```bash
sudo vi /etc/nginx/sites-available/default
```

```nginx
location ~ \.php$ {
    include snippets/fastcgi-php.conf;
    fastcgi_pass unix:/run/php/php7.3-fpm.sock;
}
```

> **補足**: `fastcgi_pass` に指定するソケットのパスは、インストールされたPHPのバージョンによって `php7.3-fpm.sock` や `php7.4-fpm.sock` のように異なります。`ls /run/php/` で実際のファイル名を確認してから指定してください。

設定を検証し、反映します。

```bash
sudo nginx -t
sudo systemctl restart nginx
```

### よく使う追加モジュールをインストール

MySQL連携・HTTPリクエスト・マルチバイト文字列を扱うために、以下のモジュールも合わせてインストールしておくと便利です。

```bash
sudo apt install php-mysql php-curl php-mbstring
```

### 動作確認用ページを作成する

```bash
sudo vi /var/www/html/index.php
```

```php
<?php phpinfo(); ?>
```

ブラウザで該当のURLにアクセスし、PHPの設定情報ページが表示されれば正常に連携できています。

> **注意**: `phpinfo()` はサーバーの内部情報(バージョンや設定値)を外部に公開してしまうため、動作確認が終わったら**必ず削除するかアクセス制限をかけてください**。