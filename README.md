# ともだちたわーばとる (Human Stack Battle)

撮影した人物を背景から切り抜き、シルエットに沿った当たり判定を生成して遊べる物理スタッキングゲームです。1人用と、同じPCで遊ぶローカル2人対戦に対応しています。

公開版: [https://human-stack-battle-game.pages.dev](https://human-stack-battle-game.pages.dev)

## ドキュメント

- [画像処理システム](docs/IMAGE_PROCESSING.md): 切り抜き、当たり判定、保存形式、運用、安全性、クラウド移行を詳しく説明しています。
- [アーキテクチャ](docs/ARCHITECTURE.md)
- [固定Capture経路](docs/CAPTURE_FIXED_ROUTE.md)
- [開発記録](docs/DEVELOPMENT_RECORD.md)
- [固定URL移行計画](docs/FIXED_URL_MIGRATION_PLAN.md)

## 必要環境

- Node.js 20以上
- Python 3.11から3.13を推奨
- Windows PowerShell、macOS、またはLinux

## セットアップ

```powershell
npm install
npm run setup:python
Copy-Item .env.example .env
```

`setup:python`はFastAPI、Pillow、OpenCV、`rembg`などをインストールします。初回の画像処理時には、指定した`rembg`モデルがダウンロードされる場合があります。

## ローカル起動

```powershell
npm run dev
```

[http://127.0.0.1:5173](http://127.0.0.1:5173)を開きます。このコマンドは次の3サービスを起動します。

- ViteゲームUI: `5173`
- Express API / WebSocket: `5174`
- FastAPI画像ワーカー: `8788`

写真はゲーム内の「キャラ撮影」から送るか、`runtime/inbox`へ`.jpg`、`.jpeg`、`.png`、`.webp`を置きます。生成物は`runtime/characters/<id>/`、一覧は`runtime/manifest.json`に保存されます。

## 操作

1人用:

- `A` / 左キー: 左移動
- `D` / 右キー: 右移動
- `Q` / `E`: 左右回転
- `Space` / `Enter`: 落下
- `Esc`: 一時停止

2人対戦は準備画面でWASD、矢印キー、画面操作、接続済みゲームコントローラーを割り当てます。同じ入力機器を両プレイヤーへ重複して割り当てることはできません。

## テストとビルド

```powershell
npm run test
npm run typecheck
npm run build
```

`runtime/manifest.json`がない新規cloneでは、デモキャラクターだけでビルドします。ローカルに生成キャラクターがある場合、ビルド前にスプライトと公開用メタデータを`apps/game/public`へ同期します。

## ローカル画像処理の運用

Windowsでは、画像ワーカー、Capture API、Named Tunnelをまとめて操作できます。

```powershell
npm run capture:start
npm run capture:status
npm run capture:stop
```

`.env.public.example`を`.env.public`へコピーし、公開元URLを設定してください。Named Tunnelのトークンとメタデータは`runtime/`へ保存され、Gitには含まれません。

現在の公開構成では、ゲーム本体とランキングはCloudflare上で常時利用できますが、新規撮影と画像処理はこのPCのCaptureサービスが起動中のときだけ利用できます。イベントでの短時間利用には適しますが、常設運用には安定性が足りません。常設する場合は、画像処理APIと`rembg`ワーカーをクラウドサーバまたはGPU対応レンタルサーバへ移すことを推奨します。具体的な移行案は[画像処理システム](docs/IMAGE_PROCESSING.md#クラウドサーバへの移行を推奨)に記載しています。

## Cloudflare設定

このリポジトリにはアカウント固有のD1 ID、Named Tunnel ID、認証トークンを含めません。次のサンプルをコピーし、自分のCloudflare環境の値を設定します。

```powershell
Copy-Item apps/game/wrangler.example.jsonc apps/game/wrangler.jsonc
Copy-Item apps/capture-proxy-worker/wrangler.example.jsonc apps/capture-proxy-worker/wrangler.jsonc
Copy-Item .env.public.example .env.public
```

設定後のデプロイ:

```powershell
npm run deploy:capture-proxy
npm run deploy:pages
```

## 公開リポジトリに含めないデータ

`.gitignore`で次を除外しています。

- 撮影元写真、切り抜き画像、マスク、生成キャラクター、マニフェスト
- Pagesへ同期した参加者キャラクター
- Cloudflare Tunnelトークン、Tunnel ID、D1 IDを含む実設定
- `.env`、`.env.public`、ログ、PID、端末固有のプロジェクト管理情報
- `node_modules`、Python仮想環境、ビルド出力

公開前には`git status`と秘密情報スキャンを必ず確認してください。
