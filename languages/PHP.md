# PHP

PHPのインストール手順(Nginxとの連携含む)と、PDOを使ったデータベース接続の基本をまとめます。

関連ドキュメント: [Nginx(PHP-FPM連携の詳細)](../web-server/Nginx.md) / [MariaDB](../database/MariaDB.md)

## 目次

- [インストール](#インストール)
- [PDOによるデータベース接続](#pdoによるデータベース接続)

---

## インストール

PHP本体とPHP-FPM(NginxなどからPHPを呼び出すためのプロセスマネージャ)をインストールします。

```bash
sudo apt install php php-fpm
```

Nginx側で `.php` へのリクエストをPHP-FPMに渡す設定や、動作確認方法については [Nginxドキュメント](../web-server/Nginx.md#phpのインストールとnginxとの連携) を参照してください。

### よく使う追加モジュール

データベース接続・HTTP通信・マルチバイト文字列処理のために、以下も合わせてインストールしておくと便利です。

```bash
sudo apt install php-mysql php-curl php-mbstring
```

### phpMyAdminのインストール(参考)

```bash
sudo apt install phpmyadmin
```

> **補足**: `apt` からインストールする方法の他に、公式サイトから対応バージョンをダウンロードして手動配置する方法もあります。手動配置の詳しい手順は [phpMyAdminドキュメント](../database/phpMyAdmin.md) を参照してください。

---

## PDOによるデータベース接続

PDO(PHP Data Objects)は、PHPからMySQL/MariaDBなどのデータベースに接続するための標準的な仕組みです。特定のデータベース製品に依存しない共通のインターフェースで操作できます。

### 基本的な接続とデータ取得の例

```php
<?php

$dsn      = 'mysql:dbname=db_name;host=localhost';
$user     = 'user_name';
$password = 'password';

// DBへ接続
try {
    $dbh = new PDO($dsn, $user, $password);

    // クエリの実行
    $query = "SELECT * FROM TABLE_NAME";
    $stmt = $dbh->query($query);

    // 表示処理
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        echo $row["name"];
    }

} catch (PDOException $e) {
    print("データベースの接続に失敗しました" . $e->getMessage());
    die();
}

// 接続を閉じる
$dbh = null;
```

### コードの流れ

| 部分 | 内容 |
|---|---|
| `$dsn` | 接続先を表す文字列(DSN: Data Source Name)。データベース種別・DB名・ホストを指定 |
| `new PDO($dsn, $user, $password)` | 指定した接続情報でデータベースに接続を試みる |
| `try / catch (PDOException $e)` | 接続やクエリ実行に失敗した場合、例外(エラー)をキャッチしてメッセージを表示する |
| `$dbh->query($query)` | SQLクエリを実行し、結果セットを取得 |
| `$stmt->fetch(PDO::FETCH_ASSOC)` | 結果を1行ずつ、カラム名をキーとした連想配列として取得 |
| `$dbh = null` | 接続を明示的に解放(スクリプト終了時に自動解放されるが、明示することもできる) |

> **セキュリティ上の注意**: この例では固定の `SELECT * FROM TABLE_NAME` を実行していますが、ユーザーの入力値をSQL文に直接組み込む場合は**SQLインジェクション**のリスクがあります。ユーザー入力を扱う場合は、`query()` ではなく `prepare()` + `execute()` によるプレースホルダを使った書き方にしてください。

### プレースホルダを使う場合の例(参考)

```php
$stmt = $dbh->prepare("SELECT * FROM TABLE_NAME WHERE id = :id");
$stmt->execute(['id' => $userInputId]);
```

`:id` のようなプレースホルダに値を渡すことで、入力値がSQL文として解釈されるのを防げます。