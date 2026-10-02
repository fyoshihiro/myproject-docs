# Raspberry Pi

Raspberry Piの初期設定から、リモート接続、ファイアウォール、日本語入力、ウォッチドッグタイマー、USBブートまで、運用に必要な設定をまとめます。

## 目次

- [基本設定(raspi-config)](#基本設定raspi-config)
- [VNC Serverの設定](#vnc-serverの設定)
- [ファイアウォール](#ファイアウォール)
- [日本語入力(IM)](#日本語入力im)
- [ウォッチドッグタイマーの設定](#ウォッチドッグタイマーの設定)
- [Swapを無効にする](#swapを無効にする)
- [CPU温度の確認](#cpu温度の確認)
- [USBブート化](#usbブート化)
- [パーティション管理ユーティリティ(GParted)](#パーティション管理ユーティリティgparted)

---

## 基本設定(raspi-config)

`sudo raspi-config` で開く設定メニューから、以下を設定します。

| メニュー | 設定内容 |
|---|---|
| システム | パスワードの変更 |
| ディスプレイ | ヘッドレス時の解像度を 800x600 に設定 |
| インターフェイス | SSHとVNCをオンにする |
| ローカライゼーション | ロケールを `ja_JP.UTF-8` に設定 |
| ローカライゼーション | 無線LANの国設定を「JP」に設定 |

> **補足**: 「ヘッドレス解像度」は、モニターを接続せずにVNCなどでリモート接続する際に使われる仮想的な解像度です。モニター未接続だと解像度が低くなりすぎることがあるため、あらかじめ指定しておきます。

---

## VNC Serverの設定

VNC接続時の認証方式をパスワード認証に変更します。

1. VNC Server画面右上の三本線アイコンから「Options」を選択
2. 「Security」タブを開き、「Authentication」を **VNC password** に変更
3. 使用するパスワードを入力

---

## ファイアウォール

`ufw`(Uncomplicated Firewall)を使って、必要な通信のみを許可します。

```bash
sudo apt install ufw
sudo ufw enable
sudo ufw allow openssh
sudo ufw limit openssh
sudo ufw allow vnc
```

| コマンド | 内容 |
|---|---|
| `ufw enable` | ファイアウォールを有効化 |
| `ufw allow openssh` | SSH接続を許可 |
| `ufw limit openssh` | SSHへの接続回数を制限し、短時間の連続アクセス(総当たり攻撃など)を防ぐ |
| `ufw allow vnc` | VNC接続を許可 |

---

## 日本語入力(IM)

日本語入力のためのIME `fcitx-mozc` をインストールします。

```bash
sudo apt update --fix-missing
sudo apt install fcitx-mozc
im-config
```

`im-config` の実行後、設定を反映させるために一度ログアウト・ログイン(`relogin`)し直してください。

---

## ウォッチドッグタイマーの設定

ウォッチドッグタイマーは、システムがフリーズした際に自動的に再起動させるハードウェア機能です。サーバーとして無人稼働させる場合に有効化しておくと安心です。

### 1. カーネルパラメータでウォッチドッグを有効化

```bash
sudo nano /boot/config.txt
```

以下を追記(または変更)します。

```ini
dtparam=watchdog=on
```

### 2. ウォッチドッグの動作間隔を設定

```bash
sudo nano /etc/modprobe.d/bcm2835-wdt.conf
```

```ini
options bcm2835_wdt heartbeat=10 nowayout=0
```

`heartbeat=10` は、10秒間応答がなければ再起動する設定です。

### 3. systemd側のウォッチドッグ監視間隔を設定

```bash
sudo nano /etc/systemd/system.conf
```

```ini
RuntimeWatchdogSec=5
```

### 4. 再起動して反映

```bash
sudo reboot
```

### 5. ウォッチドッグが認識されているか確認

```bash
dmesg | grep bcm2835-wdt
```

以下のように表示されれば正常に認識されています。

```
[    3.276862] bcm2835-wdt bcm2835-wdt: Broadcom BCM2835 watchdog timer
```

### 動作テストについて(要注意)

ウォッチドッグが実際に機能するかを確かめるには、システムを意図的にフリーズさせ、自動的に再起動するかを確認する方法があります。

> ⚠️ **警告**: システムを強制的にフリーズさせるテストは、保存していない作業やファイルシステムに影響を与える可能性があります。**本番環境や重要なデータがある環境では絶対に実行しないでください**。検証用の環境でのみ行ってください。

テストに使われる「フォークボム」と呼ばれるシェルコマンドがありますが、実行するとシステムリソースを無限に消費し完全にフリーズします。この性質を利用してウォッチドッグの動作確認に使われることがありますが、内容を理解していない状態で実行しないでください。

---

## Swapを無効にする

SDカードの寿命を延ばす目的などで、Swap機能を無効化する場合は以下を実行します。

```bash
sudo apt-get remove dphys-swapfile
free
```

`free` コマンドでSwapの行が `0` になっていれば無効化できています。

---

## CPU温度の確認

```bash
vcgencmd measure_temp
```

---

## USBブート化

SDカードではなくUSBメモリ/SSDから起動させる設定です。

### 1. SDカードの内容をUSBデバイスにコピー

Raspberry Pi Imagerに含まれる「SD Card Copier」を使い、現在のSDカードの内容をUSBデバイスにまるごとコピーします。

### 2. USBブートを有効化する

```bash
echo program_usb_boot_mode=1 | sudo tee -a /boot/config.txt
echo "program_usb_boot_timeout=1" | sudo tee -a /boot/config.txt
sudo reboot
```

### 3. USBブート対応状況を確認する

```bash
vcgencmd otp_dump | grep 17:
```

出力が `17:3020000a` であれば、USBブートに対応した状態になっています。

### 4. USBデバイスを接続し、認識状況を確認する

```bash
lsblk
```

```
NAME        MAJ:MIN RM   SIZE RO TYPE MOUNTPOINT
sda           8:0    0 238.5G  0 disk 
├─sda1        8:1    0   256M  0 part 
└─sda2        8:2    0 238.2G  0 part 
mmcblk0     179:0    0  28.9G  0 disk 
├─mmcblk0p1 179:1    0   256M  0 part /boot
└─mmcblk0p2 179:2    0  28.7G  0 part /
```

この例では、`sda` がコピー先のUSBデバイス、`mmcblk0` が元のSDカードです。

### 5. USBデバイスのfstabを確認・修正する

```bash
sudo mount /dev/sda1 /mnt1
sudo nano /mnt1/etc/fstab
```

```fstab
proc       /proc           proc    defaults          0       0
/dev/sda1  /boot           vfat    defaults,flush    0       2
/dev/sda2  /               ext4    defaults,noatime  0       1
```

### 6. 起動パラメータのroot指定をUSBデバイスに変更する

```bash
sudo mount /dev/sda2 /mnt2
sudo nano /mnt2/boot/cmdline.txt
```

`root=` の指定を、コピー先のUSBデバイス(この例では `/dev/sda2`)に書き換えます。

```
root=/dev/sda2
```

---

## パーティション管理ユーティリティ(GParted)

パーティションのサイズ変更や作成・削除をGUIで行いたい場合は `gparted` を使用します。

```bash
sudo apt-get install gparted
sudo gparted
```