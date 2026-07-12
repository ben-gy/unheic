# Tool Plan: unHEIC

## Overview
- **Name:** unHEIC
- **Repo name:** unheic
- **Tagline:** Convert iPhone HEIC & HEIF photos to JPG, PNG or WebP right in your browser — nothing is uploaded.

## Problem It Solves
Someone shot photos on an iPhone. The files are `.HEIC`. They try to email them, attach
them to a web form, upload them to a print shop, or open them on a Windows PC — and nothing
accepts HEIC. They Google "convert HEIC to JPG" and land on a pile of sites that make them
upload their personal photos to a stranger's server, watermark the output, or cap the batch
at two files unless they pay. These are family photos, screenshots of documents, receipts —
the last thing they want to hand to an anonymous conversion farm. unHEIC decodes HEIC/HEIF
entirely in the browser with the same libheif engine those servers use, and gives back clean
JPG / PNG / WebP with zero uploads.

## Why This Must Be Client-Side
- **Privacy** — the input is personal photos (faces, locations, documents). They must never
  leave the device. Every rival "free HEIC converter" uploads them.
- **No-account friction** — no sign-up, no email, no "you've used your 2 free conversions".
- **Large-file / batch handling** — a camera roll dump can be dozens of 3–5 MB HEICs;
  round-tripping them through an upload/convert/download server is slow and flaky. Local
  WASM decode is faster and works on a plane.
- **Offline** — once the page (and its wasm) is cached by the service worker, it converts
  with the network off.

## Browser APIs / Libraries Used
| API / Library | What it does for us | Fallback if unsupported |
|---------------|----------------------|-------------------------|
| libheif-js (WASM) | Decodes HEIC/HEIF to raw RGBA pixels | Hard requirement — surfaced as an error if wasm can't init |
| Web Workers (module) | Runs decode + encode off the main thread so the UI never freezes | N/A — worker support is universal in target browsers |
| OffscreenCanvas + convertToBlob | Re-encodes RGBA to JPEG / PNG / WebP with a quality slider | Falls back to a main-thread `<canvas>` if OffscreenCanvas is missing |
| Transferable ArrayBuffer | Zero-copy handoff of pixel buffers between worker and main thread | N/A |
| fflate | Bundles a batch of outputs into one ZIP for "Download all" | Per-file downloads still work without it |
| File System Access / `<a download>` | Saves results | `<a download>` fallback everywhere |
| Web Share API | Share a converted image on mobile | Hidden when unsupported |
| Clipboard API (ClipboardItem) | Copy a single result to the clipboard | Hidden when unsupported |
| Service Worker (PWA) | Offline capability after first load | Tool still works online without it |

## Workflow (input → process → output)
1. User drops / picks / pastes one or many `.heic` / `.heif` files (whole camera-roll batches OK).
2. A dedicated worker decodes each with libheif to RGBA, applies EXIF orientation, then
   re-encodes to the chosen format (JPEG default, PNG, or WebP) at the chosen quality.
   Determinate progress: per-file + overall, with a MB/s throughput readout.
3. User gets a gallery of thumbnails with before/after sizes; downloads each, copies to
   clipboard, shares (mobile), or grabs the whole batch as a ZIP.

## Non-Goals
- No editing (crop, filter, resize) — this run is a pure converter.
- No re-encoding *to* HEIC (browsers can't reliably encode HEIC; and the point is escaping it).
- No cloud sync, accounts, or history persistence ever.
- No RAW / DNG / TIFF decode this run (HEIC/HEIF only).

## Target Audience
A non-technical iPhone owner on a laptop, mildly annoyed that "the website won't take my
photos", who just wants JPGs and is wary of uploading pictures of their kids to a random
converter. Reassurance and simplicity matter more than knobs.

## Style Direction
**Tone:** friendly, calm, trustworthy.
**Colour palette:** warm off-white paper background, deep ink text, a single confident
indigo/violet accent with a soft coral highlight. Feels like a friendly consumer utility,
not a hacker terminal.
**UI density:** spacious.
**Dark/light theme:** light (consumer audience), with a `prefers-color-scheme` dark variant
for comfort.
**Reference tools for feel:** Squoosh (clarity of before/after), Apple Photos (warmth).

## Technical Architecture
- **Stack:** Vanilla TypeScript + Vite. No React — a drop zone, a gallery, and a few modals
  do not need a component framework.
- **Key libraries:** `libheif-js` (decode), `fflate` (ZIP batch download).
- **Worker strategy:** single dedicated module worker processing the queue sequentially
  (HEIC decode is memory-heavy; sequential avoids OOM on big batches), streaming per-file
  progress back via postMessage.
- **Storage:** none for user data. `localStorage` only for last-used format/quality settings.

## Privacy & Trust Model
**Protected**
- Photo pixels and every byte of the HEIC file — decoded and re-encoded in your tab, never sent anywhere.
- EXIF/GPS metadata — re-encoding through canvas drops all of it by default; the only thing
  we deliberately carry over is orientation (so photos aren't sideways).
- Filenames — never transmitted.

**Not protected**
- The initial page + wasm load is fetched from GitHub Pages' CDN (standard static hosting;
  it sees your IP requesting the page, like any website — but not your photos).
- Anything you then do with the output file yourself (emailing it, uploading it elsewhere).

**Trust surface**
- The static site bundle served by GitHub Pages (hash-pinned per deploy).
- The TLS chain between you and GitHub Pages.
- The libheif-js WASM binary shipped inside the bundle (no third-party runtime CDN).

## UX Required Surfaces
- Big drop zone (drag-drop, tap-to-pick, Cmd/Ctrl+V paste of image files).
- Determinate per-file + overall progress with throughput.
- Event log drawer (Dropwell pattern) streaming decode/encode transitions.
- Format toggle (JPG / PNG / WebP) + quality slider (for lossy formats).
- How-It-Works modal (illustrated steps).
- Threat Model modal (protected / not / trust).
- About modal with benrichardson.dev attribution + source link.
- Output delivery: per-file download, copy-to-clipboard, Web Share (mobile), "Download all (ZIP)".
- Keyboard shortcuts: Escape closes modals, Cmd/Ctrl+V pastes.
- Sticky footer "Built by benrichardson.dev".
