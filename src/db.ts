import type { ProcessedPostRecord } from "./types";

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
