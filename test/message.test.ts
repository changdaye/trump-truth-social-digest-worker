import { describe, expect, it } from "vitest";
import { buildDigestMessage, buildFallbackMessage } from "../src/lib/message";
import { buildDetailedReport, buildDetailedReportObjectKey } from "../src/lib/report";

const items = [{
  id: "114389703123456789",
  originalText: "MAKE AMERICA GREAT AGAIN!",
  translatedText: "让美国再次伟大！",
  topicTags: ["选举"],
  interpretation: "这条帖是在强化竞选口号。",
  publishedAt: "2026-04-24T02:00:00.000Z",
  canonicalUrl: "https://truthsocial.com/@realDonaldTrump/posts/114389703123456789"
}];

describe("message formatting", () => {
  it("includes the model label when provided", () => {
    const message = buildDigestMessage("本时段特朗普继续聚焦竞选表达。", ["选举", "竞选口号"], items, "https://example.com/report.md", "GPT 5.4 (xhigh)");
    expect(message).toContain("🤖 模型：GPT 5.4 (xhigh)");
  });

  it("builds a compressed summary-style Feishu message", () => {
    const message = buildDigestMessage("本时段特朗普继续聚焦竞选表达。", ["选举", "竞选口号"], items, "https://example.com/report.md");
    expect(message).toContain("特朗普 Truth Social 简报");
    expect(message).toContain("高频词：选举 / 竞选口号");
    expect(message).toContain("重点整理：1）让美国再次伟大");
    expect(message).toContain("详细版报告");
    expect(message).not.toContain("他说：");
  });

  it("renders english original text and chinese translation in the markdown report", () => {
    const report = buildDetailedReport("摘要", items, new Date("2026-04-24T04:00:00.000Z"));
    expect(report).toContain("英文原文");
    expect(report).toContain("MAKE AMERICA GREAT AGAIN");
    expect(report).toContain("中文直译/转述");
    expect(report).toContain("让美国再次伟大");
    expect(report).toContain("原帖链接");
  });

  it("builds the expected object storage key", () => {
    expect(buildDetailedReportObjectKey(new Date("2026-04-24T04:00:00.000Z"))).toBe(
      "trump-truth-social-digest-worker/20260424040000.md"
    );
  });

  it("includes the model label in fallback messages when provided", () => {
    const message = buildFallbackMessage(items, "https://example.com/report.md", "Llama 3.1 8B Instruct");
    expect(message).toContain("🤖 模型：Llama 3.1 8B Instruct");
  });
});
