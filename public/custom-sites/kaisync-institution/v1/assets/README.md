# KaiSync Institution — asset placeholders

## Logo

`kaisync-logo.svg` (horizontal lockup, used in header/footer) and
`kaisync-mark.svg` (square mark, used in the homepage hero ring) are
**placeholder vector logos** built from the brand palette described in
MB-116 (purple-to-cyan gradient, `#2D1B8E` → `#00C4D8`). No real KaiSync
Institution logo file was supplied when this site was built, so these were
created as clean SVG stand-ins rather than guessing at a raster PNG.

To swap in the real logo:

1. Drop the real file into this folder (SVG preferred for crispness at
   multiple sizes; PNG also works).
2. Update the `src` attributes in `index.html`, `about.html`, `courses.html`,
   `tools.html`, and `pricing.html` (header brand mark, hero ring, footer
   brand mark) to point at the new filename.
3. Both current placeholders are designed to be used with
   `filter: brightness(0) invert(1)` (renders as a solid white silhouette on
   the dark background) — keep that filter if the real logo is also a
   solid-color mark, or drop it if the real logo already has a
   dark-background-ready (white/light) version.

## Photos

No team or event photos are included in this brief. Wherever a photo would
normally go, the pages use a CSS placeholder block:

```css
background: var(--surface-2);
border: 1px solid var(--line);
```

Nyarie will supply real photos in a future update — swap the placeholder
`<div class="photo-placeholder">` blocks for `<img>` tags at that point.
