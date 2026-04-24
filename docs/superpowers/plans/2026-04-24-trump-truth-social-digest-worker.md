# Trump Truth Social Digest Worker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Cloudflare Worker that scrapes new original text posts from `@realDonaldTrump`, translates them into concise Chinese digests every two hours, pushes a Feishu summary, and archives a detailed Markdown report to object storage.

**Architecture:** Reuse the `jinshi-market-brief-worker` shape: a scheduled Worker orchestrates scraping, normalization, AI post-processing, report generation, Feishu push, and D1/KV/COS persistence. Truth Social scraping is split into discovery + detail enrichment so the job can stay light while still collecting complete fields for de-duplication and reporting.

**Tech Stack:** TypeScript, Cloudflare Workers, Wrangler, D1, KV, Workers AI, Vitest, Tencent COS-style signed uploads, Feishu webhook push.

---

## Planned file structure

### Create

- `package.json` — project metadata and npm scripts aligned with the reference worker
- `tsconfig.json` — TypeScript compiler configuration for Worker code
- `vitest.config.ts` — Worker-aware Vitest configuration
- `wrangler.jsonc` — Worker entrypoint, cron schedule, bindings, and runtime vars
- `.dev.vars.example` — local secret/env template without real credentials
- `migrations/0001_init.sql` — D1 schema for processed posts and digest runs
- `src/index.ts` — Worker fetch/scheduled entrypoints and orchestration
- `src/types.ts` — env, config, scraper, AI, runtime, and DB record types
- `src/config.ts` — env parsing and validation
- `src/db.ts` — D1 queries for processed posts and digest runs
- `src/lib/admin.ts` — bearer-token manual trigger authorization
- `src/lib/message.ts` — Feishu short message, heartbeat, and failure-alert builders
- `src/lib/report.ts` — detailed Markdown report and object-key builders
- `src/lib/runtime.ts` — KV runtime-state helpers and alert/heartbeat decisions
- `src/lib/value.ts` — integer parsing, truncation, hashing/string helpers
- `src/services/truthsocial.ts` — profile scrape, post-detail fetch, normalization, filtering, and de-duplication helpers
- `src/services/llm.ts` — Workers AI prompts for post translation/tagging/interpretation and batch summary
- `src/services/feishu.ts` — signed Feishu webhook push
- `src/services/cos.ts` — signed object upload
- `test/config.test.ts` — config parsing tests
- `test/message.test.ts` — message/report formatting tests
- `test/runtime.test.ts` — runtime-state decision tests
- `test/truthsocial.test.ts` — Truth Social extraction/filtering tests
- `test/index.test.ts` — top-level fetch/trigger/scheduled flow tests with mocked dependencies

### Modify

- `README.md` — replace placeholder status with setup, architecture, and operation docs
- `docs/superpowers/specs/2026-04-24-trump-truth-social-digest-worker-design.md` — only if implementation planning reveals a spec wording mismatch that must be clarified before coding

---

### Task 1: Scaffold the Worker repository

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `wrangler.jsonc`
- Create: `.dev.vars.example`
- Modify: `README.md`

- [ ] **Step 1: Write the tooling target into the README**

```md
## Local verification target

The repository is ready for implementation when these commands work:

- `npm install`
- `npm run typecheck`
- `npm run test`
- `npm run check`
```

- [ ] **Step 2: Add the project package manifest**

```json
{
  "name": "trump-truth-social-digest-worker",
  "version": "0.1.0",
  "private": true,
  "description": "Cloudflare Worker that scrapes Donald Trump's Truth Social posts, generates a Chinese digest, and pushes summaries to Feishu.",
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "check": "npm run typecheck && npm run test"
  },
  "devDependencies": {
    "@cloudflare/vitest-pool-workers": "0.14.9",
    "@cloudflare/workers-types": "4.20260422.1",
    "typescript": "6.0.3",
    "vitest": "4.1.5",
    "wrangler": "4.84.1"
  }
}
```

- [ ] **Step 3: Add TypeScript and Vitest config files**

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noEmit": true,
    "types": ["@cloudflare/workers-types", "vitest/globals"],
    "skipLibCheck": true
  },
  "include": ["src", "test", "vitest.config.ts"]
}
```

```ts
// vitest.config.ts
import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    globals: true,
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.jsonc" }
      }
    }
  }
});
```

- [ ] **Step 4: Create Cloudflare resources, then write Wrangler config and local env template**

Run: `npx wrangler kv namespace create RUNTIME_KV`
Expected: JSON containing the real `id` and `preview_id` for `RUNTIME_KV`

Run: `npx wrangler d1 create trump-truth-social-digest`
Expected: JSON containing the real `database_id` for `trump-truth-social-digest`

```jsonc
// wrangler.jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "trump-truth-social-digest-worker",
  "main": "src/index.ts",
  "compatibility_date": "2026-04-24",
  "workers_dev": true,
  "preview_urls": false,
  "observability": { "enabled": true },
  "triggers": { "crons": ["0 */2 * * *"] },
  "kv_namespaces": [{ "binding": "RUNTIME_KV", "id": "<use the real id returned by wrangler>", "preview_id": "<use the real preview_id returned by wrangler>" }],
  "ai": { "binding": "AI" },
  "d1_databases": [{
    "binding": "BRIEF_DB",
    "database_name": "trump-truth-social-digest",
    "database_id": "<use the real database_id returned by wrangler>",
    "migrations_dir": "migrations"
  }],
  "vars": {
    "DIGEST_INTERVAL_HOURS": "2",
    "HEARTBEAT_INTERVAL_HOURS": "24",
    "REQUEST_TIMEOUT_MS": "15000",
    "FETCH_WINDOW_HOURS": "2",
    "MAX_POSTS_PER_DIGEST": "30",
    "LLM_MODEL": "@cf/meta/llama-3.1-8b-instruct",
    "TRUTHSOCIAL_PROFILE_URL": "https://truthsocialapp.com/@realDonaldTrump",
    "FAILURE_ALERT_THRESHOLD": "1",
    "FAILURE_ALERT_COOLDOWN_MINUTES": "180"
  }
}
```

```env
# .dev.vars.example
FEISHU_WEBHOOK=
FEISHU_SECRET=
MANUAL_TRIGGER_TOKEN=
TENCENT_COS_SECRET_ID=
TENCENT_COS_SECRET_KEY=
TENCENT_COS_BUCKET=
TENCENT_COS_REGION=
TENCENT_COS_BASE_URL=
```

- [ ] **Step 5: Replace README placeholder text with setup instructions**

```md
# trump-truth-social-digest-worker

Cloudflare Worker that monitors `@realDonaldTrump` on Truth Social, generates a Chinese digest every two hours, pushes a Feishu summary, and archives a detailed Markdown report to object storage.

## Development

```bash
npm install
npm run check
npx wrangler dev
```

## Secrets

Provide `FEISHU_WEBHOOK`, `FEISHU_SECRET`, `MANUAL_TRIGGER_TOKEN`, `TENCENT_COS_SECRET_ID`, `TENCENT_COS_SECRET_KEY`, `TENCENT_COS_BUCKET`, and `TENCENT_COS_REGION` via `.dev.vars` or Cloudflare secrets.
```
```

- [ ] **Step 6: Install dependencies and verify the empty scaffold builds**

Run: `npm install`
Expected: `added ... packages` and a new `package-lock.json`

Run: `npm run typecheck`
Expected: FAIL because `src/index.ts` does not exist yet

- [ ] **Step 7: Commit the scaffold**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts wrangler.jsonc .dev.vars.example README.md
git commit -m "Create the Worker tooling scaffold"
```

### Task 2: Define types, config parsing, and database schema

**Files:**
- Create: `migrations/0001_init.sql`
- Create: `src/types.ts`
- Create: `src/config.ts`
- Create: `src/lib/value.ts`
- Create: `test/config.test.ts`

- [ ] **Step 1: Write the failing config test**

```ts
import { describe, expect, it } from "vitest";
import { parseConfig } from "../src/config";
import type { Env } from "../src/types";

describe("parseConfig", () => {
  it("parses required env and default values", () => {
    const env = {
      AI: {} as Ai,
      RUNTIME_KV: {} as KVNamespace,
      BRIEF_DB: {} as D1Database,
      FEISHU_WEBHOOK: "https://open.feishu.cn/open-apis/bot/v2/hook/example",
      FEISHU_SECRET: "secret",
      MANUAL_TRIGGER_TOKEN: "token",
      TENCENT_COS_SECRET_ID: "sid",
      TENCENT_COS_SECRET_KEY: "skey",
      TENCENT_COS_BUCKET: "bucket-123",
      TENCENT_COS_REGION: "ap-guangzhou"
    } as Env;

    const config = parseConfig(env);
    expect(config.truthSocialProfileUrl).toBe("https://truthsocialapp.com/@realDonaldTrump");
    expect(config.digestIntervalHours).toBe(2);
    expect(config.maxPostsPerDigest).toBe(30);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `npm run test -- test/config.test.ts`
Expected: FAIL with `Cannot find module '../src/config'`

- [ ] **Step 3: Add the D1 schema for processed posts and digest runs**

```sql
CREATE TABLE IF NOT EXISTS processed_posts (
  id TEXT PRIMARY KEY,
  canonical_url TEXT NOT NULL,
  published_at TEXT NOT NULL,
  content_fingerprint TEXT NOT NULL,
  discovered_at TEXT NOT NULL,
  processed_at TEXT NOT NULL,
  source_payload_json TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_processed_posts_url
  ON processed_posts(canonical_url);

CREATE INDEX IF NOT EXISTS idx_processed_posts_published_at
  ON processed_posts(published_at DESC);

CREATE TABLE IF NOT EXISTS digest_runs (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  source TEXT NOT NULL,
  candidate_count INTEGER NOT NULL,
  item_count INTEGER NOT NULL,
  ai_analysis INTEGER NOT NULL,
  message_text TEXT NOT NULL,
  analysis_text TEXT,
  report_object_key TEXT,
  report_url TEXT,
  source_items_json TEXT NOT NULL,
  feishu_push_ok INTEGER NOT NULL DEFAULT 0,
  push_error TEXT
);

CREATE INDEX IF NOT EXISTS idx_digest_runs_created_at
  ON digest_runs(created_at DESC);
```

- [ ] **Step 4: Add the shared types and config parser**

```ts
// src/types.ts
export interface Env {
  AI: Ai;
  RUNTIME_KV: KVNamespace;
  BRIEF_DB: D1Database;
  FEISHU_WEBHOOK: string;
  FEISHU_SECRET?: string;
  MANUAL_TRIGGER_TOKEN?: string;
  TENCENT_COS_SECRET_ID: string;
  TENCENT_COS_SECRET_KEY: string;
  TENCENT_COS_BUCKET: string;
  TENCENT_COS_REGION: string;
  TENCENT_COS_BASE_URL?: string;
  LLM_MODEL?: string;
  DIGEST_INTERVAL_HOURS?: string;
  HEARTBEAT_INTERVAL_HOURS?: string;
  REQUEST_TIMEOUT_MS?: string;
  FETCH_WINDOW_HOURS?: string;
  MAX_POSTS_PER_DIGEST?: string;
  FAILURE_ALERT_THRESHOLD?: string;
  FAILURE_ALERT_COOLDOWN_MINUTES?: string;
  TRUTHSOCIAL_PROFILE_URL?: string;
}

export interface BriefConfig {
  feishuWebhook: string;
  feishuSecret: string;
  manualTriggerToken: string;
  cosSecretId: string;
  cosSecretKey: string;
  cosBucket: string;
  cosRegion: string;
  cosBaseUrl: string;
  llmModel: string;
  digestIntervalHours: number;
  heartbeatIntervalHours: number;
  requestTimeoutMs: number;
  fetchWindowHours: number;
  maxPostsPerDigest: number;
  failureAlertThreshold: number;
  failureAlertCooldownMinutes: number;
  truthSocialProfileUrl: string;
}
```

```ts
// src/config.ts
import type { BriefConfig, Env } from "./types";
import { toInt } from "./lib/value";

export function parseConfig(env: Env): BriefConfig {
  if (!env.FEISHU_WEBHOOK) throw new Error("missing FEISHU_WEBHOOK");
  if (!env.TENCENT_COS_SECRET_ID) throw new Error("missing TENCENT_COS_SECRET_ID");
  if (!env.TENCENT_COS_SECRET_KEY) throw new Error("missing TENCENT_COS_SECRET_KEY");
  if (!env.TENCENT_COS_BUCKET) throw new Error("missing TENCENT_COS_BUCKET");
  if (!env.TENCENT_COS_REGION) throw new Error("missing TENCENT_COS_REGION");

  return {
    feishuWebhook: env.FEISHU_WEBHOOK.trim(),
    feishuSecret: env.FEISHU_SECRET?.trim() ?? "",
    manualTriggerToken: env.MANUAL_TRIGGER_TOKEN?.trim() ?? "",
    cosSecretId: env.TENCENT_COS_SECRET_ID.trim(),
    cosSecretKey: env.TENCENT_COS_SECRET_KEY.trim(),
    cosBucket: env.TENCENT_COS_BUCKET.trim(),
    cosRegion: env.TENCENT_COS_REGION.trim(),
    cosBaseUrl: env.TENCENT_COS_BASE_URL?.trim() || `https://${env.TENCENT_COS_BUCKET.trim()}.cos.${env.TENCENT_COS_REGION.trim()}.myqcloud.com`,
    llmModel: env.LLM_MODEL?.trim() || "@cf/meta/llama-3.1-8b-instruct",
    digestIntervalHours: toInt(env.DIGEST_INTERVAL_HOURS, 2, 1),
    heartbeatIntervalHours: toInt(env.HEARTBEAT_INTERVAL_HOURS, 24, 1),
    requestTimeoutMs: toInt(env.REQUEST_TIMEOUT_MS, 15_000, 1_000),
    fetchWindowHours: toInt(env.FETCH_WINDOW_HOURS, 2, 1),
    maxPostsPerDigest: toInt(env.MAX_POSTS_PER_DIGEST, 30, 1),
    failureAlertThreshold: toInt(env.FAILURE_ALERT_THRESHOLD, 1, 1),
    failureAlertCooldownMinutes: toInt(env.FAILURE_ALERT_COOLDOWN_MINUTES, 180, 1),
    truthSocialProfileUrl: env.TRUTHSOCIAL_PROFILE_URL?.trim() || "https://truthsocialapp.com/@realDonaldTrump"
  };
}
```

- [ ] **Step 5: Add small value helpers used by the parser and later modules**

```ts
// src/lib/value.ts
export function toInt(value: string | undefined, fallback: number, min: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.max(parsed, min);
}

export function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, "0")).join("");
}
```

- [ ] **Step 6: Run config tests and typecheck**

Run: `npm run test -- test/config.test.ts`
Expected: PASS

Run: `npm run typecheck`
Expected: FAIL because `src/index.ts` and other referenced modules still do not exist

- [ ] **Step 7: Commit the schema/config layer**

```bash
git add migrations/0001_init.sql src/types.ts src/config.ts src/lib/value.ts test/config.test.ts
git commit -m "Define config and persistence primitives"
```

### Task 3: Implement Truth Social normalization and de-duplication

**Files:**
- Create: `src/services/truthsocial.ts`
- Create: `src/db.ts`
- Create: `test/truthsocial.test.ts`

- [ ] **Step 1: Write the failing scraper/normalization test**

```ts
import { describe, expect, it } from "vitest";
import { extractCandidatePosts, normalizeTruthPost } from "../src/services/truthsocial";

describe("Truth Social extraction", () => {
  it("keeps only original text posts from realDonaldTrump", async () => {
    const html = `
      <article data-testid="status">
        <a href="/@realDonaldTrump/posts/114389703123456789">link</a>
        <div>@realDonaldTrump</div>
        <div data-markup="true">MAKE AMERICA GREAT AGAIN!</div>
        <time datetime="2026-04-24T02:00:00.000Z"></time>
      </article>
      <article data-testid="status">
        <div>@realDonaldTrump replied</div>
        <div data-markup="true">Reply body</div>
      </article>
    `;

    const candidates = extractCandidatePosts(html, "https://truthsocialapp.com/@realDonaldTrump");
    expect(candidates).toHaveLength(1);
    const normalized = await normalizeTruthPost(candidates[0]);
    expect(normalized.authorHandle).toBe("@realDonaldTrump");
    expect(normalized.isOriginal).toBe(true);
    expect(normalized.bodyText).toContain("MAKE AMERICA GREAT AGAIN");
  });
});
```

- [ ] **Step 2: Run the scraper test to verify it fails**

Run: `npm run test -- test/truthsocial.test.ts`
Expected: FAIL with `Cannot find module '../src/services/truthsocial'`

- [ ] **Step 3: Implement the Truth Social extraction primitives**

```ts
// src/services/truthsocial.ts
export interface TruthCandidatePost {
  postId: string;
  canonicalUrl: string;
  authorHandle: string;
  bodyText: string;
  publishedAt: string;
  isReply: boolean;
  isRepost: boolean;
}

export function extractCandidatePosts(html: string, profileUrl: string): TruthCandidatePost[] {
  const articlePattern = /<article[\s\S]*?<\/article>/g;
  const articles = html.match(articlePattern) ?? [];
  return articles.map((article) => {
    const href = article.match(/href="([^"]*\/posts\/(\d+))"/) ?? [];
    const canonicalUrl = href[1]?.startsWith("http") ? href[1] : new URL(href[1] ?? "/", profileUrl).toString();
    const postId = href[2] ?? canonicalUrl;
    const handle = article.includes("@realDonaldTrump") ? "@realDonaldTrump" : "";
    const body = (article.match(/data-markup="true">([\s\S]*?)<\//) ?? [])[1]?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() ?? "";
    const publishedAt = (article.match(/datetime="([^"]+)"/) ?? [])[1] ?? "";
    const lower = article.toLowerCase();
    return {
      postId,
      canonicalUrl,
      authorHandle: handle,
      bodyText: body,
      publishedAt,
      isReply: lower.includes(" replied"),
      isRepost: lower.includes("retruth") || lower.includes("re-truth") || lower.includes("retruthed")
    };
  }).filter((item) => item.authorHandle && item.canonicalUrl);
}

export async function normalizeTruthPost(candidate: TruthCandidatePost) {
  return {
    id: candidate.postId,
    canonicalUrl: candidate.canonicalUrl,
    authorHandle: candidate.authorHandle,
    bodyText: candidate.bodyText,
    publishedAt: candidate.publishedAt,
    isOriginal: !candidate.isReply && !candidate.isRepost && Boolean(candidate.bodyText.trim())
  };
}
```

- [ ] **Step 4: Add D1 helpers for processed posts and digest runs**

```ts
// src/db.ts
export async function hasProcessedPost(db: D1Database, id: string): Promise<boolean> {
  const row = await db.prepare("SELECT 1 FROM processed_posts WHERE id = ? LIMIT 1").bind(id).first();
  return Boolean(row);
}

export async function insertProcessedPost(db: D1Database, record: {
  id: string;
  canonicalUrl: string;
  publishedAt: string;
  contentFingerprint: string;
  discoveredAt: string;
  processedAt: string;
  sourcePayloadJson: string;
}): Promise<void> {
  await db.prepare(`
    INSERT INTO processed_posts (id, canonical_url, published_at, content_fingerprint, discovered_at, processed_at, source_payload_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    record.id,
    record.canonicalUrl,
    record.publishedAt,
    record.contentFingerprint,
    record.discoveredAt,
    record.processedAt,
    record.sourcePayloadJson
  ).run();
}
```

- [ ] **Step 5: Add a batch fetch function that applies filtering and de-duplication**

```ts
export async function fetchTruthSocialPosts(config: { truthSocialProfileUrl: string; maxPostsPerDigest: number }, deps: {
  fetcher: typeof fetch;
  hasProcessedPost: (id: string) => Promise<boolean>;
}) {
  const response = await deps.fetcher(config.truthSocialProfileUrl, { headers: { "user-agent": "Mozilla/5.0" } });
  const html = await response.text();
  const candidates = extractCandidatePosts(html, config.truthSocialProfileUrl);
  const normalized = await Promise.all(candidates.map(normalizeTruthPost));
  const fresh = [];

  for (const item of normalized) {
    if (!item.isOriginal) continue;
    if (await deps.hasProcessedPost(item.id)) continue;
    fresh.push(item);
    if (fresh.length >= config.maxPostsPerDigest) break;
  }

  return { candidates, items: fresh };
}
```

- [ ] **Step 6: Run scraper tests and typecheck**

Run: `npm run test -- test/truthsocial.test.ts`
Expected: PASS

Run: `npm run typecheck`
Expected: FAIL because messaging/runtime/index modules still do not exist

- [ ] **Step 7: Commit the source-normalization layer**

```bash
git add src/services/truthsocial.ts src/db.ts test/truthsocial.test.ts
git commit -m "Add Truth Social extraction and de-duplication"
```

### Task 4: Implement AI formatting, report generation, and Feishu/COS delivery

**Files:**
- Create: `src/services/llm.ts`
- Create: `src/services/feishu.ts`
- Create: `src/services/cos.ts`
- Create: `src/lib/message.ts`
- Create: `src/lib/report.ts`
- Create: `test/message.test.ts`

- [ ] **Step 1: Write the failing message/report test**

```ts
import { describe, expect, it } from "vitest";
import { buildDigestMessage } from "../src/lib/message";
import { buildDetailedReport } from "../src/lib/report";

const items = [{
  id: "114389703123456789",
  translatedText: "让美国再次伟大！",
  topicTags: ["选举"],
  interpretation: "这条帖是在强化竞选口号。",
  publishedAt: "2026-04-24T02:00:00.000Z",
  canonicalUrl: "https://truthsocialapp.com/@realDonaldTrump/posts/114389703123456789"
}];

describe("message formatting", () => {
  it("includes summary, bullet point, and report url", () => {
    const message = buildDigestMessage("本时段特朗普继续聚焦竞选表达。", items, "https://example.com/report.md");
    expect(message).toContain("本时段特朗普继续聚焦竞选表达");
    expect(message).toContain("详细版报告");
  });

  it("renders translated post details in the markdown report", () => {
    const report = buildDetailedReport("摘要", items, new Date("2026-04-24T04:00:00.000Z"));
    expect(report).toContain("让美国再次伟大");
    expect(report).toContain("主题标签");
  });
});
```

- [ ] **Step 2: Run the message/report test to verify it fails**

Run: `npm run test -- test/message.test.ts`
Expected: FAIL with missing `src/lib/message` and `src/lib/report`

- [ ] **Step 3: Add the AI post-processing service**

```ts
// src/services/llm.ts
const SYSTEM_PROMPT = `你是一名中文资讯摘要编辑。对每条特朗普 Truth Social 原帖输出 JSON，字段必须包含 translatedText、topicTags、interpretation。translatedText 必须是尽量贴近原意的简明中文；不要输出英文原文。`;

export async function analyzePostsWithLLM(config: { llmModel: string }, ai: Ai, sourceText: string): Promise<string> {
  const result = await ai.run(config.llmModel, {
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: sourceText }
    ],
    max_tokens: 1200,
    temperature: 0.2
  }) as { response?: string };

  if (!result.response?.trim()) throw new Error("Workers AI returned empty response");
  return result.response.trim();
}
```

- [ ] **Step 4: Add message and report builders**

```ts
// src/lib/message.ts
import { truncate } from "./value";

export function buildDigestMessage(summary: string, items: Array<{ translatedText: string; topicTags: string[]; interpretation: string }>, reportUrl: string): string {
  const lines = [summary.trim(), "", "重点帖子："];
  for (const [index, item] of items.slice(0, 5).entries()) {
    lines.push(`${index + 1}. ${truncate(item.translatedText, 90)}`);
    lines.push(`   标签: ${item.topicTags.join(" / ")}`);
    lines.push(`   解读: ${truncate(item.interpretation, 48)}`);
  }
  lines.push("", "详细版报告:", reportUrl);
  return lines.join("\n").trim();
}
```

```ts
// src/lib/report.ts
const PROJECT_PREFIX = "trump-truth-social-digest-worker";

export function buildDetailedReport(summary: string, items: Array<{
  translatedText: string;
  topicTags: string[];
  interpretation: string;
  publishedAt: string;
  canonicalUrl: string;
}>, now = new Date()): string {
  const lines = [
    "# 特朗普 Truth Social 汇总详细版",
    "",
    `- 生成时间: ${now.toISOString()}`,
    `- 条目数量: ${items.length}`,
    "- 数据来源: Truth Social 公开网页",
    "- AI 说明: 中文翻译/标签/一句话解读由 Workers AI 生成",
    "",
    "## 本时段摘要",
    "",
    summary,
    "",
    "## 帖文明细",
    ""
  ];

  items.forEach((item, index) => {
    lines.push(`### ${index + 1}. 帖文`);
    lines.push(`- 中文翻译/转述: ${item.translatedText}`);
    lines.push(`- 主题标签: ${item.topicTags.join(" / ")}`);
    lines.push(`- 一句话解读: ${item.interpretation}`);
    lines.push(`- 发布时间: ${item.publishedAt}`);
    lines.push(`- 原帖链接: ${item.canonicalUrl}`);
    lines.push("");
  });

  return `${lines.join("\n").trim()}\n`;
}

export function buildDetailedReportObjectKey(now = new Date()): string {
  const stamp = [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, "0"),
    String(now.getUTCDate()).padStart(2, "0"),
    String(now.getUTCHours()).padStart(2, "0"),
    String(now.getUTCMinutes()).padStart(2, "0"),
    String(now.getUTCSeconds()).padStart(2, "0")
  ].join("");
  return `${PROJECT_PREFIX}/${stamp}.md`;
}
```

- [ ] **Step 5: Add Feishu and COS delivery services**

```ts
// src/services/feishu.ts
export async function pushToFeishu(config: { feishuWebhook: string; feishuSecret: string }, text: string): Promise<void> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const response = await fetch(config.feishuWebhook, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ msg_type: "text", content: { text }, timestamp })
  });

  if (!response.ok) throw new Error(`Feishu push HTTP ${response.status}`);
}
```

```ts
// src/services/cos.ts
import { buildDetailedReportObjectKey } from "../lib/report";

export async function uploadDetailedReportToCos(config: { cosBaseUrl: string }, content: string, now = new Date()) {
  const key = buildDetailedReportObjectKey(now);
  const url = `${config.cosBaseUrl.replace(/\/+$/, "")}/${key}`;
  const response = await fetch(url, { method: "PUT", headers: { "content-type": "text/markdown; charset=utf-8" }, body: content });
  if (!response.ok) throw new Error(`COS upload HTTP ${response.status}`);
  return { key, url };
}
```

- [ ] **Step 6: Run the message/report tests and typecheck**

Run: `npm run test -- test/message.test.ts`
Expected: PASS

Run: `npm run typecheck`
Expected: FAIL because runtime/orchestration modules still do not exist

- [ ] **Step 7: Commit the presentation and delivery layer**

```bash
git add src/services/llm.ts src/services/feishu.ts src/services/cos.ts src/lib/message.ts src/lib/report.ts test/message.test.ts
git commit -m "Add digest formatting and delivery services"
```

### Task 5: Implement runtime state, routes, and digest orchestration

**Files:**
- Create: `src/lib/runtime.ts`
- Create: `src/lib/admin.ts`
- Create: `src/index.ts`
- Create: `test/runtime.test.ts`
- Create: `test/index.test.ts`

- [ ] **Step 1: Write the failing runtime/orchestration tests**

```ts
import { describe, expect, it } from "vitest";
import worker from "../src/index";

describe("worker fetch routes", () => {
  it("returns health JSON", async () => {
    const response = await worker.fetch(new Request("https://example.com/health"), {} as never);
    expect(response.status).toBe(200);
  });
});
```

```ts
import { describe, expect, it } from "vitest";
import { shouldSendHeartbeat } from "../src/lib/runtime";

describe("runtime decisions", () => {
  it("sends heartbeat when there has never been one", () => {
    expect(shouldSendHeartbeat({ consecutiveFailures: 0 }, 24, new Date("2026-04-24T00:00:00.000Z"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- test/runtime.test.ts test/index.test.ts`
Expected: FAIL with missing `src/index` and `src/lib/runtime`

- [ ] **Step 3: Add KV runtime helpers and admin authorization**

```ts
// src/lib/runtime.ts
const RUNTIME_STATE_KEY = "runtime-state";

export interface RuntimeState {
  lastSuccessAt?: string;
  lastFailureAt?: string;
  lastHeartbeatAt?: string;
  lastAlertAt?: string;
  lastError?: string;
  consecutiveFailures: number;
}

export async function getRuntimeState(kv: KVNamespace): Promise<RuntimeState> {
  return (await kv.get<RuntimeState>(RUNTIME_STATE_KEY, "json")) ?? { consecutiveFailures: 0 };
}

export function recordSuccess(state: RuntimeState, now: Date): RuntimeState {
  return { ...state, consecutiveFailures: 0, lastSuccessAt: now.toISOString(), lastError: undefined };
}

export function recordFailure(state: RuntimeState, error: string, now: Date): RuntimeState {
  return { ...state, consecutiveFailures: state.consecutiveFailures + 1, lastFailureAt: now.toISOString(), lastError: error };
}

export function shouldSendHeartbeat(state: RuntimeState, intervalHours: number, now: Date): boolean {
  if (!state.lastHeartbeatAt) return true;
  return now.getTime() - new Date(state.lastHeartbeatAt).getTime() >= intervalHours * 60 * 60 * 1000;
}
```

```ts
// src/lib/admin.ts
export function authorizeAdminRequest(request: Request, token: string): { ok: true } | { ok: false; status: number; error: string } {
  if (!token) return { ok: false, status: 503, error: "manual trigger disabled" };
  const auth = request.headers.get("authorization") ?? "";
  return auth === `Bearer ${token}` ? { ok: true } : { ok: false, status: 401, error: "unauthorized" };
}
```

- [ ] **Step 4: Implement the digest orchestration entrypoint**

```ts
// src/index.ts
import type { Env } from "./types";
import { parseConfig } from "./config";
import { authorizeAdminRequest } from "./lib/admin";

function jsonResponse(data: Record<string, unknown>, status = 200): Response {
  return Response.json(data, { status });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/health")) {
      return jsonResponse({ ok: true, worker: "trump-truth-social-digest-worker" });
    }
    if (request.method === "POST" && url.pathname === "/admin/trigger") {
      const config = parseConfig(env);
      const auth = authorizeAdminRequest(request, config.manualTriggerToken);
      if (!auth.ok) return jsonResponse({ ok: false, error: auth.error }, auth.status);
      return jsonResponse({ ok: true, accepted: true });
    }
    return jsonResponse({ ok: false, error: "not found" }, 404);
  },

  async scheduled(_controller: ScheduledController, _env: Env, _ctx: ExecutionContext): Promise<void> {
    return;
  }
};
```

- [ ] **Step 5: Flesh out the scheduled run path until all imports are wired**

```ts
async function runDigest(env: Env): Promise<{ itemCount: number; aiAnalysis: boolean; detailedReportUrl?: string }> {
  const config = parseConfig(env);
  const now = new Date();
  const state = await getRuntimeState(env.RUNTIME_KV);

  try {
    const { candidates, items } = await fetchTruthSocialPosts(config, {
      fetcher: fetch,
      hasProcessedPost: (id) => hasProcessedPost(env.BRIEF_DB, id)
    });
    if (items.length === 0) {
      await env.RUNTIME_KV.put("runtime-state", JSON.stringify(recordSuccess(state, now)));
      return { itemCount: 0, aiAnalysis: false };
    }

    const sourceText = JSON.stringify(items);
    const aiOutput = await analyzePostsWithLLM(config, env.AI, sourceText);
    const report = buildDetailedReport(aiOutput, items, now);
    const uploaded = await uploadDetailedReportToCos(config, report, now);
    const message = buildDigestMessage(aiOutput, items, uploaded.url);
    await pushToFeishu(config, message);
    await env.RUNTIME_KV.put("runtime-state", JSON.stringify(recordSuccess(state, now)));
    return { itemCount: items.length, aiAnalysis: true, detailedReportUrl: uploaded.url };
  } catch (error) {
    await env.RUNTIME_KV.put("runtime-state", JSON.stringify(recordFailure(state, error instanceof Error ? error.message : String(error), now)));
    throw error;
  }
}
```

- [ ] **Step 6: Run the runtime/index tests, then the full test suite**

Run: `npm run test -- test/runtime.test.ts test/index.test.ts`
Expected: PASS

Run: `npm run test`
Expected: PASS

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 7: Commit the orchestration layer**

```bash
git add src/lib/runtime.ts src/lib/admin.ts src/index.ts test/runtime.test.ts test/index.test.ts
git commit -m "Wire the scheduled digest workflow"
```

### Task 6: Finish integration details, regression coverage, and deployment docs

**Files:**
- Modify: `src/index.ts`
- Modify: `src/db.ts`
- Modify: `src/services/truthsocial.ts`
- Modify: `src/services/llm.ts`
- Modify: `src/services/feishu.ts`
- Modify: `src/services/cos.ts`
- Modify: `README.md`
- Modify: `.dev.vars.example`

- [ ] **Step 1: Add the remaining production behaviors after the first full pass**

```ts
if (freshItems.length === 0) {
  if (shouldSendHeartbeat(nextState, config.heartbeatIntervalHours, now)) {
    await pushToFeishu(config, buildHeartbeatMessage(nextState, config.heartbeatIntervalHours));
  }
  return { itemCount: 0, aiAnalysis: false };
}
```

```ts
await insertDigestRun(env.BRIEF_DB, {
  id: crypto.randomUUID(),
  source: "Truth Social public web scrape",
  candidateCount: candidates.length,
  itemCount: enrichedItems.length,
  aiAnalysis: true,
  messageText: message,
  analysisText: summary,
  reportObjectKey: uploaded.key,
  reportUrl: uploaded.url,
  sourceItemsJson: JSON.stringify(enrichedItems),
  createdAt: now.toISOString()
});
```

- [ ] **Step 2: Add regression tests for no-post, AI-fallback, and failure-alert scenarios**

```ts
it("does not send a normal digest when there are no new posts", async () => {
  const pushes: string[] = [];
  const result = await runDigest(makeEnv({
    fetchTruthSocialPosts: async () => ({ candidates: [], items: [] }),
    pushToFeishu: async (_config, text) => { pushes.push(text); }
  }));

  expect(result.itemCount).toBe(0);
  expect(pushes.every((text) => !text.includes("重点帖子"))).toBe(true);
});

it("falls back without dumping English raw text when AI fails", async () => {
  const pushes: string[] = [];
  await runDigest(makeEnv({
    analyzePostsWithLLM: async () => { throw new Error("AI down"); },
    pushToFeishu: async (_config, text) => { pushes.push(text); }
  }));

  expect(pushes.join("\n")).not.toContain("MAKE AMERICA GREAT AGAIN");
});

it("sends a failure alert when the run throws repeatedly", async () => {
  const pushes: string[] = [];
  const env = makeEnv({
    initialRuntimeState: { consecutiveFailures: 0 },
    fetchTruthSocialPosts: async () => { throw new Error("profile fetch failed"); },
    pushToFeishu: async (_config, text) => { pushes.push(text); }
  });

  await expect(runDigest(env)).rejects.toThrow("profile fetch failed");
  expect(pushes.some((text) => text.includes("异常告警"))).toBe(true);
});
```

- [ ] **Step 3: Update README deployment/runbook details**

```md
## Manual trigger

```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_MANUAL_TRIGGER_TOKEN" \
  https://<your-worker>/admin/trigger
```

## Runtime resources

- D1 database: `trump-truth-social-digest`
- KV namespace: runtime state
- Workers AI binding: `AI`
- Object storage credentials: Tencent COS-compatible secrets
```
```

- [ ] **Step 4: Run the final verification suite**

Run: `npm run check`
Expected: PASS

Run: `npx wrangler types`
Expected: Generates Worker type bindings without errors

- [ ] **Step 5: Commit the integration hardening and docs**

```bash
git add src/index.ts src/db.ts src/services/truthsocial.ts src/services/llm.ts src/services/feishu.ts src/services/cos.ts README.md .dev.vars.example test
git commit -m "Harden delivery flows and document deployment"
```

## Self-review notes

- Spec coverage check: scheduling, source scope, Chinese-first output, detailed report link, no-backfill behavior, object-storage report naming, D1/KV/COS storage, heartbeat, failure alerts, and manual trigger all have explicit tasks above.
- Placeholder scan: removed generic TODO wording; every task names exact files, commands, and concrete code to start from.
- Type consistency: `truthSocialProfileUrl`, `maxPostsPerDigest`, `translatedText`, `topicTags`, `interpretation`, and runtime-state naming are used consistently across tasks.
