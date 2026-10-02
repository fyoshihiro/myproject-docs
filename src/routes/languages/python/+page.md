# Python(便利なライブラリ集)

定期実行・デスクトップ通知・別プロセス起動・関数のメモ化など、よく使う小回りの効くPythonライブラリ・機能をまとめます。

## 目次

- [APScheduler(定期実行)](#apschedulerジョブを定期実行する)
- [notify-py(デスクトップ通知)](#notify-pyデスクトップ通知)
- [subprocess(別プロセスの起動)](#subprocess別プロセスの起動)
- [メモ化(functools.cache)](#メモ化functoolscache)

---

## APScheduler(ジョブを定期実行する)

指定した間隔・スケジュールで関数を自動実行できるライブラリです。cronのように定期処理を組みたいときに使います。

```bash
pip install apscheduler
```

```python
from datetime import datetime
from apscheduler.schedulers.blocking import BlockingScheduler


def test(msg):
    print(f"引数は{msg}です")


scheduler = BlockingScheduler()
scheduler.add_job(
    test,
    "interval",
    seconds=3,
    args=["テスト"],
    id="test_id"
)

scheduler.start()
```

### コードのポイント

| 要素 | 内容 |
|---|---|
| `BlockingScheduler()` | スケジューラを作成。`start()` した時点でその後の処理をブロックする(スケジューラ専用のプログラムに向いている) |
| `add_job(関数, "interval", seconds=3, ...)` | 「3秒おき」に指定した関数を実行するジョブを登録 |
| `args=["テスト"]` | 実行する関数に渡す引数 |
| `id="test_id"` | ジョブを一意に識別するID(後から削除・変更する際に使用) |
| `scheduler.start()` | スケジューラを起動し、実行を開始 |

> **注意**: 元のコードでは変数名が `schduler`(タイプミス)と `scheduler` で一致しておらず、そのままでは `NameError` になります。上記では `scheduler` に統一しています。

---

## notify-py(デスクトップ通知)

OSのデスクトップ通知(通知センター/トースト通知)を表示できるライブラリです。処理完了時に通知を出したい場合などに便利です。

```bash
pip install notify-py
```

```python
from notifypy import Notify


def test():
    notification = Notify()
    notification.title = "通知タイトル"
    notification.message = "通知の内容"
    notification.send()

test()
```

### コードのポイント

- `Notify()` で通知オブジェクトを作成
- `title` / `message` に表示したい文言を設定
- `send()` で実際に通知を送信

---

## subprocess(別プロセスの起動)

現在のPythonプロセスとは別に、新しいプロセスを起動するための標準ライブラリです。時間のかかる処理をバックグラウンドで走らせたい場合などに使います。

```python
import subprocess

subprocess.Popen(
    ["python3", "long_task.py"],
    start_new_session=True
)
```

### コードのポイント

| 要素 | 内容 |
|---|---|
| `Popen([...])` | 指定したコマンドを別プロセスとして起動(実行完了を待たずに次の処理へ進む) |
| `["python3", "long_task.py"]` | 実行するコマンドを配列で指定(`python3 long_task.py` を実行) |
| `start_new_session=True` | 親プロセス(このスクリプト)が終了しても、起動した別プロセスを終了させずに独立して動かし続ける |

---

## メモ化(functools.cache)

同じ引数で関数を呼び出した際、再計算せずに前回の結果をそのまま返す仕組みです。計算コストの高い関数を繰り返し呼ぶ場合に高速化できます。

```python
from functools import cache


@cache
def func1(num):
    ...


func1(0)  # 実際に計算される
func1(0)  # 2回目以降は同じ引数のため、メモ化された結果がそのまま返る
```

### コードのポイント

- `@cache` デコレータを付けるだけで、その関数の戻り値が自動的にキャッシュされる
- 2回目以降、**同じ引数**で呼び出された場合のみキャッシュが使われる(引数が異なれば再計算される)

> **注意**: 元のコードには `def func1(num)` の末尾にコロン `:` が抜けている、`fnc1(0)` / `fun1(0)` のようにタイポで関数名が呼び出しごとに違っている、という誤りがあったため、上記では修正しています。