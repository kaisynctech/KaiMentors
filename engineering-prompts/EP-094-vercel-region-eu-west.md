# EP-094 — Set Vercel Serverless Function Region to lhr1 (London)

## Problem

Vercel defaults serverless functions to **iad1 (Washington D.C., US-East)**.
The Supabase project ("Forex") is in **eu-west-1 (Ireland)**. Every database
and auth call made by a serverless function crosses the Atlantic — ~80–100 ms
of network transit per round-trip under normal conditions. A portal login makes
4–5 sequential Supabase calls, so the baseline penalty is 320–500 ms before
any query execution time.

KaiMentors clients are primarily Africa-based. London (lhr1) is substantially
closer to both Ireland (Supabase) and Africa than Washington D.C. is.

## Change — `vercel.json`

**Current content:**

```json
{}
```

**Replace with:**

```json
{
  "regions": ["lhr1"]
}
```

That is the only change. One file, one line of content added.

## What this does

Vercel will deploy all serverless functions (Next.js API routes and
server-side rendered pages) from the London region. Static assets are
served via Vercel's global CDN regardless of this setting — only function
execution is affected.

Expected improvement: Vercel → Supabase round-trip drops from ~80–100 ms
(iad1 → eu-west-1) to ~10–20 ms (lhr1 → eu-west-1). A portal login that
currently accumulates 400–500 ms in pure transit overhead will drop to
~50–100 ms.

## Deployment

Commit and push. Vercel will redeploy automatically. No migration, no
environment variable changes, no other files touched.

**Do not deploy during the current Supabase infrastructure incident.** Wait
until Supabase eu-west-1 is fully recovered so the latency improvement is
cleanly measurable. Check [status.supabase.com](https://status.supabase.com)
before deploying.

## Verification

After deploy, log in at `kaimentors.vercel.app/portal/kaitrades/login` as
`kaisynctech@gmail.com` (KaiTrades acceptance tenant). The login should
complete noticeably faster than before. You can also open Chrome DevTools →
Network → filter by `/api/workspace/activate` and confirm the request
duration drops significantly compared to before.
