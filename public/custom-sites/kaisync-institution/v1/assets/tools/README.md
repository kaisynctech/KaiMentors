# AI tool logos

5 of the 12 tools in the grid have real official logos here, sourced from
[Simple Icons](https://simpleicons.org) (`https://cdn.simpleicons.org/<slug>`)
— the one source available that legitimately serves brand marks for exactly
this "built with X" use case:

| File | Tool | Notes |
|---|---|---|
| `anthropic.svg` | Claude Code | Anthropic mark, recolored white (default fill is near-black, invisible on this dark page) |
| `cursor.svg` | Cursor AI | Recolored white |
| `elevenlabs.svg` | ElevenLabs | Recolored white |
| `github.svg` | GitHub Copilot | Recolored white |
| `python.svg` | Python | Kept Simple Icons' default brand blue (`#3776AB`) — already visible on dark, and dropping to white would lose the recognizable "Python blue" |

## Not sourced (7 of 12)

**ChatGPT/OpenAI, Grok/xAI, Lovable, Runway, Base44, Higgsfield, Designer.io**
are not on Simple Icons (confirmed via direct CDN requests, including several
slug variants for each — not a network fluke: e.g. `cdn.simpleicons.org/openai`
returns a genuine 404 with `access-control-allow-origin` headers present,
meaning the CDN is up but has no icon for that slug).

Getting the *actual* official logo for these would mean navigating each
company's brand-kit page, finding a downloadable asset (often behind a
"download brand kit" zip), and extracting the right file — not something
achievable with an automated CDN fetch. Rather than hand-drawing a
look-alike of a company's trademark from memory (which risks producing an
inaccurate, unauthorized imitation of protected IP), these 7 tiles keep
their original hand-drawn abstract icon as a placeholder
(`.tool-logo-fallback` in `styles.css`, sized to match the real logos so the
grid stays visually consistent).

To finish this: drop the real logo file into this folder using the
filename from the original brief's table, then in `index.html` and
`tools.html` swap that tile's `<span class="tool-logo-fallback">...</span>`
for `<img src="assets/tools/<filename>" alt="<tool>" class="tool-logo">`.
