import { describe, expect, it } from "vitest";
import { buildDigestMessage } from "../src/lib/message";
import { buildDetailedReport, buildDetailedReportObjectKey } from "../src/lib/report";

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
    expect(message).toContain("选举");
  });

  it("renders translated post details in the markdown report", () => {
    const report = buildDetailedReport("摘要", items, new Date("2026-04-24T04:00:00.000Z"));
    expect(report).toContain("让美国再次伟大");
    expect(report).toContain("主题标签");
    expect(report).toContain("原帖链接");
  });

  it("builds the expected object storage key", () => {
    expect(buildDetailedReportObjectKey(new Date("2026-04-24T04:00:00.000Z"))).toBe(
      "trump-truth-social-digest-worker/20260424040000.md"
    );
  });
});
