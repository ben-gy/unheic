# unHEIC — Build Review

This file exists only to create a reviewable PR. All code is already deployed on `main`.

**Merge this PR to acknowledge the build.** Closing without merging is also fine.

## Links

- **GitHub Pages:** https://ben-gy.github.io/unheic/ *(redirects to custom domain once DNS + cert are live)*
- **Custom domain:** https://unheic.benrichardson.dev

## What it does

Converts iPhone **HEIC / HEIF** photos to **JPG, PNG or WebP** entirely in the browser, using the
open-source **libheif** decoder compiled to WebAssembly. No uploads, no accounts, no watermarks,
no batch limits. Re-encoding through the canvas strips EXIF/GPS metadata as a side effect. Works
offline after first load (service worker).

Verified end-to-end in a local production preview: a real 6016×6016 (36 MP) HEIC decoded in ~2.9 s
and re-encoded to JPG at 8.7 MB → 1.3 MB (−85%), with a live thumbnail, download, and event log.

## DNS setup (already applied)

| Type | Name | Target | Proxy |
|------|------|--------|-------|
| CNAME | `unheic` | `ben-gy.github.io` | DNS only (grey cloud) |

If the cert ever needs re-triggering:
```bash
gh api repos/ben-gy/unheic/pages -X PUT -f cname=""
sleep 3
gh api repos/ben-gy/unheic/pages -X PUT -f cname="unheic.benrichardson.dev"
```
