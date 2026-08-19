# AI tool logos

All 12 tools now have real, verified official logos.

| File | Tool | Source |
|---|---|---|
| `anthropic.png` | Claude Code | anthropic.com favicon (`apple-icon.png`) |
| `openai.png` | ChatGPT | openai.com favicon (`apple-icon.png`) |
| `grok.png` | Grok | grok.com's own icon (distinct from xAI's corporate mark at x.ai) |
| `cursor.svg` | Cursor AI | Simple Icons (`cdn.simpleicons.org/cursor`) |
| `lovable.png` | Lovable | lovable.dev favicon |
| `runway.png` | Runway | runway.com favicon |
| `elevenlabs.png` | ElevenLabs | elevenlabs.io favicon |
| `github.svg` | GitHub Copilot | Simple Icons (`cdn.simpleicons.org/github`) |
| `python.svg` | Python | Simple Icons (`cdn.simpleicons.org/python`) |
| `base44.png` | Base44 | base44.com favicon |
| `higgsfield.png` | Higgsfield | higgsfield.ai favicon |
| `design-io.png` | Designer.io | as supplied |

## Important: a round of file mislabeling was caught and fixed here

A batch of files supplied for this task were misnamed relative to what they
actually contained — verified by cross-checking each against the real
company's own site favicon, not by visual guessing:

- The file supplied as `anthropic.png` was actually **Runway's** logo.
- The file supplied as `runway.png` was actually **Higgsfield's** logo.
- The file supplied as `elevenlabs.png` did not match ElevenLabs' real logo
  (a black "II" mark) — it was something else, closest in style to Base44's
  dome-shaped mark but not a pixel match either.
- The file supplied as `base44.png` (an orange multi-point starburst) did
  not match Base44's real logo (an orange dome with a white stripe cutout)
  or any other brand checked here — left unidentified and not used.

Anthropic, Runway, ElevenLabs, and Base44's real logos above were re-sourced
directly from each company's own site favicon instead. `grok.png`,
`openai.png`, and `lovable.png` were double-checked and are correct as
originally supplied.

## Processing applied

Real company logos are almost never delivered pre-styled for a dark page —
most come as a dark mark on a white/cream canvas. Two fixes were applied
per logo, each verified programmatically (pixel/alpha sampling), not just
eyeballed:

1. **Chroma-key to transparent.** Each logo's actual background color was
   sampled (not assumed to be pure white — several were cream, e.g.
   `#EFEEE6`) and keyed out by color distance, with a soft falloff band for
   anti-aliased edges. Skipped for logos already delivered on a transparent
   or intentional colored "app icon" canvas (`grok.png`'s black rounded
   square, `base44.png` and `higgsfield.png`'s icon backgrounds) — those
   badge colors are part of the brand's own icon design, not an incidental
   white canvas, so they were left alone.
2. **Invert for visibility.** A logo that's solid/near-solid black reads as
   invisible on this page's near-black background. For single- or two-tone
   marks (`anthropic.png`, `openai.png`, `runway.png`, `elevenlabs.png`,
   `design-io.png`), a literal per-channel RGB invert (`255 - value` on each
   of R/G/B, alpha untouched) was applied instead of the
   `filter: brightness(0) invert(1)` CSS trick used elsewhere on this site —
   that trick crushes every opaque pixel to black before inverting, which
   destroys contrast in anything with more than one tone (confirmed
   visually on `design-io.png`, which has both black and white as
   meaningful content). A literal channel invert preserves that contrast
   while still flipping dark-on-light to light-on-dark.
   `lovable.png` (colorful gradient) needed neither step 2 nor further
   changes beyond the background key — it already reads fine on dark.
