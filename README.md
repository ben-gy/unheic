# unHEIC

**Convert iPhone HEIC & HEIF photos to JPG, PNG or WebP right in your browser — nothing is uploaded.**

Live: https://unheic.benrichardson.dev

---

## what it is

iPhones save photos as **HEIC** to fit twice as many pictures in the same space. It's a great format — until you try to email one, attach it to a web form, hand it to a print shop, or open it on a Windows PC, and everything refuses it. So you Google "convert HEIC to JPG" and land on a pile of sites that make you upload your personal photos to a stranger's server, slap a watermark on the result, or cap you at two files unless you pay.

unHEIC does the whole job **in your browser**. It runs the same open-source **libheif** engine those servers use — compiled to WebAssembly — to decode HEIC/HEIF locally and re-encode to clean JPG, PNG or WebP. No uploads, no accounts, no watermarks, no batch limits. Drop a single photo or a whole camera-roll dump; once the page has loaded it even works offline.

It's for the non-technical iPhone owner who just wants usable photos and is (rightly) wary of handing pictures of their kids to an anonymous conversion farm.

## how it works

```
 .HEIC file ──▶ read into the tab ──▶ [ Web Worker ]
                                        │  libheif (WASM) → RGBA pixels
                                        │  OffscreenCanvas → JPG / PNG / WebP
                                        ▼
                              Blob ──▶ download · copy · share · ZIP
```

1. You drop / pick / paste one or many `.heic` / `.heif` files. Each is read straight into the page as an `ArrayBuffer` — never sent anywhere.
2. A dedicated **Web Worker** processes the queue one file at a time (HEIC decode is memory-heavy; sequential keeps big batches from blowing up RAM). libheif decodes to raw RGBA, then an `OffscreenCanvas` re-encodes to your chosen format at your chosen quality. The buffer is handed to the worker zero-copy via a transferable, and progress streams back per file.
3. You get a gallery of thumbnails with before/after sizes. Download each, copy to the clipboard, share (on mobile), or grab the whole batch as a single ZIP.

Re-encoding through the canvas drops all EXIF metadata — GPS, camera serial, timestamps — as a side effect. The one thing carried over is orientation, so photos aren't sideways.

## browser APIs used

- **libheif-js (WebAssembly)** — decodes HEIC/HEIF to raw pixels, locally. The `wasm-bundle` build inlines the binary, so there's no third-party runtime fetch.
- **Web Workers (module)** — all decode + encode runs off the main thread; the UI never freezes.
- **OffscreenCanvas + `convertToBlob`** — re-encodes RGBA to JPEG / PNG / WebP with a quality slider.
- **Transferable `ArrayBuffer`** — zero-copy handoff of file bytes to the worker.
- **fflate** — bundles a batch of outputs into one ZIP for "Download all" (lazy-loaded only when used).
- **Web Share API** — native share sheet on mobile, hidden where unsupported.
- **Clipboard API (`ClipboardItem`)** — copy a converted image to the clipboard.
- **Service Worker (vite-plugin-pwa)** — caches the app and wasm for offline use after first load.

## security / privacy model

**Protected**
- Your photo's pixels and every byte of the HEIC file — decoded and re-encoded in the tab, never transmitted.
- GPS location, camera serial, timestamps and other EXIF metadata — stripped by re-encoding through the canvas.
- Filenames — never sent anywhere.

**Not protected**
- The initial page + wasm download comes from GitHub Pages' CDN, which sees your IP requesting the site (like visiting any website) — but never your photos.
- Whatever you do with the converted file afterwards (emailing it, uploading it elsewhere) is up to you.

**Trust model**
- The static site bundle served by GitHub Pages, pinned per deploy.
- The TLS connection between you and GitHub Pages.
- The libheif WebAssembly shipped inside the bundle — no third-party runtime CDN.

Want to be certain? Turn off Wi-Fi after the page loads — unHEIC keeps converting.

## stack

- Vite 6 + vanilla TypeScript
- `libheif-js` (decode), `fflate` (ZIP batch download)
- `vite-plugin-pwa` for the offline service worker
- Vitest for unit tests
- GitHub Pages for hosting, deployed via GitHub Actions

No runtime dependencies beyond libheif-js and fflate. No cookies, no fingerprinting, no third-party fonts. Anonymous, cookie-less page-view counts via Cloudflare Web Analytics — no personal data, no cross-site tracking.

## local development

```bash
npm install
npm run dev      # vite dev server on :5173
npm test         # run vitest suite
npm run build    # produce dist/ for deploy
npm run preview  # serve dist/ locally
```

## deploying

A push to `main` triggers `.github/workflows/deploy.yml`, which runs tests, builds, and deploys `dist/` to GitHub Pages. The custom domain is set via `public/CNAME` — point a `CNAME` DNS record for `unheic.benrichardson.dev` at `ben-gy.github.io`.

## license

MIT — see [LICENSE](./LICENSE).
