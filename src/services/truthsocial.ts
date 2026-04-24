import puppeteer from "@cloudflare/puppeteer";

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
  hasProcessedPost: (id: string) => Promise<boolean>;
  htmlLoader?: (profileUrl: string) => Promise<string>;
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
  const html = await (deps.htmlLoader ?? defaultHtmlLoader)(config.truthSocialProfileUrl);
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

export interface TruthRenderDiagnostics {
  target: string;
  finalUrl: string;
  title: string;
  bodySnippet: string;
  htmlLength: number;
  articleCount: number;
  postLinkCount: number;
  candidateCount: number;
}

export async function loadTruthSocialProfileHtml(profileUrl: string, browserBinding: Fetcher): Promise<string> {
  const result = await loadTruthSocialProfileDiagnostics(profileUrl, browserBinding);
  if (!result.html) {
    throw new Error(`Browser rendered page but found no post content. ${result.diagnostics.map((item) => `target=${item.target} final=${item.finalUrl} title=${item.title} snippet=${item.bodySnippet}`).join(" | ")}`);
  }
  return result.html;
}

export async function loadTruthSocialProfileDiagnostics(profileUrl: string, browserBinding: Fetcher): Promise<{ html?: string; diagnostics: TruthRenderDiagnostics[] }> {
  const browser = await puppeteer.launch(browserBinding);
  const targets = buildFallbackTargets(profileUrl);
  const diagnostics: TruthRenderDiagnostics[] = [];

  try {
    for (const target of targets) {
      const page = await browser.newPage();
      try {
        await page.setUserAgent(
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
        );
        await page.goto(target, { waitUntil: "domcontentloaded", timeout: 60_000 });
        await page.waitForNetworkIdle({ idleTime: 1_500, timeout: 15_000 }).catch(() => {});
        await page.waitForSelector('body', { timeout: 5_000 });
        const html = await page.content();
        const title = await page.title();
        const bodyText = await page.evaluate(() => document.body?.innerText ?? "");
        const diag = {
          target,
          finalUrl: page.url(),
          title,
          bodySnippet: compact(bodyText),
          htmlLength: html.length,
          articleCount: (html.match(/<article[\s\S]*?<\/article>/g) ?? []).length,
          postLinkCount: (html.match(/\/posts\/\d+/g) ?? []).length,
          candidateCount: extractCandidatePosts(html, target).length
        } satisfies TruthRenderDiagnostics;
        diagnostics.push(diag);

        if (containsLikelyPostContent(html, title, bodyText)) {
          return { html, diagnostics };
        }
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }

  return { diagnostics };
}

async function defaultHtmlLoader(profileUrl: string): Promise<string> {
  const response = await fetch(profileUrl, {
    headers: { "user-agent": "Mozilla/5.0" }
  });
  if (!response.ok) {
    throw new Error(`Truth Social profile fetch failed: HTTP ${response.status}`);
  }
  return await response.text();
}

function buildFallbackTargets(profileUrl: string): string[] {
  const urls = [profileUrl];
  if (profileUrl.includes("truthsocial.com")) {
    urls.push(profileUrl.replace("truthsocial.com", "truthsocialapp.com"));
  } else if (profileUrl.includes("truthsocialapp.com")) {
    urls.push(profileUrl.replace("truthsocialapp.com", "truthsocial.com"));
  }
  return [...new Set(urls)];
}

function containsLikelyPostContent(html: string, title: string, bodyText: string): boolean {
  const loweredTitle = title.toLowerCase();
  const loweredBody = bodyText.toLowerCase();
  if (loweredTitle.includes("just a moment") || loweredBody.includes("performing security verification") || html.includes("__cf_chl_")) {
    return false;
  }
  return html.includes('/posts/') || /@realDonaldTrump/i.test(bodyText) || /truths|retruths|replies/i.test(bodyText);
}

function compact(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, 220);
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
