import { describe, expect, it } from 'vitest';
import {
  FORMATS,
  formatBytes,
  isOutputFormat,
  sizeDeltaPct,
  sniffImageKind,
  toOutputName,
} from '../src/heic';

/** Build a minimal ISOBMFF `ftyp` box: [size][ftyp][major][minor][...compat]. */
function buildFtyp(major: string, compatible: string[] = []): Uint8Array {
  const brands = [major, '\0\0\0\0', ...compatible];
  const total = 8 + brands.length * 4; // size + 'ftyp' + brands
  const bytes = new Uint8Array(total);
  // box size (big-endian)
  bytes[0] = (total >>> 24) & 0xff;
  bytes[1] = (total >>> 16) & 0xff;
  bytes[2] = (total >>> 8) & 0xff;
  bytes[3] = total & 0xff;
  const write = (s: string, at: number) => {
    for (let i = 0; i < 4; i++) bytes[at + i] = s.charCodeAt(i) || 0;
  };
  write('ftyp', 4);
  brands.forEach((b, i) => write(b, 8 + i * 4));
  return bytes;
}

describe('sniffImageKind', () => {
  it('detects a real HEIC major brand', () => {
    expect(sniffImageKind(buildFtyp('heic'))).toBe('heic');
  });

  it('prefers heic when listed as a compatible brand of a mif1 file', () => {
    // iPhones write major 'heic' but the generic 'mif1' container also occurs.
    expect(sniffImageKind(buildFtyp('mif1', ['heic', 'mif1']))).toBe('heic');
  });

  it('falls back to heif when only generic HEIF brands are present', () => {
    expect(sniffImageKind(buildFtyp('mif1', ['msf1']))).toBe('heif');
  });

  it('detects AVIF', () => {
    expect(sniffImageKind(buildFtyp('avif'))).toBe('avif');
  });

  it('returns null for a non-ftyp buffer', () => {
    const notFtyp = new Uint8Array([0, 0, 0, 12, 0x6d, 0x6f, 0x6f, 0x76, 1, 2, 3, 4]);
    expect(sniffImageKind(notFtyp)).toBeNull();
  });

  it('returns null for a buffer that is too short', () => {
    expect(sniffImageKind(new Uint8Array([0, 0, 0, 8]))).toBeNull();
  });

  it('returns null when no known brand is present', () => {
    expect(sniffImageKind(buildFtyp('jpeg', ['abcd']))).toBeNull();
  });

  it('accepts an ArrayBuffer as well as a Uint8Array', () => {
    const u8 = buildFtyp('heic');
    const ab = new ArrayBuffer(u8.byteLength);
    new Uint8Array(ab).set(u8);
    expect(sniffImageKind(ab)).toBe('heic');
  });
});

describe('toOutputName', () => {
  it('swaps a HEIC extension for the target extension', () => {
    expect(toOutputName('IMG_0001.HEIC', 'jpg')).toBe('IMG_0001.jpg');
  });

  it('only strips the final HEIC-family extension', () => {
    expect(toOutputName('my.photo.heic', 'png')).toBe('my.photo.png');
  });

  it('appends when there is nothing to strip', () => {
    expect(toOutputName('scan', 'webp')).toBe('scan.webp');
  });

  it('handles .heif and .hif and .avif extensions', () => {
    expect(toOutputName('a.heif', 'jpg')).toBe('a.jpg');
    expect(toOutputName('b.HIF', 'jpg')).toBe('b.jpg');
    expect(toOutputName('c.avif', 'jpg')).toBe('c.jpg');
  });

  it('falls back to a placeholder for an empty name', () => {
    expect(toOutputName('', 'jpg')).toBe('image.jpg');
    expect(toOutputName('   ', 'png')).toBe('image.png');
  });
});

describe('formatBytes', () => {
  it('formats bytes below 1KB', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
  });

  it('formats kilobytes with one decimal under 10', () => {
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
  });

  it('rounds larger values', () => {
    expect(formatBytes(1024 * 1024 * 5)).toBe('5.0 MB');
    expect(formatBytes(1024 * 1024 * 25)).toBe('25 MB');
  });

  it('returns an em dash for invalid input', () => {
    expect(formatBytes(-1)).toBe('—');
    expect(formatBytes(NaN)).toBe('—');
  });
});

describe('sizeDeltaPct', () => {
  it('is negative when the output is smaller', () => {
    expect(sizeDeltaPct(1000, 500)).toBe(-50);
  });

  it('is positive when the output is larger', () => {
    expect(sizeDeltaPct(1000, 1500)).toBe(50);
  });

  it('is zero for equal sizes', () => {
    expect(sizeDeltaPct(1000, 1000)).toBe(0);
  });

  it('guards against a zero baseline', () => {
    expect(sizeDeltaPct(0, 100)).toBe(0);
  });
});

describe('isOutputFormat', () => {
  it('accepts the three supported formats', () => {
    expect(isOutputFormat('jpeg')).toBe(true);
    expect(isOutputFormat('png')).toBe(true);
    expect(isOutputFormat('webp')).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isOutputFormat('gif')).toBe(false);
    expect(isOutputFormat('')).toBe(false);
    expect(isOutputFormat('JPEG')).toBe(false);
  });
});

describe('FORMATS registry', () => {
  it('marks jpeg and webp lossy but png lossless', () => {
    expect(FORMATS.jpeg.lossy).toBe(true);
    expect(FORMATS.webp.lossy).toBe(true);
    expect(FORMATS.png.lossy).toBe(false);
  });

  it('maps each format to the correct extension and mime', () => {
    expect(FORMATS.jpeg.ext).toBe('jpg');
    expect(FORMATS.jpeg.mime).toBe('image/jpeg');
    expect(FORMATS.png.ext).toBe('png');
    expect(FORMATS.webp.mime).toBe('image/webp');
  });
});
