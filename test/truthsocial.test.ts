import { describe, expect, it } from "vitest";
import { extractCandidatePosts, fetchTruthSocialPosts, normalizeTruthPost } from "../src/services/truthsocial";

describe("Truth Social extraction", () => {
  it("keeps original text posts from the RSS feed", async () => {
    const xml = `
      <rss><channel>
        <item>
          <title><![CDATA[MAKE AMERICA GREAT AGAIN!]]></title>
          <description><![CDATA[<p>MAKE AMERICA GREAT AGAIN!</p>]]></description>
          <pubDate>Fri, 24 Apr 2026 05:13:56 +0000</pubDate>
          <truth:originalUrl>https://truthsocial.com/@realDonaldTrump/116457972455781406</truth:originalUrl>
          <truth:originalId>116457972455781406</truth:originalId>
        </item>
        <item>
          <title><![CDATA[[No Title] - Post from April 24, 2026]]></title>
          <description><![CDATA[<p><span class="quote-inline"><br/>RT: https://truthsocial.com/users/realDonaldTrump/statuses/116457788834581503</span></p>]]></description>
          <pubDate>Fri, 24 Apr 2026 04:27:27 +0000</pubDate>
          <truth:originalUrl>https://truthsocial.com/@realDonaldTrump/116457789709036829</truth:originalUrl>
          <truth:originalId>116457789709036829</truth:originalId>
        </item>
      </channel></rss>
    `;

    const candidates = extractCandidatePosts(xml);
    expect(candidates).toHaveLength(2);

    const normalized = await normalizeTruthPost(candidates[0]);
    expect(normalized.authorHandle).toBe("@realDonaldTrump");
    expect(normalized.isOriginal).toBe(true);
    expect(normalized.bodyText).toContain("MAKE AMERICA GREAT AGAIN");
  });

  it("filters out reposts and already processed items in batch fetch", async () => {
    const xml = `
      <rss><channel>
        <item>
          <title><![CDATA[Fresh text post]]></title>
          <description><![CDATA[<p>Fresh text post</p>]]></description>
          <pubDate>Fri, 24 Apr 2026 05:13:56 +0000</pubDate>
          <truth:originalUrl>https://truthsocial.com/@realDonaldTrump/111</truth:originalUrl>
          <truth:originalId>111</truth:originalId>
        </item>
        <item>
          <title><![CDATA[[No Title] - Post from April 24, 2026]]></title>
          <description><![CDATA[<p><span class="quote-inline"><br/>RT: https://truthsocial.com/users/realDonaldTrump/statuses/222</span></p>]]></description>
          <pubDate>Fri, 24 Apr 2026 04:27:27 +0000</pubDate>
          <truth:originalUrl>https://truthsocial.com/@realDonaldTrump/222</truth:originalUrl>
          <truth:originalId>222</truth:originalId>
        </item>
        <item>
          <title><![CDATA[Already processed]]></title>
          <description><![CDATA[<p>Already processed</p>]]></description>
          <pubDate>Fri, 24 Apr 2026 04:21:59 +0000</pubDate>
          <truth:originalUrl>https://truthsocial.com/@realDonaldTrump/333</truth:originalUrl>
          <truth:originalId>333</truth:originalId>
        </item>
      </channel></rss>
    `;

    const result = await fetchTruthSocialPosts(
      { trumpTruthFeedUrl: "https://trumpstruth.org/feed", maxPostsPerDigest: 10 },
      {
        feedLoader: async () => xml,
        hasProcessedPost: async (id) => id === "333"
      }
    );

    expect(result.candidates).toHaveLength(3);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.id).toBe("111");
  });
});
