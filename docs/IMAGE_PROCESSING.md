# 画像処理システム

## 目的

カメラで撮影した人物写真から、次のゲーム用データを自動生成します。

1. 背景が透明な人物スプライト
2. 白い縁取りと影を加えた表示用PNG
3. アルファチャンネルから作る当たり判定ポリゴン
4. ゲームが読み込めるキャラクターメタデータ

撮影者が決まったポーズへ正確に合わせたり、キャラクターごとに当たり判定を手作業で作ったりする工程は不要です。

## 現在の構成

```text
ブラウザのカメラ
  -> 675 x 1200 JPEGを生成
  -> POST /api/photos (multipart/form-data)
  -> Express API (127.0.0.1:5180 または開発時5174)
  -> runtime/inboxへ保存
  -> 直列ProcessingQueue
  -> FastAPI画像ワーカー (127.0.0.1:8788)
  -> rembg + Pillow + OpenCV
  -> runtime/characters/<id>/へ生成
  -> runtime/manifest.jsonをアトミック更新
  -> WebSocketでブラウザへ完了通知
```

公開版からローカルPCへ到達する経路は次のとおりです。

```text
Cloudflare Pages /capture/*
  -> Pages Function
  -> Service binding
  -> Capture proxy Worker
  -> Workers VPC binding
  -> Cloudflare Named Tunnel
  -> PC上のExpress API :5180
```

ゲーム本体とランキングはCloudflare側だけで動きます。上記の最後にあるPC上のAPIと画像ワーカーは、PCが起動し、CaptureサービスとTunnelが正常に動いている場合に限り利用できます。

## コンポーネント

| 場所 | 役割 |
| --- | --- |
| `apps/game/src/ui/App.ts` | カメラ起動、内外カメラ切替、縦長フレーム化、送信、5秒クールダウン、進捗表示 |
| `apps/server/src/index.ts` | アップロード受付、容量制限、CORS、キャラクターAPI、静的画像配信 |
| `apps/server/src/watcher/PhotoWatcher.ts` | `runtime/inbox`を監視し、書き込み完了後にキューへ渡す |
| `apps/server/src/processing/ProcessingQueue.ts` | 画像検証、SHA-256重複判定、1件ずつの処理、失敗ファイル隔離 |
| `services/image-worker/processor.py` | EXIF補正、縮小、切り抜き、装飾、成果物とメタデータの生成 |
| `services/image-worker/segmentation.py` | `rembg`による背景除去とフォールバック処理 |
| `services/image-worker/contour.py` | アルファマスクから凸包ポリゴンを生成 |
| `apps/server/src/characters/ManifestRepository.ts` | スキーマ検証済み一覧を一時ファイル経由で安全に更新 |
| `scripts/sync-static-characters.mjs` | Pagesビルド向けにスプライトと公開用メタデータだけを同期 |

## 撮影から登録まで

### 1. ブラウザで撮影

`getUserMedia`でカメラを開き、内カメラ`user`と外カメラ`environment`を切り替えられます。撮影時はCanvasへ`675 x 1200`の縦長JPEGとして描画し、`FormData`の`photo`へ格納します。

連続撮影によるPC負荷を避けるため、送信成功後は撮影ボタンを5秒間無効化します。画面には「作成完了まで10秒ほどお待ちください」と表示します。ただし実時間はPC性能、モデルの初回ロード、写真サイズによって変わります。

### 2. APIで受付と検証

Expressはアップロードをメモリ上で受け取り、`MAX_UPLOAD_MB`を上限として`runtime/inbox`へ保存します。現在対応する形式はJPEG、PNG、WebPです。

キュー投入後、`sharp`で画像として読み取れることと幅・高さが存在することを確認します。ファイルのSHA-256が既存キャラクターと同じ場合は重複として処理を省略します。キューは直列なので、同時に複数の推論を走らせてPCのメモリやCPUを急増させません。

### 3. 向き補正と縮小

PythonワーカーはPillowで画像を開き、`ImageOps.exif_transpose`でスマートフォン写真のEXIF Orientationを画素へ反映します。その後RGBAへ変換し、長辺を最大1200pxへ縮小します。

この処理により、縦向き写真が横倒しになる問題を避け、背景除去モデルへ渡す画素数を制限します。生成PNGには元写真のEXIFメタデータを引き継ぎません。

### 4. 人物の切り抜き

標準では`rembg`の`birefnet-portrait`モデルを使用します。モデル名は`REMBG_MODEL`で変更できます。セッションはプロセス内でキャッシュされるため、2枚目以降はモデル初期化の負荷が下がります。

`rembg`またはモデルの読み込みに失敗した場合、処理全体を停止させず、中央72%・高さ90%の柔らかい矩形マスクへフォールバックします。このフォールバックは人物を正確に切り抜くものではありません。品質を保証したい運用では、`/health`だけでなくテスト写真の切り抜き結果も起動時に確認し、`rembg`の失敗を監視してください。

切り抜き後はアルファが存在する範囲へ20pxの余白付きでトリミングし、長辺620pxへ縮小します。前景が1画素もない場合はエラーにします。

### 5. ゲーム用スプライト

人物のアルファを膨張・ぼかして白い縁取りを作り、別のぼかしから薄い影を作ります。透明Canvasへ影、白縁、人物の順に合成し、`sprite.png`として保存します。

生成先の例:

```text
runtime/characters/abc123def456/
  sprite.png       ゲーム表示用RGBA画像
  mask.png         sprite.pngのアルファチャンネル
  character.json   サイズ、輪郭、名前、作成日時など
  original.jpg     SAVE_ORIGINALS=trueの場合のみ作る複製
```

注意: `SAVE_ORIGINALS=false`はキャラクターフォルダへの複製を止める設定です。現在の実装では、処理成功後も受付元の`runtime/inbox`に写真が残ります。個人写真を保存しない運用では、イベント終了後に`runtime/inbox`、`runtime/rejected`、不要な`runtime/characters`を明示的に削除するか、保存期間に基づく自動削除を別途実装してください。

### 6. 当たり判定

`mask.png`のアルファ値が24を超える画素を前景とみなします。OpenCVが使える場合は最大の外側輪郭を選び、凸包を計算し、周長の2.5%を許容値として輪郭を近似します。頂点は最大8点へ減らします。

頂点座標は画像中心を原点として正規化します。

```text
normalizedX = (pixelX - width / 2) / width
normalizedY = (pixelY - height / 2) / height
```

ゲーム側は表示サイズへ拡大してMatter.jsの剛体を作ります。このため元画像の解像度が変わっても、スプライトと当たり判定の比率が維持されます。

OpenCVが利用できない場合は前景の境界矩形、前景が小さすぎる場合は固定の四角形へフォールバックします。現在の方式は凸包なので、腕と胴体の間などの凹みは当たり判定へ反映されません。安定した積み上げを優先した仕様です。

### 7. 登録とブラウザ反映

`character.json`は次の契約を持ちます。

```json
{
  "id": "abc123def456",
  "name": "participant",
  "enabled": true,
  "spriteUrl": "/characters/abc123def456/sprite.png",
  "width": 420,
  "height": 620,
  "collisionMode": "convexHull",
  "vertices": [{ "x": -0.31, "y": -0.47 }],
  "sourceHash": "sha256",
  "createdAt": "2026-08-26T00:00:00Z"
}
```

Node側はZodで応答を検証し、`runtime/manifest.json`を一時ファイルへ書いてからrenameします。途中終了でマニフェストが半端なJSONになる可能性を抑えています。完了後は`character.added`をWebSocket配信し、ブラウザが一覧を再取得します。

## ローカルでのセットアップ

```powershell
npm install
python -m venv .venv
.\.venv\Scripts\Activate.ps1
npm run setup:python
Copy-Item .env.example .env
npm run dev
```

確認:

```powershell
Invoke-RestMethod http://127.0.0.1:8788/health
Invoke-RestMethod http://127.0.0.1:5174/api/health
```

常設の公開Capture経路をローカルPCへ接続する場合は、`.env.public.example`を`.env.public`へコピーし、Named TunnelとCloudflare側のbindingを設定してから次を実行します。

```powershell
npm run build
npm run capture:start
npm run capture:status
```

停止:

```powershell
npm run capture:stop
```

## 障害時の確認

1. `npm run capture:status`で8788、5180、Named Tunnelを確認する。
2. `runtime/capture-worker.err.log`でPythonモデルや依存関係のエラーを確認する。
3. `runtime/capture-server.err.log`で受付APIのエラーを確認する。
4. `runtime/capture-named-tunnel.err.log`でTunnel接続を確認する。
5. `GET /api/processing`で`queued`、`processing`、`failed`を確認する。
6. 失敗した入力は`runtime/rejected`を確認する。

ログや`rejected`写真には個人情報が含まれる可能性があります。外部へ共有する前に内容を確認してください。

## セキュリティとプライバシー

- 元写真、マスク、生成キャラクター、マニフェスト、ログ、Tunnelトークンは`.gitignore`で除外します。
- Cloudflareの実際のD1 ID、Tunnel ID、認証情報はサンプル設定へ書きません。
- ローカルサービスは`127.0.0.1`へbindし、LANへ直接公開しません。
- CORSはブラウザの制約であり、API認証ではありません。公開Capture経路には認証、レート制限、アップロード回数制限が必要です。
- 拡張子やMIMEだけを信用せず、画像デコード、最大ファイル容量、最大画素数を検証してください。現在は容量とデコードを検証していますが、最大画素数と認証は今後の強化項目です。
- 被写体から保存と利用の同意を取り、保存期間と削除手順を決めてください。
- Pagesへ同期する`public/characters`は元写真ではありませんが、人物の外見を含む個人データです。公開範囲を参加者へ説明してください。

## クラウドサーバへの移行を推奨

現在のローカルPC + Named Tunnel方式は、イベント当日の短時間利用や試験には扱いやすい一方、次の理由で常設運用には向きません。

- PCの電源、スリープ、Windows Update、回線状態で画像処理が停止する。
- 初回モデルロードや複数撮影で処理時間が変動する。
- 公開APIへの大量送信がPCのCPU、メモリ、回線を消費する。
- 障害監視、自動再起動、バックアップ、保存期限の強制が弱い。

そのため、常設公開では画像処理部分をクラウドサーバまたはレンタルサーバへ移すことを推奨します。最初の移行は、Node APIとPythonワーカーを同じ常時起動のVMまたはコンテナホストへ載せる方式が最も単純です。CPUでも動作しますが、同時処理数や待ち時間を重視する場合はGPU対応サーバを検討します。

推奨する段階構成:

```text
Pages
  -> 認証・レート制限付きCapture API
  -> ジョブキュー
  -> CPU/GPU画像処理ワーカー
  -> オブジェクトストレージ (sprite/mask/original)
  -> DB (character metadata/status)
  -> 完了通知またはポーリング
```

移行時には現在の`sourcePath`と`charactersDir`をそのまま公開APIへ持ち込まないでください。これらはNodeとPythonが同じPCのファイルシステムを共有する前提です。クラウド版では、アップロードIDまたはオブジェクトストレージのキーをジョブへ渡し、ワーカーが入力を取得して成果物をストレージへ書く契約に変更します。

必要な設計変更:

1. アップロード直後にジョブIDを返し、同期HTTPのタイムアウトから分離する。
2. 直列キューを永続キューへ置き換え、再試行回数とデッドレターを設定する。
3. スプライト、マスク、必要な場合だけ暗号化した元写真をオブジェクトストレージへ保存する。
4. `manifest.json`をDBのキャラクターテーブルと処理ジョブテーブルへ移す。
5. API認証、レート制限、1ユーザーあたりの同時ジョブ数、ファイル・画素上限を設ける。
6. 元写真の自動削除期限、利用者からの削除要求、監査ログを実装する。
7. モデルロード時間、処理時間、失敗率、キュー長、メモリ使用量を監視する。
8. 一時障害時は既存キャラクターでゲームを継続し、撮影だけを利用不可表示にする。

`rembg`、ONNX Runtime、OpenCVはネイティブ依存と比較的大きいモデルを使います。エッジWorkerへ直接移植できる前提にはせず、PythonコンテナまたはVMで互換性とメモリを検証してください。フロントの固定URLは維持し、Capture APIの接続先だけをクラウドへ切り替えると、ゲーム側の変更を小さくできます。

## 公開リポジトリの方針

GitHubへ置くのは処理コード、テスト、説明、サンプル設定だけです。次は公開しません。

- `runtime/**`
- `apps/game/public/characters/**`
- `apps/game/public/data/characters.json`
- 元写真や参加者画像
- `.env`、`.env.public`
- 実際の`wrangler.jsonc`
- Tunnelトークン、Tunnelメタデータ、D1 ID
- ログ、PID、端末固有パス

公開用ビルドにキャラクターを含める操作と、GitHubへソースをpushする操作は別管理にしてください。
