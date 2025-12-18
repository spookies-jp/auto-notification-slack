# 閲覧なう

閲覧したWebページのURLを、SlackのIncoming Webhookに通知するChrome拡張です。拡張機能アイコンを押すと小さい送信ダイアログが開き、任意メッセージを添付して送信できます。

## できること

- 現在開いているタブのURLをSlackへ通知
- 送信時に任意メッセージを添付（メンション等）
- `denyList`（部分一致）に該当するURLは送信対象から除外
- Webhook URLを複数登録して切り替え（設定は永続化）

## 動作環境

- Google Chrome / Microsoft Edge（Manifest V3対応ブラウザ）
- Slack（Incoming Webhookを利用可能なワークスペース）

## セットアップ（必須）

### 1) SlackのIncoming Webhookを作成

Slack側でIncoming Webhook URLを発行し、通知先チャンネルを紐づけてください。

### 2) `denyList`（任意）

必要に応じて `src/config.ts` の `denyList` を編集します（部分一致）。

### 3) ビルド

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
3. 必要ならメッセージを入力して「Slackへ送信」を押す
4. SlackにURLが投稿されます

※ `denyList` に該当するURLでは送信できません。

### Webhook設定（永続化）

送信ダイアログの「設定」タブで Webhook を保存し、選択肢から切り替えできます。

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

- Incoming Webhook URLは秘密情報です。配布する場合、配布先の範囲＝Webhookを利用できる範囲になります。
- URLに機密情報（チケットID、検索条件、トークン等）が含まれる場合があります。必要に応じて `denyList` を強化してください。

## カスタマイズ

- 送信文言：`src/background.ts` の `payload.text` を編集
- 除外条件：`src/config.ts` の `denyList`（文字列の部分一致）を編集

## トラブルシューティング

- Slackに届かない：設定タブでWebhook URLを保存したか、Webhookが無効化されていないか確認してください
- 送信できない：URLが `denyList` に該当していないか確認してください
