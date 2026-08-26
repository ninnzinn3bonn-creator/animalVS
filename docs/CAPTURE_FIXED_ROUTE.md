# Pagesとキャラクター撮影APIの固定経路

## 公開構成

キャラクター撮影機能はゲームと同じ固定URLを入口として使用します。

```text
https://YOUR_PAGES_PROJECT.pages.dev/capture/*
  -> Pages Function
  -> Service binding: YOUR_CAPTURE_PROXY_WORKER
  -> Workers VPC binding
  -> Named Tunnel
  -> PC: http://127.0.0.1:5180
  -> FastAPI image worker: http://127.0.0.1:8788
```

`apps/game/.env.pages`の`VITE_API_BASE_URL`には、自分のPagesプロジェクトの`/capture` URLを設定します。Quick Tunnelの一時URLは使いません。

## 設定

実際のCloudflareアカウントID、D1 ID、Named Tunnel ID、認証トークンはGitへ保存しません。

```powershell
Copy-Item apps/game/wrangler.example.jsonc apps/game/wrangler.jsonc
Copy-Item apps/capture-proxy-worker/wrangler.example.jsonc apps/capture-proxy-worker/wrangler.jsonc
Copy-Item .env.public.example .env.public
```

コピーしたファイルへ自分のプロジェクト名、D1 ID、Tunnel ID、許可するPages originを設定します。

## 起動と停止

```powershell
npm run build
npm run capture:start
npm run capture:status
```

停止:

```powershell
npm run capture:stop
```

PC側が停止中でもPagesのゲーム本体と既存の静的キャラクターは動作します。停止するのは新しい写真の撮影、切り抜き、キャラクター一覧の動的更新です。

## デプロイ

```powershell
npm run deploy:capture-proxy
npm run deploy:pages
```

Workerまたはbindingを変更した場合は、接続Workerを先にデプロイしてからPagesをデプロイします。

## 確認

```powershell
Invoke-RestMethod https://YOUR_PAGES_PROJECT.pages.dev/capture/api/health
Invoke-RestMethod https://YOUR_PAGES_PROJECT.pages.dev/capture/api/characters
```

常設運用ではPC依存を避けるため、画像処理APIとPythonワーカーをクラウドサーバまたはレンタルサーバへ移すことを推奨します。詳細は[画像処理システム](IMAGE_PROCESSING.md#クラウドサーバへの移行を推奨)を参照してください。
