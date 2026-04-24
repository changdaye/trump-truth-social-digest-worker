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
  trumpTruthFeedUrl: string;
  maxPostsPerDigest: number;
}

export interface TruthSocialFetchDeps {
  hasProcessedPost: (id: string) => Promise<boolean>;
  feedLoader?: (feedUrl: string) => Promise<string>;
}

export function extractCandidatePosts(xml: string): TruthCandidatePost[] {
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];

  return items.map((itemXml) => {
    const title = cleanText(extractTagContent(itemXml, 'title'));
    const descriptionHtml = extractTagContent(itemXml, 'description');
    const descriptionText = cleanText(stripHtml(descriptionHtml));
    const originalUrl = cleanText(extractNamespacedTagContent(itemXml, 'originalUrl'));
    const originalId = cleanText(extractNamespacedTagContent(itemXml, 'originalId')) || extractPostId(originalUrl);
    const publishedAt = toIsoDate(cleanText(extractTagContent(itemXml, 'pubDate')));
    const bodyText = descriptionText || normalizeNoTitle(title);
    const isRepost = /^RT:/i.test(descriptionText) || /\bRT:\s*https?:\/\//i.test(descriptionText);

    return {
      postId: originalId,
      canonicalUrl: originalUrl,
      authorHandle: '@realDonaldTrump',
      bodyText,
      publishedAt,
      isReply: false,
      isRepost
    } satisfies TruthCandidatePost;
  }).filter((item) => Boolean(item.postId && item.canonicalUrl));
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
  const xml = await (deps.feedLoader ?? defaultFeedLoader)(config.trumpTruthFeedUrl);
  const candidates = extractCandidatePosts(xml);
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

async function defaultFeedLoader(feedUrl: string): Promise<string> {
  const response = await fetch(feedUrl, {
    headers: { 'user-agent': 'Mozilla/5.0' }
  });
  if (!response.ok) {
    throw new Error(`Trump's Truth feed fetch failed: HTTP ${response.status}`);
  }
  return await response.text();
}

function extractTagContent(itemXml: string, tagName: string): string {
  const cdata = new RegExp(`<${tagName}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tagName}>`, 'i').exec(itemXml);
  if (cdata) return cdata[1];
  const plain = new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, 'i').exec(itemXml);
  return plain?.[1] ?? '';
}

function extractNamespacedTagContent(itemXml: string, tagName: string): string {
  const match = new RegExp(`<truth:${tagName}>([\\s\\S]*?)<\\/truth:${tagName}>`, 'i').exec(itemXml);
  return match?.[1] ?? '';
}

function stripHtml(value: string): string {
  return decodeHtml(value).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function cleanText(value: string): string {
  return decodeHtml(value)
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeNoTitle(title: string): string {
  return /^\[No Title\]/i.test(title) ? '' : title;
}

function extractPostId(url: string): string {
  const match = /\/([0-9]{6,})$/.exec(url);
  return match?.[1] ?? '';
}

function toIsoDate(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x2019;/gi, '’')
    .replace(/&#8217;/g, '’');
}
