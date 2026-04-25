import type { DigestRunRecord, ProcessedPostRecord } from "./types";

export async function hasProcessedPost(db: D1Database, id: string): Promise<boolean> {
  const row = await db.prepare("SELECT 1 FROM processed_posts WHERE id = ? LIMIT 1").bind(id).first();
  return Boolean(row);
}

export async function insertProcessedPost(db: D1Database, record: ProcessedPostRecord): Promise<void> {
  await db.prepare(`
    INSERT INTO processed_posts (
      id,
      canonical_url,
      published_at,
      content_fingerprint,
      discovered_at,
      processed_at,
      source_payload_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `)
    .bind(
      record.id,
      record.canonicalUrl,
      record.publishedAt,
      record.contentFingerprint,
      record.discoveredAt,
      record.processedAt,
      record.sourcePayloadJson
    )
    .run();
}

export async function insertDigestRun(db: D1Database, record: Omit<DigestRunRecord, "feishuPushOk">): Promise<void> {
  await db.prepare(`
    INSERT INTO digest_runs (
      id,
      created_at,
      source,
      candidate_count,
      item_count,
      ai_analysis,
      message_text,
      analysis_text,
      report_object_key,
      report_url,
      source_items_json,
      feishu_push_ok,
      push_error
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
    .bind(
      record.id,
      record.createdAt,
      record.source,
      record.candidateCount,
      record.itemCount,
      record.aiAnalysis ? 1 : 0,
      record.messageText,
      record.analysisText ?? null,
      record.reportObjectKey ?? null,
      record.reportUrl ?? null,
      record.sourceItemsJson,
      0,
      record.pushError ?? null
    )
    .run();
}

export async function markDigestRunPushed(db: D1Database, id: string, ok: boolean, pushError?: string): Promise<void> {
  await db.prepare("UPDATE digest_runs SET feishu_push_ok = ?, push_error = ? WHERE id = ?")
    .bind(ok ? 1 : 0, pushError ?? null, id)
    .run();
}

export async function listRecentDigestRuns(db: D1Database, limit: number): Promise<Record<string, unknown>[]> {
  const result = await db.prepare(`
    SELECT id, created_at, source, candidate_count, item_count, ai_analysis, report_url, feishu_push_ok, push_error
    FROM digest_runs
    ORDER BY created_at DESC
    LIMIT ?
  `).bind(limit).all();

  return (result.results as Record<string, unknown>[] | undefined) ?? [];
}
