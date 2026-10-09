# クラウド画像処理

## 目的

写真受付、人物切り抜き、当たり判定生成、キャラクター保存をローカルPCからCloudflareへ移し、PCの電源に依存せず利用できるようにする。既存のローカルCaptureサービスは開発・障害時の代替経路として残す。

## 構成

```text
Cloudflare Pages
  -> Image Processing Worker
     -> R2: 入力写真、sprite.png、mask.png
     -> D1: ジョブ状態、キャラクター情報、当たり判定頂点
     -> Queue: 画像処理ジョブ
        -> Cloudflare Container (FastAPI + rembg + OpenCV)
```

- `apps/image-processing-worker`: 受付API、ジョブ認証、Queue consumer、R2/D1登録。
- `services/image-worker/Dockerfile`: 既存Python処理を変更せずコンテナ化する。
- `POST /process-upload`: ローカルパスではなくmultipart画像を受け取るコンテナ内部API。
- `apps/game`: `3・2・1`撮影、確認、登録、進捗ポーリング、完成後の一覧再読込。

## セキュリティ

- 画像はJPEG/PNG/WebP、12MB以下に限定する。
- ブラウザごとに同時実行ジョブを1件へ制限する。
- ジョブ状態は推測困難なBearer tokenを持つ利用者だけが参照できる。
- 本番では`TURNSTILE_REQUIRED=true`とし、`TURNSTILE_SECRET`をWorker secretとして登録する。
- キャラクター更新・削除は`ADMIN_TOKEN`を持つ管理操作だけに限定する。トークンをフロントへ埋め込まない。
- Containerでは低精度な矩形フォールバックを無効化し、切り抜き失敗を成功扱いにしない。
- 元写真は処理成功後に削除する。R2には失敗・中断入力を自動削除するライフサイクル規則も設定する。
- WorkerとContainerのログへ写真本体、認証トークン、個人名を出力しない。

「制限なし」はPC稼働時間による利用制限をなくす意味であり、ファイル上限、レート制限、Turnstile、保持期限は維持する。

## セットアップ

1. Workers Paidを有効化する。Cloudflare Containersの利用に必要。
2. R2を有効化し、`human-stack-capture-files`を作成する。
3. `apps/image-processing-worker/wrangler.example.jsonc`を`wrangler.jsonc`へコピーする。
4. D1 IDを実環境値へ置き換える。
5. QueueとD1 migrationを作成・適用する。
6. Turnstile widgetを公開Pagesホスト名用に作成し、secretを登録する。
7. Workerをdeployし、Pagesの`CAPTURE_PROXY` service bindingを新Workerへ切り替える。

```powershell
npx wrangler d1 create human-stack-capture
npx wrangler queues create human-stack-capture-jobs
npx wrangler r2 bucket create human-stack-capture-files
npx wrangler d1 migrations apply CAPTURE_DB --remote --config apps/image-processing-worker/wrangler.jsonc
npx wrangler secret put TURNSTILE_SECRET --config apps/image-processing-worker/wrangler.jsonc
npx wrangler secret put ADMIN_TOKEN --config apps/image-processing-worker/wrangler.jsonc
npx wrangler deploy --config apps/image-processing-worker/wrangler.jsonc
```

Turnstile widget作成と課金プラン有効化はCloudflareアカウントへの永続的変更を伴うため、所有者が対象アカウントとドメインを確認してから行う。

## Docker Desktopを使わないデプロイ

Cloudflare ContainerはOCIコンテナイメージを必要とするが、開発PC上のDocker Desktopは必須ではない。`.github/workflows/deploy-image-processing.yml`を手動実行すると、GitHub ActionsのLinux runnerがDockerfileをビルドし、WranglerでCloudflare RegistryへpushしてWorkerをdeployする。

GitHub repository secretsには次を登録する。

- `CLOUDFLARE_API_TOKEN`: Workers、Containers、D1、Queues、R2の必要権限を持つ専用token。
- `CLOUDFLARE_ACCOUNT_ID`: PagesとD1を所有するCloudflare account ID。
- `CAPTURE_D1_DATABASE_ID`: `human-stack-capture`のD1 database ID。

workflowは`workflow_dispatch`のみで、push時には自動deployしない。Workers Paid、R2、Worker secrets、Pages service bindingの準備が終わる前に公開系を切り替えないためである。

この方式でも内部ではDocker/BuildKitを使うが、実行場所がGitHubの一時runnerになる。PC側では従来どおりFastAPIを直接起動して画像処理を検証できる。

## 現在の導入状況

- コンテナ内部API、Worker、D1 migration、Queue、撮影UXは実装済み。
- D1 `human-stack-capture`とQueue `human-stack-capture-jobs`は作成済み。
- R2はアカウント側で未有効のためBucket未作成。
- Cloudflare ContainersはWorkers Paid未契約のためdeploy不可。
- Docker Desktop engineが停止しているため、ローカルDocker buildは未実施。Pythonネイティブ実行では実画像を使った切り抜き・マスク・5頂点当たり判定生成を確認済み。

上記2つのCloudflare契約条件が整うまでは、公開Pagesのservice bindingを既存Capture proxyから切り替えない。これにより現在の公開ゲームを壊さない。
