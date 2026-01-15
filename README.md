# VRC Social

VRChatのフレンドのオンライン状況をリアルタイムで確認できるWebアプリケーション。

**Demo:** https://vrcsocial.s0iru.dev/

## 機能

- お気に入りフレンドのオンライン状況をリアルタイム表示
- フレンドがいるワールド・インスタンス情報の表示
- フレンドのオンライン/オフライン/ワールド移動のログ記録
- VRChat WebSocket APIによるリアルタイム更新（ポーリング不要）

## 技術スタック

- **フロントエンド**: Next.js 16, React, Tailwind CSS
- **リアルタイム通信**: Server-Sent Events (SSE) + VRChat WebSocket API
- **認証**: VRChat API (2FA対応)

## アーキテクチャ

```
ブラウザ ←─ SSE ─→ Next.js Server ←─ WebSocket ─→ VRChat Pipeline
```

サーバーサイドでVRChat WebSocket APIに接続し、Server-Sent Eventsでクライアントにリアルタイム配信します。

## セットアップ

### 1. 依存関係のインストール

```bash
npm install
```

### 2. 開発サーバーの起動

```bash
npm run dev
```

http://localhost:3000 でアクセスできます。

### 3. 本番ビルド

```bash
npm run build
npm run start
```

## デプロイ (Cloudflare Tunnel)

ローカルPCをサーバーとして、Cloudflare Tunnelで公開できます。

### 1. cloudflaredのインストール

```bash
winget install --id Cloudflare.cloudflared -e
```

### 2. Cloudflareにログイン

```bash
cloudflared tunnel login
```

### 3. トンネルの作成

```bash
cloudflared tunnel create vrcsocial
```

### 4. DNSの設定

Cloudflareダッシュボードで、CNAMEレコードを追加:
- **Name**: 任意のサブドメイン
- **Target**: `<TUNNEL_ID>.cfargotunnel.com`

### 5. 設定ファイルの作成

`~/.cloudflared/config.yml`:

```yaml
tunnel: <TUNNEL_ID>
credentials-file: ~/.cloudflared/<TUNNEL_ID>.json

ingress:
  - hostname: your-domain.example.com
    service: http://localhost:3000
  - service: http_status:404
```

### 6. 起動

```bash
# ターミナル1: Next.jsサーバー
npm run start

# ターミナル2: Cloudflareトンネル
cloudflared tunnel run vrcsocial
```

## 注意事項

- VRChat APIの利用規約に従ってください
- 認証情報は安全に管理してください
- このアプリはVRChat公式ではありません
