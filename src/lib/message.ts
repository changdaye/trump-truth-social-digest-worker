import { truncate } from "./value";

export interface DigestMessageItem {
  translatedText: string;
  topicTags: string[];
  interpretation: string;
}

const MAX_MESSAGE_LENGTH = 2600;

export function buildDigestMessage(summary: string, items: DigestMessageItem[], reportUrl: string): string {
  const lines = [summary.trim(), "", "重点帖子："];

  for (const [index, item] of items.slice(0, 5).entries()) {
    lines.push(`${index + 1}. ${truncate(item.translatedText, 90)}`);
    lines.push(`   标签: ${item.topicTags.join(" / ")}`);
    lines.push(`   解读: ${truncate(item.interpretation, 48)}`);
  }

  lines.push("", "详细版报告:", reportUrl);
  return limitMessage(lines.join("\n").trim());
}

export function buildFallbackMessage(items: DigestMessageItem[], reportUrl: string): string {
  const lines = ["说明: AI 中文整理暂不可用，以下为基础中文摘要", "", "重点帖子："];

  for (const [index, item] of items.slice(0, 5).entries()) {
    lines.push(`${index + 1}. ${truncate(item.translatedText, 90)}`);
    lines.push(`   标签: ${item.topicTags.join(" / ") || "待补充"}`);
  }

  lines.push("", "详细版报告:", reportUrl);
  return limitMessage(lines.join("\n").trim());
}

function limitMessage(text: string): string {
  if (text.length <= MAX_MESSAGE_LENGTH) return text;
  return `${text.slice(0, MAX_MESSAGE_LENGTH - 8).trimEnd()}\n（已截断）`;
}
