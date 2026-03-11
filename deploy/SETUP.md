# 本番サーバー 残り手順

このPCで以下だけ実行すれば、再起動後もすべて自動起動します。

---

## 1. PM2 の再起動時自動起動

**済** — `pm2 startup` を実行し、systemd サービス `pm2-s0iru` が有効化済み。`pm2 save` も実行済み。再起動後も自動でアプリが復帰します。

---

## 2. Cloudflare Tunnel

**済** — `s0iru-dev-server` トンネルで cloudflared が稼働中。ユーザーサービス `cloudflared` を有効化済み。Public Hostname の設定はダッシュボードで実施。

---

## 3. GitHub Actions self-hosted runner

**済** — runner を `~/actions-runner` に設定・登録済み。ユーザーサービス `actions-runner` を有効化済み。main に push すると自動デプロイが走る。

---

## 現在の状態

- **Node 20**: nvm でインストール済み
- **vrcsocial**: PM2 で起動中（ポート 3001）。`pm2 save` 済み、`pm2 startup` 済み。再起動後も自動復帰する
- **cloudflared**: `~/.local/bin` に配置済み。ユーザーサービス `cloudflared` で稼働中。再起動後も自動起動
- **actions-runner**: `~/actions-runner` に設定・登録済み。ユーザーサービス `actions-runner` で稼働中。再起動後も自動起動
- **linger**: 有効済み（再起動後もユーザーサービスが動く）
