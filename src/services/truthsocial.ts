export interface TruthCandidatePost {
  postId: string;
  canonicalUrl: string;
  authorHandle: string;
  bodyText: string;
  publishedAt: string;
  isReply: boolean;
  isRepost: boolean;
}

export interface TruthNormalizedPost {
  id: string;
  canonicalUrl: string;
  authorHandle: string;
  bodyText: string;
  publishedAt: string;
  isOriginal: boolean;
}

export interface TruthSocialConfig {
  truthSocialProfileUrl: string;
  maxPostsPerDigest: number;
}

export interface TruthSocialFetchDeps {
  fetcher: typeof fetch;
  hasProcessedPost: (id: string) => Promise<boolean>;
}

export function extractCandidatePosts(html: string, profileUrl: string): TruthCandidatePost[] {
  const articlePattern = /<article[\s\S]*?<\/article>/g;
  const articles = html.match(articlePattern) ?? [];

  return articles
    .map((article) => {
      const hrefMatch = article.match(/href="([^"]*\/posts\/(\d+))"/);
      const href = hrefMatch?.[1];
      const postId = hrefMatch?.[2] ?? "";
      const canonicalUrl = href ? new URL(href, profileUrl).toString() : "";
      const handle = article.includes("@realDonaldTrump") ? "@realDonaldTrump" : "";
      const body = decodeHtml(
        (article.match(/data-markup="true">([\s\S]*?)<\//) ?? [])[1]
          ?.replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim() ?? ""
      );
      const publishedAt = (article.match(/datetime="([^"]+)"/) ?? [])[1] ?? "";
      const lower = article.toLowerCase();

      return {
        postId,
        canonicalUrl,
        authorHandle: handle,
        bodyText: body,
        publishedAt,
        isReply: lower.includes(" replied"),
        isRepost: lower.includes("retruth") || lower.includes("re-truth") || lower.includes("retruthed")
      } satisfies TruthCandidatePost;
    })
    .filter((item) => Boolean(item.authorHandle && item.canonicalUrl && item.postId));
}

export async function normalizeTruthPost(candidate: TruthCandidatePost): Promise<TruthNormalizedPost> {
  return {
    id: candidate.postId,
    canonicalUrl: candidate.canonicalUrl,
    authorHandle: candidate.authorHandle,
    bodyText: candidate.bodyText,
    publishedAt: candidate.publishedAt,
    isOriginal: !candidate.isReply && !candidate.isRepost && Boolean(candidate.bodyText.trim())
  };
}

export async function fetchTruthSocialPosts(config: TruthSocialConfig, deps: TruthSocialFetchDeps): Promise<{
  candidates: TruthCandidatePost[];
  items: TruthNormalizedPost[];
}> {
  const response = await deps.fetcher(config.truthSocialProfileUrl, {
    headers: {
      "user-agent": "Mozilla/5.0"
    }
  });

  if (!response.ok) {
    throw new Error(`Truth Social profile fetch failed: HTTP ${response.status}`);
  }

  const html = await response.text();
  const candidates = extractCandidatePosts(html, config.truthSocialProfileUrl);
  const normalized = await Promise.all(candidates.map(normalizeTruthPost));
  const items: TruthNormalizedPost[] = [];

  for (const item of normalized) {
    if (!item.isOriginal) continue;
    if (await deps.hasProcessedPost(item.id)) continue;
    items.push(item);
    if (items.length >= config.maxPostsPerDigest) break;
  }

  return { candidates, items };
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
