import assert from "node:assert/strict";
import test from "node:test";
import { parseFxStreetRss } from "../lib/fxstreet-gold.ts";

test("FXStreet gold headlines keep the title, link, and a short summary", () => {
  const xml = `<?xml version="1.0"?>
    <rss><channel>
      <item>
        <title><![CDATA[Gold holds above $2,400]]></title>
        <link>https://www.fxstreet.com/news/gold-holds</link>
        <pubDate>Wed, 11 Nov 2026 06:00:00 GMT</pubDate>
        <description><![CDATA[<p>Traders watch US yields.</p>]]></description>
      </item>
      <item>
        <title>Not FXStreet</title>
        <link>https://example.com/gold</link>
        <description>Ignore this source.</description>
      </item>
    </channel></rss>`;
  const items = parseFxStreetRss(xml);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, "Gold holds above $2,400");
  assert.equal(items[0].url, "https://www.fxstreet.com/news/gold-holds");
  assert.equal(items[0].summary, "Traders watch US yields.");
  assert.ok(items[0].publishedAt);
});
