# Docker for Mac

Docker Desktop for Macのインストールと基本コマンド、docker-composeを使ったWordPress/PHP開発環境の構築例をまとめます。

## 目次

- [インストール](#インストール)
- [基本コマンド](#基本コマンド)
- [WordPressサーバー(docker-compose)](#wordpressサーバーdocker-compose)
- [PHPサーバー(docker-compose)](#phpサーバーdocker-compose)

---

## インストール

[Docker公式サイト](https://www.docker.com/products/docker-desktop/)からDocker Desktopをダウンロードし、インストールします。

---

## 基本コマンド

### バージョン確認

```bash
docker version
```

### コンテナの確認

```bash
# 動作中のコンテナのみ表示
docker ps

# 停止中のものも含めた全コンテナを表示
docker ps -a
```

### イメージの確認・取得

```bash
# ローカルにあるイメージの一覧
docker images

# 指定したイメージをリポジトリから取得
docker pull [イメージ名]
```

### コンテナの実行

```bash
docker run hello-world
```

`hello-world` イメージをもとにコンテナを起動する動作確認用コマンドです。ローカルにイメージがなければ自動的に取得(pull)されます。

### イメージの検索・取得(個別)

```bash
# Docker Hub上でイメージを検索
docker search hello-world

# イメージを明示的に取得
docker pull hello-world
```

### コンテナの停止

```bash
docker stop [コンテナ名]
```

---

## WordPressサーバー(docker-compose)

MySQLとWordPressの2つのコンテナを連携させ、WordPress環境を構築する例です。

```yaml
# docker-compose.yml

services:
  db:
    image: mysql:5.7
    platform: linux/amd64
    volumes:
      - db_data:/var/lib/mysql
    restart: always
    environment:
      MYSQL_ROOT_PASSWORD: somewordpress
      MYSQL_DATABASE: wordpress
      MYSQL_USER: wordpress
      MYSQL_PASSWORD: wordpress

  wordpress:
    depends_on:
      - db
    image: wordpress:latest
    ports:
      - "8000:80"
    restart: always
    environment:
      WORDPRESS_DB_HOST: db:3306
      WORDPRESS_DB_USER: wordpress
      WORDPRESS_DB_PASSWORD: wordpress

volumes:
  db_data:
```

### 構成のポイント

| 項目 | 内容 |
|---|---|
| `db` サービス | MySQL 5.7のコンテナ。`platform: linux/amd64` はApple Silicon(M1/M2など)環境でx86向けイメージを動かすための指定 |
| `volumes: db_data:/var/lib/mysql` | データベースの中身をコンテナ外(名前付きボリューム)に保存し、コンテナを削除してもデータが消えないようにする |
| `wordpress` サービス | `depends_on: db` により、`db` コンテナの起動後にWordPressコンテナが起動する |
| `ports: "8000:80"` | ホスト側の8000番ポートを、コンテナ内の80番ポート(WordPress)に転送。ブラウザでは `http://localhost:8000` でアクセス |
| `WORDPRESS_DB_HOST: db:3306` | サービス名 `db` がそのままホスト名として名前解決される(Docker composeネットワークの機能) |
| 環境変数のパスワード | `somewordpress` や `wordpress` は開発用の仮の値。本番運用する場合は必ず推測されにくい値に変更する |

このファイルがあるディレクトリで、以下を実行すると起動します。

```bash
docker-compose up -d
```

---

## PHPサーバー(docker-compose)

nginx(Webサーバー)とPHP-FPM(PHP実行環境)の2つのコンテナを連携させ、PHPサイトを構築する例です。作業ディレクトリは `/Users/[username]/deve/php` を想定しています。

```yaml
# docker-compose.yml

version: '3'
services:
  web:
    image: nginx
    depends_on:
      - app
    ports:
      - "8080:80"
    volumes:
      - ./docker/web/default.conf:/etc/nginx/conf.d/default.conf
      - .:/var/www/html
  app:
    image: php:7-fpm
    volumes:
      - .:/var/www/html
      - ./docker/app/php.ini:/usr/local/etc/php/php.ini
```

### 構成のポイント

| 項目 | 内容 |
|---|---|
| `web` サービス | nginxコンテナ。`depends_on: app` によりPHPコンテナの後に起動 |
| `ports: "8080:80"` | ホストの8080番ポートをコンテナの80番に転送。`http://localhost:8080` でアクセス |
| `./docker/web/default.conf:/etc/nginx/conf.d/default.conf` | ホスト側で用意したnginx設定ファイルを、コンテナ内の設定として読み込ませる |
| `.:/var/www/html` | カレントディレクトリ(サイトのソースコード)をコンテナ内の公開ディレクトリにマウントし、ホスト側での編集がそのまま反映されるようにする |
| `app` サービス | PHP 7系のPHP-FPMコンテナ |
| `./docker/app/php.ini:/usr/local/etc/php/php.ini` | ホスト側で用意した `php.ini` をコンテナ内のPHP設定として読み込ませる |

事前に `docker/web/default.conf`(nginxのPHP連携設定)と `docker/app/php.ini`(PHP設定)を用意しておく必要があります。準備ができたら、このファイルがあるディレクトリで以下を実行して起動します。

```bash
docker-compose up -d
```