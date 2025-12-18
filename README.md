# 閲覧なう

閲覧したWebページのURLを、Slackへ通知するChrome拡張です。拡張機能アイコンを押すと小さい送信ダイアログが開き、任意メッセージ（メンション等）を添付して送信できます。

送信は Cloudflare Workers を経由して Slack の `chat.postMessage` を呼び出します（拡張に Slack のトークン等を入れないため）。

## できること

- 現在開いているタブのURLをSlackへ通知
- 送信時に任意メッセージを添付（メンション等）
- `denyList`（部分一致）に該当するURLは送信対象から除外
- 送信先（Worker URL + Client Key + Channel）を複数登録して切り替え（設定は永続化）

## 動作環境

- Google Chrome / Microsoft Edge（Manifest V3対応ブラウザ）
- Slack（Incoming Webhookを利用可能なワークスペース）

## セットアップ（必須）

### 1) Slack App を作成（Bot Token）

Slack 側で App を作成して、Bot Token で投稿できるようにします（このトークンは Worker の Secret に置きます）。

1. Slack API で App を作成（From scratch）
2. OAuth & Permissions で Bot Token Scopes を追加
   - `chat:write`
   - `channels:read`（拡張の設定画面でチャンネル一覧を読むため）
3. Install App to Workspace
4. Bot User OAuth Token（`xoxb-...`）を控える

### 2) `denyList`（任意）

必要に応じて `src/config.ts` の `denyList` を編集します（部分一致）。

### 3) Cloudflare Workers をデプロイ

Worker は Slack Bot Token（secret）で Slack API を呼び出す中継をします。

1. `worker/` に移動して依存を入れる

```sh
cd worker
npm install
```

2. Slack の Bot Token を secret として設定

```sh
wrangler secret put SLACK_BOT_TOKEN
```

3. デプロイ

```sh
wrangler deploy
```

#### GitHub Actions で自動デプロイ（推奨）

`.github/workflows/worker_cd.yml` が `main` / `master` への push で Worker をデプロイします。

設定が必要なもの:

- GitHub Secrets:
  - `CLOUDFLARE_API_TOKEN`
  - `CLOUDFLARE_ACCOUNT_ID`
  - `SLACK_BOT_TOKEN`

### 3.5) Cloudflare Access（推奨）

Worker URL を Cloudflare Access で保護してください（拡張からは Cookie ベースのセッションでアクセスします）。

運用イメージ:

1. 利用者が最初に Worker URL をブラウザで開いて Cloudflare Access にログイン
2. 拡張の設定タブで Channel を「再読込」→選択→保存
3. 以後は拡張から送信（Access セッションが切れたら再ログイン）

### 4) 拡張機能をビルド

Node.js を用意して、依存関係をインストール → TypeScriptをビルドします。

```sh
npm install
npm run clean
npm run build
```

## インストール（利用者向け）

1. 配布されたZIPを展開（フォルダになります）
2. ブラウザで `chrome://extensions/` を開く
3. 右上の「デベロッパーモード」をON
4. 「パッケージ化されていない拡張機能を読み込む」を選択
5. 展開したフォルダ（`manifest.json` がある階層）を指定

## 使い方

1. 任意のページを開く
2. 拡張機能アイコンを押して送信ダイアログを開く
3. 「設定」タブで送信先を設定（初回のみ）
4. 必要ならメッセージを入力して「Slackへ送信」を押す
5. SlackにURLが投稿されます

※ `denyList` に該当するURLでは送信できません。

### 送信先設定（永続化）

送信ダイアログの「設定」タブで送信先を保存し、選択肢から切り替えできます。

最低限必要なもの:

- Worker URL（例: `https://xxxx.workers.dev`）
- 投稿先 Channel（「再読込」で一覧取得して選択）

#### Cloudflare Access ログイン

設定タブの `Cloudflare Access にログイン` を押すと Worker URL を開きます。ログイン後に Channel を再読込してください。

## 配布（管理者向け：ZIP化）

配布対象は拡張機能のファイル一式です（`.git` や `src/` は不要）。

例：

```sh
npm run build
zip -r auto-notification-slack.zip manifest.json dist README.md
```

この拡張は `popup.html` / `popup.css` も必要です。

```sh
npm run clean
npm run build
zip -r auto-notification-slack.zip manifest.json popup.html popup.css dist README.md
```

利用者には「ZIPを展開して、拡張機能を読み込む」手順で案内してください。

## 自動リリース（GitHub Actions）

`master` へのpush時に、`manifest.json` の `version` を `vX.Y.Z` タグとしてGitHub Releaseを自動作成し、拡張機能一式のZIPを添付します（タグが既に存在する場合はスキップ）。

- ワークフロー: `.github/workflows/release.yml`
- 新しいリリースを作るには `manifest.json` の `version` を更新してください

## セキュリティ/運用上の注意

- Slack の Bot Token は Worker のみが保持します（拡張には含めません）。
- URLに機密情報（チケットID、検索条件、トークン等）が含まれる場合があります。必要に応じて `denyList` を強化してください。

## カスタマイズ

- 送信文言：`src/background.ts` の `buildSlackText` を編集
- 除外条件：`src/config.ts` の `denyList`（文字列の部分一致）を編集

## トラブルシューティング

- Slackに届かない：Worker URL / Channel を保存したか、Cloudflare Access にログイン済みか、Slack App が Workspace にインストール済みか確認してください
- 送信できない：URLが `denyList` に該当していないか確認してください
