import { parseConfig } from "./config";
import { hasProcessedPost, insertDigestRun, insertProcessedPost, listRecentDigestRuns, markDigestRunPushed } from "./db";
import { authorizeAdminRequest } from "./lib/admin";
import { buildDigestMessage, buildFailureAlertMessage, buildFallbackMessage, buildHeartbeatMessage } from "./lib/message";
import { buildDetailedReport } from "./lib/report";
import { buildDetailedReportPublicUrl, maybeHandleDetailedReportRequest, saveDetailedReportCopy } from "./lib/report-storage";
import { getRuntimeState, recordFailure, recordSuccess, setRuntimeState, shouldSendFailureAlert, shouldSendHeartbeat, type RuntimeState } from "./lib/runtime";
import { sha256Hex } from "./lib/value";
import { uploadDetailedReportToCos, uploadFeishuMessageToCos } from "./services/cos";
import { pushToFeishu } from "./services/feishu";
import { analyzePostsWithLLM, parseLlmDigestResponse, type LlmDigestItem } from "./services/llm";
import { fetchTruthSocialPosts, type TruthNormalizedPost } from "./services/truthsocial";
import type { DigestRunRecord, Env, ProcessedPostRecord } from "./types";

interface RuntimeDeps {
  now: () => Date;
  fetchTruthSocialPosts: typeof fetchTruthSocialPosts;
  analyzePostsWithLLM: typeof analyzePostsWithLLM;
  parseLlmDigestResponse: typeof parseLlmDigestResponse;
  uploadDetailedReportToCos: typeof uploadDetailedReportToCos;
  pushToFeishu: typeof pushToFeishu;
  hasProcessedPost: typeof hasProcessedPost;
  insertProcessedPost: typeof insertProcessedPost;
  insertDigestRun: typeof insertDigestRun;
  markDigestRunPushed: typeof markDigestRunPushed;
  listRecentDigestRuns: typeof listRecentDigestRuns;
  getRuntimeState: typeof getRuntimeState;
  setRuntimeState: typeof setRuntimeState;
}

const defaultDeps: RuntimeDeps = {
  now: () => new Date(),
  fetchTruthSocialPosts,
  analyzePostsWithLLM,
  parseLlmDigestResponse,
  uploadDetailedReportToCos,
  pushToFeishu,
  hasProcessedPost,
  insertProcessedPost,
  insertDigestRun,
  markDigestRunPushed,
  listRecentDigestRuns,
  getRuntimeState,
  setRuntimeState
};

export function createWorker(overrides: Partial<RuntimeDeps> = {}) {
  const deps = { ...defaultDeps, ...overrides };

  return {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
      const url = new URL(request.url);

      if (request.method === "GET") {
        const reportResponse = await maybeHandleDetailedReportRequest(request, env.RUNTIME_KV);
        if (reportResponse) return reportResponse;
      }

      if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/health")) {
        return jsonResponse(await buildHealthResponse(env, deps));
      }
        if (request.method === "POST" && url.pathname === "/admin/trigger") {
        const config = parseConfig(env);
        const auth = authorizeAdminRequest(request, config.manualTriggerToken);
        if (!auth.ok) {
          return jsonResponse({ ok: false, error: auth.error }, auth.status);
        }
        if (url.searchParams.get("async") === "1") {
          return queueManualTrigger(ctx, async () => {
            await runDigest(env, deps, { forceLatest: url.searchParams.get("force") === "1" });
          });
        }

        try {
          return jsonResponse({ ok: true, ...(await runDigest(env, deps, { forceLatest: url.searchParams.get("force") === "1" })) });
        } catch (error) {
          return jsonResponse({ ok: false, error: toErrorMessage(error) }, 500);
        }
      }

      return jsonResponse({ ok: false, error: "not found" }, 404);
    },

    async scheduled(_controller: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
      await runDigest(env, deps);
    }
  };
}

export async function runDigest(
  env: Env,
  deps: RuntimeDeps = defaultDeps,
  options: { forceLatest?: boolean } = {},
): Promise<{ itemCount: number; aiAnalysis: boolean; detailedReportUrl?: string }> {
  const config = parseConfig(env);
  const now = deps.now();
  const state = await deps.getRuntimeState(env.RUNTIME_KV);

  try {
    const { candidates, items } = await deps.fetchTruthSocialPosts(config, {
      hasProcessedPost: (id) => deps.hasProcessedPost(env.BRIEF_DB, id),
      now: () => now,
      forceLatest: options.forceLatest === true,
    });

    if (items.length === 0) {
      let nextState = recordSuccess(state, now);
      if (shouldSendHeartbeat(nextState, config.heartbeatIntervalHours, now)) {
        await deps.pushToFeishu(config, buildHeartbeatMessage(nextState, config.heartbeatIntervalHours));
        nextState = { ...nextState, lastHeartbeatAt: now.toISOString() };
      }
      await deps.setRuntimeState(env.RUNTIME_KV, nextState);
      return { itemCount: 0, aiAnalysis: false };
    }

    const preparedSourceText = JSON.stringify(items);
    let aiAnalysis = true;
    let summary: string;
    let hotTerms: string[] = [];
    let digestItems: LlmDigestItem[];
    let modelLabel = "";

    try {
      const llmResult = await deps.analyzePostsWithLLM(config, env.AI, preparedSourceText);
      const parsed = deps.parseLlmDigestResponse(llmResult.content);
      modelLabel = llmResult.modelLabel;
      summary = parsed.summary;
      hotTerms = parsed.hotTerms;
      digestItems = items.map((item, index) => ({
        translatedText: parsed.items[index]?.translatedText || `新帖已抓取（${item.publishedAt}）`,
        topicTags: parsed.items[index]?.topicTags ?? [],
        interpretation: parsed.items[index]?.interpretation || "这条帖的解读待补充。"
      }));
    } catch (error) {
      aiAnalysis = false;
      console.error("LLM analyze failed", toErrorMessage(error));
      summary = "本时段抓到特朗普新帖，但 AI 中文整理暂不可用，以下为基础中文占位摘要。";
      digestItems = items.map((item) => ({
        translatedText: `新帖已抓取，发布时间 ${item.publishedAt}。`,
        topicTags: ["待补充"],
        interpretation: "AI 暂不可用，详细解读待补充。",
        publishedAt: item.publishedAt
      }));
    }

    const report = buildDetailedReport(summary, mergeReportItems(items, digestItems), now);
    const uploaded = await deps.uploadDetailedReportToCos(config, report, now);
    await saveDetailedReportCopy(env.RUNTIME_KV, uploaded.key, report);
    const publicReportUrl = buildDetailedReportPublicUrl(config.workerPublicBaseUrl, uploaded.key);
    const message = aiAnalysis
      ? buildDigestMessage(summary, hotTerms.length > 0 ? hotTerms : computeHotTerms(digestItems), digestItems.map((item, index) => ({ ...item, publishedAt: items[index]?.publishedAt })), publicReportUrl, modelLabel)
      : buildFallbackMessage(digestItems, publicReportUrl, modelLabel);

    const runId = crypto.randomUUID();
    const digestRun: Omit<DigestRunRecord, "feishuPushOk"> = {
      id: runId,
      createdAt: now.toISOString(),
      source: "Trump's Truth RSS feed",
      candidateCount: candidates.length,
      itemCount: items.length,
      aiAnalysis,
      messageText: message,
      analysisText: summary,
      reportObjectKey: uploaded.key,
      reportUrl: publicReportUrl,
      sourceItemsJson: JSON.stringify(items)
    };

    await deps.insertDigestRun(env.BRIEF_DB, digestRun);

    try {
      await uploadFeishuMessageToCos(config, message, now);
      await deps.pushToFeishu(config, message);
      await deps.markDigestRunPushed(env.BRIEF_DB, runId, true);
    } catch (error) {
      await deps.markDigestRunPushed(env.BRIEF_DB, runId, false, toErrorMessage(error));
      throw error;
    }

    if (!options.forceLatest) {
      for (const item of items) {
        const record: ProcessedPostRecord = {
          id: item.id,
          canonicalUrl: item.canonicalUrl,
          publishedAt: item.publishedAt,
          contentFingerprint: await sha256Hex(`${item.canonicalUrl}\n${item.publishedAt}\n${item.bodyText}`),
          discoveredAt: now.toISOString(),
          processedAt: now.toISOString(),
          sourcePayloadJson: JSON.stringify(item)
        };
        await deps.insertProcessedPost(env.BRIEF_DB, record);
      }
    }

    let nextState = recordSuccess(state, now);
    if (!options.forceLatest && shouldSendHeartbeat(nextState, config.heartbeatIntervalHours, now)) {
      await deps.pushToFeishu(config, buildHeartbeatMessage(nextState, config.heartbeatIntervalHours));
      nextState = { ...nextState, lastHeartbeatAt: now.toISOString() };
    }
    await deps.setRuntimeState(env.RUNTIME_KV, nextState);

    return {
      itemCount: items.length,
      aiAnalysis,
      detailedReportUrl: publicReportUrl
    };
  } catch (error) {
    let nextState = recordFailure(state, toErrorMessage(error), now);
    if (shouldSendFailureAlert(nextState, config.failureAlertThreshold, config.failureAlertCooldownMinutes, now)) {
      try {
        await deps.pushToFeishu(config, buildFailureAlertMessage(nextState, config.failureAlertThreshold));
        nextState = { ...nextState, lastAlertAt: now.toISOString() };
      } catch (pushError) {
        console.error("failure alert send failed", toErrorMessage(pushError));
      }
    }
    await deps.setRuntimeState(env.RUNTIME_KV, nextState);
    throw error;
  }
}

export async function buildHealthResponse(env: Env, deps: Pick<RuntimeDeps, "getRuntimeState" | "listRecentDigestRuns"> = defaultDeps) {
  const runtimeState: RuntimeState = await deps.getRuntimeState(env.RUNTIME_KV);
  const recentRuns = await deps.listRecentDigestRuns(env.BRIEF_DB, 5);
  return {
    ok: true,
    worker: "trump-truth-social-digest-worker",
    runtimeState,
    recentRuns
  };
}

function computeHotTerms(items: LlmDigestItem[]): string[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    for (const tag of item.topicTags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([term]) => term);
}

function mergeReportItems(items: TruthNormalizedPost[], digestItems: LlmDigestItem[]) {
  return items.map((item, index) => ({
    id: item.id,
    originalText: item.bodyText,
    translatedText: digestItems[index]?.translatedText || "内容待补充",
    topicTags: digestItems[index]?.topicTags ?? [],
    interpretation: digestItems[index]?.interpretation || "解读待补充",
    publishedAt: item.publishedAt,
    canonicalUrl: item.canonicalUrl
  }));
}

function jsonResponse(data: Record<string, unknown>, status = 200): Response {
  return Response.json(data, { status });
}

export function queueManualTrigger(ctx: ExecutionContext, task: () => Promise<unknown>): Response {
  ctx.waitUntil(task());
  return jsonResponse({ ok: true, queued: true }, 202);
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default createWorker();
