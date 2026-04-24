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

  it("does not send a normal digest when there are no new posts", async () => {
    const pushes: string[] = [];
    const worker = createWorker({
      now: () => new Date("2026-04-24T00:00:00.000Z"),
      fetchTruthSocialPosts: async () => ({ candidates: [], items: [] }),
      pushToFeishu: async (_config, text) => {
        pushes.push(text);
      },
      getRuntimeState: async () => ({ consecutiveFailures: 0 }),
      setRuntimeState: async () => {},
      listRecentDigestRuns: async () => []
    });

    const response = await worker.fetch(
      new Request("https://example.com/admin/trigger", {
        method: "POST",
        headers: { authorization: "Bearer token" }
      }),
      env
    );

    expect(response.status).toBe(200);
    expect(pushes.every((text) => !text.includes("重点帖子"))).toBe(true);
  });

  it("falls back without dumping English raw text when AI fails", async () => {
    const pushes: string[] = [];
    const worker = createWorker({
      now: () => new Date("2026-04-24T00:00:00.000Z"),
      fetchTruthSocialPosts: async () => ({
        candidates: [],
        items: [{
          id: "111",
          canonicalUrl: "https://truthsocialapp.com/@realDonaldTrump/posts/111",
          authorHandle: "@realDonaldTrump",
          bodyText: "MAKE AMERICA GREAT AGAIN",
          publishedAt: "2026-04-24T00:00:00.000Z",
          isOriginal: true
        }]
      }),
      analyzePostsWithLLM: async () => {
        throw new Error("AI down");
      },
      uploadDetailedReportToCos: async () => ({
        key: "trump-truth-social-digest-worker/20260424000000.md",
        url: "https://example.com/report.md"
      }),
      pushToFeishu: async (_config, text) => {
        pushes.push(text);
      },
      insertDigestRun: async () => {},
      markDigestRunPushed: async () => {},
      insertProcessedPost: async () => {},
      getRuntimeState: async () => ({ consecutiveFailures: 0 }),
      setRuntimeState: async () => {},
      listRecentDigestRuns: async () => []
    });

    const response = await worker.fetch(
      new Request("https://example.com/admin/trigger", {
        method: "POST",
        headers: { authorization: "Bearer token" }
      }),
      env
    );

    expect(response.status).toBe(200);
    expect(pushes.join("\n")).not.toContain("MAKE AMERICA GREAT AGAIN");
    expect(pushes.join("\n")).toContain("详细版报告");
  });

  it("sends a failure alert when the run throws repeatedly", async () => {
    const pushes: string[] = [];
    const worker = createWorker({
      now: () => new Date("2026-04-24T00:00:00.000Z"),
      fetchTruthSocialPosts: async () => {
        throw new Error("profile fetch failed");
      },
      pushToFeishu: async (_config, text) => {
        pushes.push(text);
      },
      getRuntimeState: async () => ({ consecutiveFailures: 0 }),
      setRuntimeState: async () => {},
      listRecentDigestRuns: async () => []
    });

    const response = await worker.fetch(
      new Request("https://example.com/admin/trigger", {
        method: "POST",
        headers: { authorization: "Bearer token" }
      }),
      env
    );

    expect(response.status).toBe(500);
    expect(pushes.some((text) => text.includes("异常告警"))).toBe(true);
  });
});
