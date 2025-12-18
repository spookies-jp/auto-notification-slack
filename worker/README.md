# Worker (Cloudflare Workers)

Slack の `chat.postMessage` を中継します。

## 必要なもの

- Cloudflare Workers
- Slack App（Bot Token）
  - Bot Token Scopes: `chat:write`, `channels:read`
  - Workspace に Install して Bot User OAuth Token（`xoxb-...`）を取得

## Secrets（Cloudflare）

`wrangler secret put` で以下を設定します。

- `SLACK_BOT_TOKEN`

## Cloudflare Access（推奨）

この Worker のURLを Cloudflare Access で保護する前提です（未ログイン時は 401）。

`worker/wrangler.toml` の `REQUIRE_CLOUDFLARE_ACCESS` を `true` にしているため、Worker 側でも `cf-access-jwt-assertion` ヘッダーの存在をチェックします。

## Endpoints

- `GET /` / `GET /health`
- `POST /api/channels` public channel 一覧
- `POST /api/post` 投稿
