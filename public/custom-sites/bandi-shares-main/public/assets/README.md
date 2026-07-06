# Image Assets

Drop your image files into this directory (`public/assets/`).
Next.js serves everything under `public/` at the root path `/`.

## Required files

| File                       | Used in                   | Notes                              |
|----------------------------|---------------------------|------------------------------------|
| `logo.jpeg`                | Navbar, Footer            | Square, ≥ 90×90 px                 |
| `hero-bandi.jpeg`          | Homepage hero             | Landscape, ≥ 1920×1080 px          |
| `bandi-lecture.jpeg`       | Homepage gallery (large)  | Landscape, ≥ 800×600 px            |
| `bandi-presentation.jpeg`  | Homepage gallery + About  | Landscape or portrait              |
| `gallery-seminar-1.jpg`    | Homepage gallery          | Any orientation                    |
| `gallery-charts.jpg`       | Homepage gallery          | Any orientation                    |
| `gallery-community.jpg`    | Homepage gallery (wide)   | Landscape preferred                |
| `gallery-mentorship.jpg`   | Homepage gallery          | Any orientation                    |

## Tips

- Next.js `<Image>` will auto-convert to WebP/AVIF on delivery (configured in `next.config.ts`).
- Use `priority` on above-the-fold images (already set on hero + logo).
- If filenames differ, update `GALLERY` in `app/page.tsx` and the src in `app/about/page.tsx`.
