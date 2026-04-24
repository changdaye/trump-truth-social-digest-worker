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
  const lines = ["特朗普 Truth Social 简报", "", summary.trim()];

  if (hotTerms.length > 0) {
    lines.push("", `高频词：${hotTerms.slice(0, 6).join(" / ")}`);
  }

  const compressed = items
    .slice(0, 5)
    .map((item) => item.translatedText.trim())
    .filter(Boolean)
    .map((text, index) => `${index + 1}）${truncate(text, 120)}`)
    .join("；");

  if (compressed) {
    lines.push("", `重点整理：${compressed}`);
  }

  lines.push("", "详细版报告:", reportUrl);
  return limitMessage(lines.join("\n").trim());
}

export function buildFallbackMessage(items: DigestMessageItem[], reportUrl: string): string {
  const compressed = items
    .slice(0, 5)
    .map((item) => item.translatedText.trim())
    .filter(Boolean)
    .map((text, index) => `${index + 1}）${truncate(text, 80)}`)
    .join("；");

  const lines = [
    "特朗普 Truth Social 简报",
    "",
    "说明：AI 中文整理暂不可用，以下为基础摘要。"
  ];

  if (compressed) {
    lines.push("", `重点整理：${compressed}`);
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
