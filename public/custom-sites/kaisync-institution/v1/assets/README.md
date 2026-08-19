# KaiSync Institution — assets

## Logo

`kaisync-logo.png` is the real KaiSync Institution logo, as supplied
(purple-to-cyan gradient wordmark + circuit-line mark on an **opaque white
background**). Kept as-is — the canonical source file, untouched.

`kaisync-logo-transparent.png` is what every page actually uses (header,
homepage hero ring, footer, on all 5 pages). It's a chroma-keyed derivative
of the source file with the white background converted to true alpha
transparency, generated because neither blend-mode trick actually works
against this page's near-black background (`--bg: #06060E`):

- `filter: brightness(0) invert(1)` — correct for a flat, single-tone
  white-bg logo, but this logo is multi-tone (gradient + white), so the
  filter crushed the whole image to a solid white blob (tried this first;
  visually confirmed broken, see git history).
- `mix-blend-mode: screen` — leaves the white background rendering as a
  solid white box; `screen` only makes *black* content disappear into a
  background, not white. Verified via a canvas pixel sample: the source
  file's white corner pixel came out as `rgb(254,254,254)` — still opaque
  white, not blended away.
- `mix-blend-mode: multiply` — correctly hides the white background (canvas
  sample: corner pixel became `rgb(6,6,14)`, i.e. exactly `--bg`), but
  `multiply` against a *near-black* background crushes the colorful
  gradient wordmark down to near-black too (sampled `rgb(1,0,4)` on the
  wordmark) — the classic "multiply removes white" trick assumes a light/
  white page, not a black one.

None of those blend modes can give correct results on both the background
*and* the artwork at the same time against a dark page — the white pixels
need to become genuinely transparent, not just blended. So
`kaisync-logo-transparent.png` was generated via an in-browser canvas
chroma-key (near-white pixels → alpha 0, with a soft-edge falloff band to
avoid a hard cutout on anti-aliased edges) and is used directly with a plain
`<img>` — no `filter` or `mix-blend-mode` needed on it at all.

If a better transparent-background export of the logo becomes available
later, drop it in as `kaisync-logo-transparent.png` (or update the `src`
paths in `index.html`, `about.html`, `courses.html`, `tools.html`, and
`pricing.html` to point at the new filename).

`kaisync-logo.svg` and `kaisync-mark.svg` are the earlier placeholder vector
logos built before the real file was supplied — no longer referenced by any
page, kept only as history. Safe to delete.

## Photos

No team or event photos are included in this brief. Wherever a photo would
normally go, the pages use a CSS placeholder block:

```css
background: var(--surface-2);
border: 1px solid var(--line);
```

Nyarie will supply real photos in a future update — swap the placeholder
`<div class="photo-placeholder">` blocks for `<img>` tags at that point.
