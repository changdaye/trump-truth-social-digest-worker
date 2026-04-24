# trump-truth-social-digest-worker design

- Date: 2026-04-24
- Status: approved for planning
- Reference implementation: `/Users/changdaye/Documents/jinshi-market-brief-worker`
- Target account: `https://truthsocialapp.com/@realDonaldTrump`
- Repository target: pending exact GitHub org login for the requested "常大爷" org (authenticated account: `changdaye`)

## 1. Goal

Build a new standalone open-source Cloudflare Worker project that monitors Donald Trump's Truth Social public page, captures only new original text posts from `@realDonaldTrump`, and every two hours sends a Chinese digest to Feishu plus a detailed Markdown report archived to object storage.

The product goal is not deep political analysis. The first version should answer one practical question clearly: **what did Trump post in the last two hours, in readable Chinese, without directly pushing raw English text to the user?**

## 2. Scope

### In scope

- New standalone project folder and Git repository: `trump-truth-social-digest-worker`
- Cloudflare Worker implementation style aligned with `jinshi-market-brief-worker`
- Scrape Truth Social public webpages directly, without relying on an API
- Monitor only `@realDonaldTrump`
- Include only Trump's original text posts
- Run every two hours on Beijing even hours
- No quiet hours / no overnight mute window
- Produce:
  - a short Feishu digest message
  - a detailed Markdown report uploaded to object storage
- Reuse the same model family and integration style as the reference project via Cloudflare Workers AI
- Use the model to generate:
  - near-literal Chinese translation / paraphrase
  - auto-generated topic tags
  - one-sentence interpretation
  - batch summary for the Feishu brief
- Store runtime and processing state with D1 + KV + object storage
- Keep heartbeat notifications and repeated-failure alerts
- Support manual trigger and health check routes

### Out of scope

- Historical backfill before deployment
- Monitoring any account other than `@realDonaldTrump`
- Image understanding, video understanding, or OCR
- Reply/repost monitoring
- Admin dashboard or historical report UI
- Fact checking, stance scoring, sentiment systems, or long-form political analysis
- Guaranteed API-grade completeness

## 3. Reference-pattern alignment

The project should intentionally mirror the operational pattern of `jinshi-market-brief-worker`:

- Cloudflare Worker runtime
- scheduled digest job
- D1 for durable records
- KV for runtime state and alert bookkeeping
- object storage detailed report upload
- Feishu webhook push
- Workers AI summarization / transformation
- heartbeat and failure alert messages
- manual trigger endpoint

The content domain changes from Jinshi market pages to Truth Social, but the deployment, storage, alerting, and report-archiving pattern should remain familiar.

## 4. End-user behavior

### 4.1 Feishu short message

When there are new valid posts in the current cycle, the worker sends a concise Chinese message to Feishu containing:

1. one short overall summary for the two-hour window
2. two to five important post summaries in Chinese
3. a detailed report link at the end

The short message should stay readable in Feishu and must not dump raw English post bodies.

### 4.2 Detailed report

For a successful cycle with new posts, generate one Markdown report and upload it to object storage.

Each included post must contain:

- Chinese translation / paraphrase
- model-generated topic tags
- one-sentence interpretation
- publish time
- original post URL

The report should not include full English raw text by default.

### 4.3 Empty cycles

If no new valid posts are found for a cycle:

- do not send a normal digest message
- do not generate a new detailed report
- do not treat the cycle as a failure
- heartbeat and alerting continue to operate normally

## 5. Source and extraction rules

### 5.1 Source entrypoint

Use the public profile page:

- `https://truthsocialapp.com/@realDonaldTrump`

This page is the discovery entrypoint for each run.

### 5.2 Candidate discovery

Each run scans the current public profile page for recent post cards and extracts candidate data such as:

- author handle
- visible text snippet / text body
- timestamp
- post URL
- any detectable reply / repost markers

### 5.3 Valid-post criteria

A post qualifies only if all these are true:

- author is `@realDonaldTrump`
- it is an original post rather than a repost / reply
- it contains usable text content
- it has not already been successfully processed

### 5.4 Invalid-post criteria

Skip posts that are:

- reposts / re-truths / forwards
- replies
- pure media posts with no meaningful text
- duplicates already processed earlier
- malformed entries where originality or usable text cannot be confirmed

### 5.5 Detail enrichment

If list-page data is incomplete, open the post detail page to confirm:

- final canonical post URL
- publish time
- full text body
- originality
- text-post eligibility

## 6. Scheduling and time logic

### 6.1 Schedule

Run on Beijing even hours, every two hours, for example:

- 08:00
- 10:00
- 12:00
- 14:00
- ...

### 6.2 Processing window

User-facing cadence is a two-hour digest, but the processing logic should key off the last successful run state plus processed IDs instead of a rigid fixed clock window.

This prevents post loss after intermittent failures.

### 6.3 No historical backfill

The first deployment starts from the time the service becomes active. Older posts are ignored.

## 7. AI behavior

### 7.1 Model choice

Use the same Workers AI model strategy already used by `jinshi-market-brief-worker`.

### 7.2 AI tasks

For each valid post, the model should generate:

- a concise Chinese translation / paraphrase that stays close to the original meaning
- one to three topic tags
- one neutral one-sentence interpretation

For each digest batch, the model should generate:

- a short overall Chinese summary suitable for Feishu

### 7.3 Translation style

Translation should favor fidelity over editorialization:

- stay close to the source meaning
- allow light reordering for natural Chinese
- avoid extended commentary
- avoid adding background knowledge unless necessary for readability
- never push the raw English original as the main user-facing output

### 7.4 Tag style

Tags should be short and scan-friendly, for example:

- election
- immigration
- China
- trade
- border
- media
- judiciary

The implementation should still treat these as free-form model outputs rather than a fixed taxonomy.

### 7.5 Fallback mode

If AI output is unavailable, the system may degrade gracefully, but it should still avoid dumping full raw English post text into Feishu.

Fallback output can include limited structural information such as:

- time
- link
- a short notice that AI processing is temporarily unavailable

## 8. Message and report format

### 8.1 Feishu short message shape

Recommended structure:

- lead summary
- key posts section
- detailed report link

The style should remain concise and similar to the user's other worker projects.

### 8.2 Detailed report shape

Recommended sections:

1. title
2. generated-at metadata
3. digest summary
4. per-post detailed sections

### 8.3 Object storage key

Follow the reference-project naming style:

- prefix: project directory name
- filename: UTC timestamp

Example:

- `trump-truth-social-digest-worker/20260424100000.md`

## 9. Storage design

### 9.1 Object storage

Use object storage only for final Markdown detailed reports.

### 9.2 D1

Use D1 for durable business records, including:

- processed post identities
- post fingerprints for de-duplication fallback
- digest-run records
- report object keys / URLs
- execution summaries and failure snapshots

### 9.3 KV

Use KV for lightweight runtime state, including:

- last successful run time
- last heartbeat time
- consecutive failure count
- latest error summary
- alert cooldown state
- lightweight cursor / checkpoint state if useful

## 10. De-duplication and resilience

### 10.1 Primary de-duplication

Prefer a stable post ID when Truth Social exposes one.

### 10.2 Secondary fallback fingerprint

When a stable ID is unavailable or unreliable, compute a fingerprint from:

- canonical post URL
- normalized publish time
- normalized text body

### 10.3 Partial-failure handling

Single-post failures should be logged and skipped without necessarily failing the entire batch.

Escalate to full-run failure when a core stage breaks, such as:

- source page fetch failure
- storage write failure
- report upload failure
- Feishu send failure
- unrecoverable digest construction failure

## 11. Heartbeat, alerts, and operations

### 11.1 Heartbeat

Keep heartbeat notifications so the user can verify the worker is alive.

### 11.2 Failure alerts

Keep repeated-failure alerting with a threshold and cooldown, aligned with the reference project.

### 11.3 Manual trigger

Expose an authenticated manual trigger endpoint for:

- first deployment validation
- troubleshooting
- ad hoc reruns of the current cycle

### 11.4 Health check

Expose a lightweight health endpoint.

## 12. Risks and constraints

- Truth Social scraping depends on public webpage structure and may break when markup changes.
- There is no API guarantee or historical completeness guarantee.
- Politically sensitive content may contain sarcasm or shorthand that weakens translation fidelity.
- The user explicitly does not want raw English text pushed as the main output.
- GitHub remote creation is currently blocked because local `gh` authentication is invalid and must be refreshed before remote creation can be completed.

## 13. Acceptance criteria

The first version is acceptable when all of the following are true:

1. a new standalone project exists locally under `trump-truth-social-digest-worker`
2. the project structure and operational model align with `jinshi-market-brief-worker`
3. scheduled execution runs every two hours on Beijing even hours
4. the worker discovers only new original text posts from `@realDonaldTrump`
5. duplicate posts are not re-sent across successful runs
6. Feishu short messages are Chinese-first and include a detailed report link
7. detailed reports are uploaded to object storage using the project-prefix + UTC-timestamp naming convention
8. each report entry includes translation/paraphrase, tags, interpretation, publish time, and source link
9. no historical backfill is attempted
10. heartbeat and repeated-failure alerts work
11. manual trigger and health check routes work

## 14. Recommended next step

Create an implementation plan based on this design, then scaffold and build the worker by reusing patterns from `jinshi-market-brief-worker` wherever that reduces risk and code volume.
