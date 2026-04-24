# trump-truth-social-digest-worker

A Cloudflare Worker scaffold for monitoring Donald Trump's public Truth Social posts,
generating Chinese digests every two hours, pushing short Feishu updates, and
archiving detailed Markdown reports to object storage.

## Tooling targets

```bash
npm install
npm run typecheck
npm run test
npm run check
```

> `npm run typecheck` is expected to fail in Task 1 until `src/index.ts` is created.

## Setup

1. Run `npm install`.
2. Copy `.dev.vars.example` to `.dev.vars` for local development.
3. Replace the placeholder Cloudflare resource IDs in `wrangler.jsonc` after creating KV and D1.
4. Start local development with `npm run dev` when the Worker entrypoint exists.

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

## Cloudflare bindings

`wrangler.jsonc` is scaffolded with these bindings and default vars:

- KV: `RUNTIME_KV`
- Workers AI: `AI`
- D1: `BRIEF_DB`
- Cron: `0 */2 * * *`
- Runtime vars for digest cadence, fetch window, alert thresholds, model, and profile URL
