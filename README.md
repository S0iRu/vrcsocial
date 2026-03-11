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

## デプロイ

本番ビルド後、アプリを起動し、必要に応じてリバースプロキシやトンネル（Cloudflare Tunnel など）で公開できます。

1. **ビルド**: `npm run build`
2. **起動**: `npm run start`（またはプロセスマネージャで常時起動）
3. **公開**: 利用する環境に合わせて、トンネル・リバースプロキシ・DNS などを設定し、アプリの待ち受けポートへ転送する。

## 注意事項

- VRChat APIの利用規約に従ってください
- 認証情報は安全に管理してください
- このアプリはVRChat公式ではありません
