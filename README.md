# trump-truth-social-digest-worker

Cloudflare Worker that monitors Donald Trump posts via the Trump's Truth RSS archive, generates a Chinese digest every two hours, pushes a Feishu summary, and archives a detailed HTML report to object storage.

## Development

```bash
npm install
npm run check
npx wrangler dev
```

## Manual trigger

```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_MANUAL_TRIGGER_TOKEN" \
  https://<your-worker>/admin/trigger
```

## Runtime resources

- D1 database: `trump-truth-social-digest`
- KV namespace: runtime state (`RUNTIME_KV`)
- Workers AI binding: `AI`
- Object storage credentials: Tencent COS-compatible secrets

## Secrets

Provide these values via `.dev.vars` for local development and Cloudflare secrets for deployment:

- `FEISHU_WEBHOOK`
- `FEISHU_SECRET`
- `MANUAL_TRIGGER_TOKEN`
- `TENCENT_COS_SECRET_ID`
- `TENCENT_COS_SECRET_KEY`
- `TENCENT_COS_BUCKET`
- `TENCENT_COS_REGION`
- `TENCENT_COS_BASE_URL`

## Notes

- This project starts monitoring new posts from the time it is deployed; it does not backfill historical posts.
- The current primary source is `https://trumpstruth.org/feed`, with original Truth Social URLs preserved in the feed metadata.
