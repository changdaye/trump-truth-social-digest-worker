import { describe, expect, it } from "vitest";
import { extractCandidatePosts, fetchTruthSocialPosts, normalizeTruthPost } from "../src/services/truthsocial";

describe("Truth Social extraction", () => {
  it("keeps only original text posts from realDonaldTrump", async () => {
    const html = `
      <article data-testid="status">
        <a href="/@realDonaldTrump/posts/114389703123456789">link</a>
        <div>@realDonaldTrump</div>
        <div data-markup="true">MAKE AMERICA GREAT AGAIN!</div>
        <time datetime="2026-04-24T02:00:00.000Z"></time>
      </article>
      <article data-testid="status">
        <div>@realDonaldTrump replied</div>
        <div data-markup="true">Reply body</div>
      </article>
    `;

    const candidates = extractCandidatePosts(html, "https://truthsocialapp.com/@realDonaldTrump");
    expect(candidates).toHaveLength(1);

    const normalized = await normalizeTruthPost(candidates[0]);
    expect(normalized.authorHandle).toBe("@realDonaldTrump");
    expect(normalized.isOriginal).toBe(true);
    expect(normalized.bodyText).toContain("MAKE AMERICA GREAT AGAIN");
  });

  it("filters out already processed or non-original posts in batch fetch", async () => {
    const html = `
      <article data-testid="status">
        <a href="/@realDonaldTrump/posts/111">first</a>
        <div>@realDonaldTrump</div>
        <div data-markup="true">Fresh post</div>
        <time datetime="2026-04-24T02:00:00.000Z"></time>
      </article>
      <article data-testid="status">
        <a href="/@realDonaldTrump/posts/222">second</a>
        <div>@realDonaldTrump retruthed</div>
        <div data-markup="true">Should skip</div>
        <time datetime="2026-04-24T02:10:00.000Z"></time>
      </article>
      <article data-testid="status">
        <a href="/@realDonaldTrump/posts/333">third</a>
        <div>@realDonaldTrump</div>
        <div data-markup="true">Already processed</div>
        <time datetime="2026-04-24T02:20:00.000Z"></time>
      </article>
    `;

    const result = await fetchTruthSocialPosts(
      { truthSocialProfileUrl: "https://truthsocialapp.com/@realDonaldTrump", maxPostsPerDigest: 10 },
      {
        fetcher: async () => new Response(html),
        hasProcessedPost: async (id) => id === "333"
      }
    );

    expect(result.candidates).toHaveLength(3);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.id).toBe("111");
  });
});
