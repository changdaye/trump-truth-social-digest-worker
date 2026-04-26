import { describe, expect, it, vi } from "vitest";
import { analyzePostsWithLLM } from "../src/services/llm";
import type { BriefConfig } from "../src/types";

function makeConfig(): BriefConfig {
  return {
    feishuWebhook: "https://example.com/hook",
    feishuSecret: "",
    manualTriggerToken: "token",
    cosSecretId: "secret-id",
    cosSecretKey: "secret-key",
    cosBucket: "bucket",
    cosRegion: "na-ashburn",
    cosBaseUrl: "https://bucket.cos.na-ashburn.myqcloud.com",
  workerPublicBaseUrl: "https://example.workers.dev",
    llmBaseUrl: "",
    llmApiKey: "",
    llmModel: "@cf/meta/llama-3.1-8b-instruct",
    digestIntervalHours: 2,
    heartbeatIntervalHours: 24,
    requestTimeoutMs: 15000,
    fetchWindowHours: 2,
    maxPostsPerDigest: 30,
    failureAlertThreshold: 1,
    failureAlertCooldownMinutes: 180,
    trumpTruthFeedUrl: "https://trumpstruth.org/feed",
  };
}

describe("analyzePostsWithLLM", () => {
  it("uses Workers AI when the selected model is a Cloudflare model even if proxy settings exist", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const run = vi.fn().mockResolvedValue({
      response: { summary: "摘要", hotTerms: ["选举"], items: [{ translatedText: "中文", topicTags: ["选举"], interpretation: "解读" }] }
    });

    const result = await analyzePostsWithLLM(
      {
        ...makeConfig(),
        llmBaseUrl: "http://34.146.152.231.sslip.io:8317/api/provider/openai/v1",
        llmApiKey: "proxy-key",
        llmModel: "@cf/meta/llama-3.1-8b-instruct",
      },
      { run } as unknown as Ai,
      "[{\"bodyText\":\"MAKE AMERICA GREAT AGAIN\"}]",
    );

    expect(result).toEqual({
      content: { summary: "摘要", hotTerms: ["选举"], items: [{ translatedText: "中文", topicTags: ["选举"], interpretation: "解读" }] },
      modelLabel: "Llama 3.1 8B Instruct",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(run.mock.calls[0]?.[0]).toBe("@cf/meta/llama-3.1-8b-instruct");
  });

  it("prefers the OpenAI-compatible proxy when configured", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"summary":"摘要","hotTerms":["选举"],"items":[{"translatedText":"中文","topicTags":["选举"],"interpretation":"解读"}]}' } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await analyzePostsWithLLM(
      {
        ...makeConfig(),
        llmBaseUrl: "http://34.146.152.231.sslip.io:8317/api/provider/openai/v1",
        llmApiKey: "proxy-key",
        llmModel: "gpt-5.4",
      },
      { run: vi.fn() } as unknown as Ai,
      "[{\"bodyText\":\"MAKE AMERICA GREAT AGAIN\"}]",
    );

    expect(result).toEqual({
      content: '{"summary":"摘要","hotTerms":["选举"],"items":[{"translatedText":"中文","topicTags":["选举"],"interpretation":"解读"}]}',
      modelLabel: "GPT 5.4 (xhigh)",
    });
    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string);
    expect(body).toMatchObject({
      model: "gpt-5.4",
      reasoning_effort: "xhigh",
      max_completion_tokens: 1200,
    });
    expect(body.response_format).toBeUndefined();
  });

  it("falls back to Workers AI when the proxy fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("bad gateway", { status: 502 }));
    vi.stubGlobal("fetch", fetchMock);

    const run = vi.fn().mockResolvedValue({
      response: { summary: "摘要", hotTerms: ["选举"], items: [{ translatedText: "中文", topicTags: ["选举"], interpretation: "解读" }] }
    });

    const result = await analyzePostsWithLLM(
      {
        ...makeConfig(),
        llmBaseUrl: "http://34.146.152.231.sslip.io:8317/api/provider/openai/v1",
        llmApiKey: "proxy-key",
        llmModel: "gpt-5.4",
      },
      { run } as unknown as Ai,
      "[{\"bodyText\":\"MAKE AMERICA GREAT AGAIN\"}]",
    );

    expect(result).toEqual({
      content: { summary: "摘要", hotTerms: ["选举"], items: [{ translatedText: "中文", topicTags: ["选举"], interpretation: "解读" }] },
      modelLabel: "Llama 3.1 8B Instruct",
    });
    expect(run.mock.calls[0]?.[0]).toBe("@cf/meta/llama-3.1-8b-instruct");
  });
});
