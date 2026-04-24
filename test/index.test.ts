import { describe, expect, it } from "vitest";
import { createWorker } from "../src/index";
import type { Env } from "../src/types";

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

describe("worker fetch routes", () => {
  it("returns health JSON", async () => {
    const worker = createWorker({
      getRuntimeState: async () => ({ consecutiveFailures: 0 }),
      listRecentDigestRuns: async () => []
    });

    const response = await worker.fetch(new Request("https://example.com/health"), env);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, worker: "trump-truth-social-digest-worker" });
  });

  it("rejects unauthorized manual triggers", async () => {
    const worker = createWorker();
    const response = await worker.fetch(new Request("https://example.com/admin/trigger", { method: "POST" }), env);
    expect(response.status).toBe(401);
  });
});
