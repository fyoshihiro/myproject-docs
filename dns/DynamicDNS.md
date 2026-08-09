# Dynamic DNS(Cloudflare API + cron)

自宅のグローバルIPアドレスが変わるたびに、Cloudflare上のDNSレコード(Aレコード・SPFレコード)を自動で更新する仕組みです。CloudflareのAPIトークンを使ったシンプルなbashスクリプトと `cron` の組み合わせのため、`ddclient` のような専用ソフトより設定がわかりやすく、依存パッケージも少なく済みます。Raspberry Pi Zero 2のような非力な環境にも向いています。

## 目次

- [1. CloudflareのAPIトークンを発行する](#1-cloudflareのapiトークンを発行する)
- [2. Zone IDとRecord IDを確認する](#2-zone-idとrecord-idを確認する)
- [3. スクリプトを作成する](#3-スクリプトを作成する)
- [4. 動作テスト](#4-動作テスト)
- [5. cronに登録する](#5-cronに登録する)

---

## 1. CloudflareのAPIトークンを発行する

1. Cloudflareダッシュボード → 右上プロフィール →「APIトークン」→「トークンを作成」
2. 「ゾーンDNSの編集」テンプレートを選択
3. 権限: `Zone` / `DNS` / `Edit`
4. ゾーンリソース: 全て

発行されたトークンは、この後スクリプト内で使用するので控えておきます。

> **注意**: このトークンはDNSレコードを書き換えられる強い権限を持つため、パスワードと同様に厳重に管理してください。

---

## 2. Zone IDとRecord IDを確認する

### Zone ID

Cloudflareダッシュボードの対象ドメインの概要ページ右下に表示されています。

### Record ID(Aレコード)

以下のコマンドで、対象ドメインの全Aレコードとそれぞれの `id` を取得できます。`YOUR_API_TOKEN` と `YOUR_ZONE_ID` は実際の値に置き換えてください。

```bash
curl -X GET "https://api.cloudflare.com/client/v4/zones/YOUR_ZONE_ID/dns_records?type=A" \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" | jq '.result[] | {name, id}'
```

返ってきたJSONの `"id"` の値が、そのレコード名に対応するRecord IDです。

### Record ID(SPFレコード)

SPFレコードはTXTレコードとして登録されているため、TXTレコードを取得して探します。

```bash
curl -s -X GET "https://api.cloudflare.com/client/v4/zones/YOUR_ZONE_ID/dns_records?type=TXT" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" | jq '.result[] | {name, content, id}'
```

結果の中から `v=spf1` を含むレコードを探し、その `id` をメモしてください。

---

## 3. スクリプトを作成する

```bash
sudo nano /home/pi/cf-ddns.sh
```

```bash
#!/bin/bash

API_TOKEN="YOUR_API_TOKEN"
ZONE_ID="YOUR_ZONE_ID"
CACHE_FILE="/home/pi/.cf_last_ip"

# Aレコード名とIDのペア
declare -A RECORDS=(
  ["editor.example.com"]="RECORD_ID_1"
  ["home.example.com"]="RECORD_ID_2"
  ["mail.example.com"]="RECORD_ID_3"
  ["example.com"]="RECORD_ID_4"
  ["www.example.com"]="RECORD_ID_5"
)

# SPF(TXT)レコードのID
SPF_RECORD_ID="SPF_RECORD_ID"

CURRENT_IP=$(curl -s https://api.ipify.org)

if [ -z "$CURRENT_IP" ]; then
  echo "$(date): Failed to fetch current IP" >> /home/pi/cf-ddns.log
  exit 1
fi

if [ ! -f "$CACHE_FILE" ] || [ "$CURRENT_IP" != "$(cat $CACHE_FILE)" ]; then
  ALL_SUCCESS=true

  # --- Aレコードを順番に更新 ---
  for NAME in "${!RECORDS[@]}"; do
    RECORD_ID="${RECORDS[$NAME]}"

    # mail.example.comだけプロキシOFF(SMTP通信のため)
    if [ "$NAME" == "mail.example.com" ]; then
      PROXIED="false"
    else
      PROXIED="true"
    fi

    RESPONSE=$(curl -s -X PUT "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records/$RECORD_ID" \
      -H "Authorization: Bearer $API_TOKEN" \
      -H "Content-Type: application/json" \
      --data "{\"type\":\"A\",\"name\":\"$NAME\",\"content\":\"$CURRENT_IP\",\"ttl\":120,\"proxied\":$PROXIED}")

    if echo "$RESPONSE" | grep -q '"success":true'; then
      echo "$(date): $NAME updated to $CURRENT_IP (proxied=$PROXIED)" >> /home/pi/cf-ddns.log
    else
      echo "$(date): $NAME FAILED - $RESPONSE" >> /home/pi/cf-ddns.log
      ALL_SUCCESS=false
    fi
  done

  # --- SPF(TXT)レコードを更新(contentにダブルクォートを明示的に含める) ---
  SPF_CONTENT="\"v=spf1 ip4:${CURRENT_IP} mx ~all\""

  SPF_PAYLOAD=$(jq -n \
    --arg name "example.com" \
    --arg content "$SPF_CONTENT" \
    '{type: "TXT", name: $name, content: $content, ttl: 120}')

  SPF_RESPONSE=$(curl -s -X PUT "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records/$SPF_RECORD_ID" \
    -H "Authorization: Bearer $API_TOKEN" \
    -H "Content-Type: application/json" \
    --data "$SPF_PAYLOAD")

  if echo "$SPF_RESPONSE" | grep -q '"success":true'; then
    echo "$(date): SPF updated to ip4:$CURRENT_IP" >> /home/pi/cf-ddns.log
  else
    echo "$(date): SPF FAILED - $SPF_RESPONSE" >> /home/pi/cf-ddns.log
    ALL_SUCCESS=false
  fi

  # --- 全部成功した時だけキャッシュを更新 ---
  if [ "$ALL_SUCCESS" = true ]; then
    echo "$CURRENT_IP" > "$CACHE_FILE"
  fi
fi
```

### スクリプトの処理の流れ

1. `curl -s https://api.ipify.org` で現在のグローバルIPを取得する
2. 前回チェック時のIP(`$CACHE_FILE` に保存)と比較し、変化がなければ何もしない
3. IPが変わっていれば、`RECORDS` に列挙した各Aレコードを1つずつCloudflareのAPIで更新する
4. 続けてSPF(TXT)レコードも、新しいIPを反映した内容で更新する
5. **すべてのレコード更新が成功した場合のみ**、キャッシュファイルを新しいIPで上書きする

### ポイント

- **`proxied` の値**: `true` にすると、Cloudflareのプロキシ(オレンジ雲)を有効にしたまま運用できます。SSLを使っている場合、Cloudflareが発行する証明書との整合性が保たれるため通常は `true` のままで問題ありません。現在プロキシOFF(グレー雲、Full/Strict以外)で運用している場合は `false` に変更してください。
- **`mail.example.com` だけ `proxied=false`**: メールサーバー(SMTP)はCloudflareのプロキシ(HTTPやDNSのみ対応)を経由できないため、この部分だけ直接IPを指すよう除外しています。
- **キャッシュファイル(`$CACHE_FILE`)**: 前回更新したIPを保存しておき、変化がない限りAPIへのリクエストを送らないようにするための仕組みです。無駄なAPIコールを減らせます。
- **`ALL_SUCCESS` フラグ**: 一部のレコード更新が失敗した状態でキャッシュだけ更新してしまうと、次回以降IPが変わっても再試行されなくなります。それを防ぐため、全レコードの更新が成功した場合のみキャッシュを更新しています。

### 実行権限を付与する

```bash
sudo chmod +x /home/pi/cf-ddns.sh
```

### jqが未インストールの場合

このスクリプトはJSONの生成・整形に `jq` コマンドを使用します。

```bash
sudo apt install jq
```

---

## 4. 動作テスト

キャッシュファイルを削除してからスクリプトを実行することで、強制的に全レコードを更新させ、動作を確認できます。

```bash
rm -f /home/pi/.cf_last_ip
/home/pi/cf-ddns.sh
cat /home/pi/cf-ddns.log
```

ログの内容を確認し、Cloudflareダッシュボード上でも各Aレコードが現在のグローバルIPに更新されているか確認してください。

---

## 5. cronに登録する

```bash
crontab -e
```

末尾に以下を追加します(5分おきにチェック)。

```cron
*/5 * * * * /home/pi/cf-ddns.sh
```

これで、グローバルIPが変わったときだけ自動的にDNSレコードが更新されるようになります。ログは `/home/pi/cf-ddns.log` に蓄積されていくので、たまに `tail` コマンドなどで確認しておくと安心です。

```bash
tail -f /home/pi/cf-ddns.log
```