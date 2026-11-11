export type GoldHeadline = {
  title: string;
  url: string;
  publishedAt: string | null;
  summary: string | null;
};

export type GoldBrief = {
  source: "FXStreet";
  sourceUrl: string;
  items: GoldHeadline[];
  unavailable: boolean;
};

const SOURCE_URL = "https://www.fxstreet.com/news/feed";
const FEED_URLS = [
  "https://www.fxstreet.com/rss/gold",
  "https://www.fxstreet.com/rss/news",
];

let cached: { at: number; brief: GoldBrief } | null = null;
const CACHE_MS = 30 * 60 * 1000;

function decodeXml(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tag(block: string, name: string) {
  const match = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return match ? decodeXml(match[1]) : "";
}

export function parseFxStreetRss(xml: string): GoldHeadline[] {
  const items: GoldHeadline[] = [];
  const pattern = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(xml)) && items.length < 4) {
    const block = match[1];
    const title = tag(block, "title");
    const url = tag(block, "link");
    if (!title || !url.startsWith("https://www.fxstreet.com/")) continue;
    const rawSummary = tag(block, "description");
    const published = tag(block, "pubDate");
    items.push({
      title: title.slice(0, 180),
      url,
      publishedAt: published ? new Date(published).toISOString() : null,
      summary: rawSummary ? rawSummary.slice(0, 220) : null,
    });
  }
  return items;
}

async function loadFeed(): Promise<GoldHeadline[]> {
  for (const url of FEED_URLS) {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/rss+xml, application/xml, text/xml",
          "User-Agent": "KaiMentors/1.0 (market-brief)",
        },
        signal: AbortSignal.timeout(8000),
        cache: "no-store",
      });
      if (!response.ok) continue;
      const xml = await response.text();
      const items = parseFxStreetRss(xml);
      if (items.length > 0) return items;
    } catch {
      continue;
    }
  }
  return [];
}

export async function getGoldBrief(): Promise<GoldBrief> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.brief;
  const items = await loadFeed();
  const brief: GoldBrief = {
    source: "FXStreet",
    sourceUrl: SOURCE_URL,
    items,
    unavailable: items.length === 0,
  };
  cached = { at: Date.now(), brief };
  return brief;
}
