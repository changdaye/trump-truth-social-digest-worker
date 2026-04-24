export interface Env {
  AI: Ai;
  RUNTIME_KV: KVNamespace;
  BRIEF_DB: D1Database;
  FEISHU_WEBHOOK: string;
  FEISHU_SECRET?: string;
  MANUAL_TRIGGER_TOKEN?: string;
  TENCENT_COS_SECRET_ID: string;
  TENCENT_COS_SECRET_KEY: string;
  TENCENT_COS_BUCKET: string;
  TENCENT_COS_REGION: string;
  TENCENT_COS_BASE_URL?: string;
  LLM_MODEL?: string;
  DIGEST_INTERVAL_HOURS?: string;
  HEARTBEAT_INTERVAL_HOURS?: string;
  REQUEST_TIMEOUT_MS?: string;
  FETCH_WINDOW_HOURS?: string;
  MAX_POSTS_PER_DIGEST?: string;
  FAILURE_ALERT_THRESHOLD?: string;
  FAILURE_ALERT_COOLDOWN_MINUTES?: string;
  TRUMP_TRUTH_FEED_URL?: string;
}

export interface BriefConfig {
  feishuWebhook: string;
  feishuSecret: string;
  manualTriggerToken: string;
  cosSecretId: string;
  cosSecretKey: string;
  cosBucket: string;
  cosRegion: string;
  cosBaseUrl: string;
  llmModel: string;
  digestIntervalHours: number;
  heartbeatIntervalHours: number;
  requestTimeoutMs: number;
  fetchWindowHours: number;
  maxPostsPerDigest: number;
  failureAlertThreshold: number;
  failureAlertCooldownMinutes: number;
  trumpTruthFeedUrl: string;
}

export interface ProcessedPostRecord {
  id: string;
  canonicalUrl: string;
  publishedAt: string;
  contentFingerprint: string;
  discoveredAt: string;
  processedAt: string;
  sourcePayloadJson: string;
}

export interface DigestRunRecord {
  id: string;
  createdAt: string;
  source: string;
  candidateCount: number;
  itemCount: number;
  aiAnalysis: boolean;
  messageText: string;
  analysisText?: string;
  reportObjectKey?: string;
  reportUrl?: string;
  sourceItemsJson: string;
  feishuPushOk: boolean;
  pushError?: string;
}
