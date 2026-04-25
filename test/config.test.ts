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

    expect(config.trumpTruthFeedUrl).toBe("https://trumpstruth.org/feed");
    expect(config.digestIntervalHours).toBe(2);
    expect(config.maxPostsPerDigest).toBe(30);
    expect(config.cosBaseUrl).toBe("https://bucket-123.cos.ap-guangzhou.myqcloud.com");
    expect(config.llmBaseUrl).toBe("");
    expect(config.llmApiKey).toBe("");
  });

  it("throws when required secrets are missing", () => {
    expect(() => parseConfig({} as Env)).toThrow("missing FEISHU_WEBHOOK");
  });
});
