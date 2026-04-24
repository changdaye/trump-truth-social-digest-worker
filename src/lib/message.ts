import { truncate } from "./value";
import type { RuntimeState } from "./runtime";

export interface DigestMessageItem {
  translatedText: string;
  topicTags: string[];
  interpretation: string;
  publishedAt?: string;
}

const MAX_MESSAGE_LENGTH = 2600;

export function buildDigestMessage(summary: string, hotTerms: string[], items: DigestMessageItem[], reportUrl: string): string {
  const lines = ["一、本轮他说了什么", summary.trim()];

  if (hotTerms.length > 0) {
    lines.push("", "二、高频词", hotTerms.slice(0, 6).join(" / "));
  }

  lines.push("", hotTerms.length > 0 ? "三、重点原话（中文转述）" : "二、重点原话（中文转述）");

  for (const [index, item] of items.slice(0, 4).entries()) {
    lines.push(`${index + 1}. 他说：${truncate(item.translatedText, 150)}`);
    if (item.topicTags.length > 0) lines.push(`   关键词：${item.topicTags.join(" / ")}`);
    lines.push(`   看点：${truncate(item.interpretation, 70)}`);
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

export function buildHeartbeatMessage(state: RuntimeState, intervalHours: number): string {
  return [
    "💓 Trump Truth Social Digest Worker 心跳",
    `心跳间隔: ${intervalHours}h`,
    `上次成功: ${state.lastSuccessAt ?? "无"}`,
    `连续失败: ${state.consecutiveFailures}`,
    `最近错误: ${state.lastError ?? "无"}`
  ].join("\n");
}

export function buildFailureAlertMessage(state: RuntimeState, threshold: number): string {
  return [
    "🚨 Trump Truth Social Digest Worker 异常告警",
    `连续失败: ${state.consecutiveFailures}`,
    `告警阈值: ${threshold}`,
    `上次成功: ${state.lastSuccessAt ?? "无"}`,
    `最近错误: ${state.lastError ?? "unknown"}`
  ].join("\n");
}

function limitMessage(text: string): string {
  if (text.length <= MAX_MESSAGE_LENGTH) return text;
  return `${text.slice(0, MAX_MESSAGE_LENGTH - 8).trimEnd()}\n（已截断）`;
}
