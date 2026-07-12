/**
 * heic.ts — pure, dependency-free helpers for HEIC/HEIF handling.
 *
 * Everything here is synchronous and side-effect-free so it can be unit tested
 * without a DOM or the wasm decoder: input sniffing, the output-format
 * registry, filename derivation, and byte formatting.
 */

export type OutputFormat = 'jpeg' | 'png' | 'webp';

export interface FormatSpec {
  /** Canvas / MIME type used for `convertToBlob`. */
  mime: string;
  /** File extension (no dot) applied to the output filename. */
  ext: string;
  /** Whether the format honours a 0–1 quality parameter. */
  lossy: boolean;
  /** Short label shown in the UI. */
  label: string;
}

export const FORMATS: Record<OutputFormat, FormatSpec> = {
  jpeg: { mime: 'image/jpeg', ext: 'jpg', lossy: true, label: 'JPG' },
  png: { mime: 'image/png', ext: 'png', lossy: false, label: 'PNG' },
  webp: { mime: 'image/webp', ext: 'webp', lossy: true, label: 'WebP' },
};

export const DEFAULT_FORMAT: OutputFormat = 'jpeg';
export const DEFAULT_QUALITY = 0.82;

export function isOutputFormat(v: string): v is OutputFormat {
  return v === 'jpeg' || v === 'png' || v === 'webp';
}

/** Detected container kind. `null` = not a HEIF-family image we can decode. */
export type ImageKind = 'heic' | 'heif' | 'avif';

const HEIC_BRANDS = new Set(['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'heithevm']);
const HEIF_BRANDS = new Set(['mif1', 'msf1', 'miaf', 'heif']);
const AVIF_BRANDS = new Set(['avif', 'avis']);

function readBrand(bytes: Uint8Array, offset: number): string {
  if (offset + 4 > bytes.length) return '';
  let s = '';
  for (let i = 0; i < 4; i++) s += String.fromCharCode(bytes[offset + i]);
  return s;
}

function classifyBrand(brand: string): ImageKind | null {
  const b = brand.replace(/\0+$/, '').trim().toLowerCase();
  if (HEIC_BRANDS.has(b)) return 'heic';
  if (AVIF_BRANDS.has(b)) return 'avif';
  if (HEIF_BRANDS.has(b)) return 'heif';
  return null;
}

/**
 * Sniff an ISOBMFF `ftyp` box to decide whether this is a HEIC/HEIF/AVIF file
 * we can decode. Reads the major brand plus every compatible brand listed in
 * the box. Returns the most specific kind, or `null` if it isn't a file we handle.
 */
export function sniffImageKind(input: ArrayBuffer | Uint8Array): ImageKind | null {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length < 12) return null;
  // Box: [4 bytes size][4 bytes 'ftyp'][4 bytes major brand][4 bytes minor version][compatible brands...]
  if (readBrand(bytes, 4) !== 'ftyp') return null;

  const boxSize = (bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3];
  // Guard against absurd/short sizes; cap scan to what we actually have.
  const limit = Math.min(bytes.length, boxSize > 0 ? boxSize : bytes.length);

  const major = classifyBrand(readBrand(bytes, 8));
  const kinds = new Set<ImageKind>();
  if (major) kinds.add(major);

  for (let off = 16; off + 4 <= limit; off += 4) {
    const k = classifyBrand(readBrand(bytes, off));
    if (k) kinds.add(k);
  }

  if (kinds.size === 0) return null;
  // Prefer the most specific/expected label for messaging.
  if (kinds.has('heic')) return 'heic';
  if (kinds.has('avif')) return 'avif';
  return 'heif';
}

const STRIPPABLE_EXT = /\.(heic|heif|hif|avif)$/i;

/**
 * Derive an output filename: swap a HEIC/HEIF extension for the target
 * extension, or append it when there's nothing to strip.
 *
 *   toOutputName('IMG_0001.HEIC', 'jpg') -> 'IMG_0001.jpg'
 *   toOutputName('my.photo.heic', 'png') -> 'my.photo.png'
 *   toOutputName('scan',          'webp')-> 'scan.webp'
 */
export function toOutputName(inputName: string, ext: string): string {
  const trimmed = (inputName || 'image').trim() || 'image';
  const base = STRIPPABLE_EXT.test(trimmed) ? trimmed.replace(STRIPPABLE_EXT, '') : trimmed;
  return `${base}.${ext}`;
}

/** Human-readable byte size. */
export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '—';
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB'];
  let val = n / 1024;
  let i = 0;
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024;
    i++;
  }
  return `${val < 10 ? val.toFixed(1) : Math.round(val)} ${units[i]}`;
}

/** Signed percentage change from `before` to `after` (negative = smaller). */
export function sizeDeltaPct(before: number, after: number): number {
  if (before <= 0) return 0;
  return Math.round(((after - before) / before) * 100);
}
