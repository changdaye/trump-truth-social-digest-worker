export interface DetailedReportItem {
  id: string;
  translatedText: string;
  topicTags: string[];
  interpretation: string;
  publishedAt: string;
  canonicalUrl: string;
}

const PROJECT_PREFIX = "trump-truth-social-digest-worker";

export function buildDetailedReport(summary: string, items: DetailedReportItem[], now = new Date()): string {
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
    lines.push(`### ${index + 1}. 帖文 ${item.id}`);
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
