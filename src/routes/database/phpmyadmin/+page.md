# phpMyAdmin

phpMyAdminは、ブラウザ上からMySQL/MariaDBを操作できるWebベースの管理ツールです。このドキュメントでは、対応バージョンの確認からインストール、権限設定までの手順をまとめます。

## 目次

- [事前準備:バージョン確認](#事前準備バージョン確認)
- [ダウンロードと配置](#ダウンロードと配置)
- [Webサーバーから見えるようにする](#webサーバーから見えるようにする)
- [権限設定(tmpディレクトリのエラー対処)](#権限設定tmpディレクトリのエラー対処)

---

## 事前準備:バージョン確認

phpMyAdminにはバージョンごとに対応するPHP/データベースのバージョンが決まっているため、先に環境を確認してから対応バージョンを選びます。

### データベースのバージョン確認

```bash
mysql --version
```

```
出力例: Ver 15.1
```

### PHPのバージョン確認

```bash
php -v
```

```
出力例: PHP 7.4.28
```

> **ポイント**: この2つのバージョンをもとに、[phpMyAdmin公式サイト](https://www.phpmyadmin.net/downloads/)で互換性のあるバージョンを選んでダウンロードしてください。

---

## ダウンロードと配置

対応するバージョンのURLを確認し、ダウンロードします。

```bash
wget http://適したバージョンのURL
```

ダウンロードしたファイルを展開します。

```bash
tar xzvf phpMyAdmin-4.9.10-all-languages.tar.gz
```

展開してできたディレクトリを、Webサーバーの共有ディレクトリ配下(`/usr/share/`)に移動します。

```bash
sudo mv phpMyAdmin-4.9.10-all-languages /usr/share/phpmyadmin
```

> **補足**: `/usr/share/phpmyadmin` に置くのは、公開ディレクトリ(`/var/www/html`)へ直接配置せず、シンボリックリンク経由で管理しやすくするためです。

---

## Webサーバーから見えるようにする

シンボリックリンクを作成し、公開ディレクトリ(`/var/www/html`)からアクセスできるようにします。

```bash
sudo ln -s /usr/share/phpmyadmin /var/www/html/phpmyadmin
```

これで `http://サーバーのアドレス/phpmyadmin` にアクセスできるようになります。

---

## 権限設定(tmpディレクトリのエラー対処)

インストール後、ブラウザで開くと以下のようなエラー・警告が出ることがあります。

> `./tmp/` にアクセスできません。phpMyAdmin はテンプレートをキャッシュすることができないため、低速になります。

これは、Webサーバーの実行ユーザー(`www-data`)が phpMyAdmin のディレクトリに書き込み権限を持っていないために発生します。所有者を `www-data` に変更することで解消します。

```bash
sudo chown -R www-data:www-data /usr/share/phpmyadmin
```