import type { BriefConfig, Env } from "./types";
import { toInt } from "./lib/value";

export function parseConfig(env: Env): BriefConfig {
  if (!env.FEISHU_WEBHOOK) throw new Error("missing FEISHU_WEBHOOK");
  if (!env.TENCENT_COS_SECRET_ID) throw new Error("missing TENCENT_COS_SECRET_ID");
  if (!env.TENCENT_COS_SECRET_KEY) throw new Error("missing TENCENT_COS_SECRET_KEY");
  if (!env.TENCENT_COS_BUCKET) throw new Error("missing TENCENT_COS_BUCKET");
  if (!env.TENCENT_COS_REGION) throw new Error("missing TENCENT_COS_REGION");

  return {
    feishuWebhook: env.FEISHU_WEBHOOK.trim(),
    feishuSecret: env.FEISHU_SECRET?.trim() ?? "",
    manualTriggerToken: env.MANUAL_TRIGGER_TOKEN?.trim() ?? "",
    cosSecretId: env.TENCENT_COS_SECRET_ID.trim(),
    cosSecretKey: env.TENCENT_COS_SECRET_KEY.trim(),
    cosBucket: env.TENCENT_COS_BUCKET.trim(),
    cosRegion: env.TENCENT_COS_REGION.trim(),
    cosBaseUrl: env.TENCENT_COS_BASE_URL?.trim() || `https://${env.TENCENT_COS_BUCKET.trim()}.cos.${env.TENCENT_COS_REGION.trim()}.myqcloud.com`,
    workerPublicBaseUrl: env.WORKER_PUBLIC_BASE_URL?.trim() || "https://trump-truth-social-digest-worker.5frhvfq5s2.workers.dev",
    llmBaseUrl: env.LLM_BASE_URL?.trim() ?? "",
    llmApiKey: env.LLM_API_KEY?.trim() ?? "",
    llmModel: env.LLM_MODEL?.trim() || "@cf/meta/llama-3.1-8b-instruct",
    digestIntervalHours: toInt(env.DIGEST_INTERVAL_HOURS, 2, 1),
    heartbeatIntervalHours: toInt(env.HEARTBEAT_INTERVAL_HOURS, 24, 1),
    requestTimeoutMs: toInt(env.REQUEST_TIMEOUT_MS, 15_000, 1_000),
    fetchWindowHours: toInt(env.FETCH_WINDOW_HOURS, 2, 1),
    maxPostsPerDigest: toInt(env.MAX_POSTS_PER_DIGEST, 30, 1),
    failureAlertThreshold: toInt(env.FAILURE_ALERT_THRESHOLD, 1, 1),
    failureAlertCooldownMinutes: toInt(env.FAILURE_ALERT_COOLDOWN_MINUTES, 180, 1),
    trumpTruthFeedUrl: env.TRUMP_TRUTH_FEED_URL?.trim() || "https://trumpstruth.org/feed",
  };
}
