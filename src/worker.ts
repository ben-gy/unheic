/**
 * worker.ts — decode HEIC/HEIF with libheif (wasm) and re-encode with the
 * canvas codecs, entirely off the main thread. One request at a time; the
 * main thread serialises the queue so a big batch can't blow up memory.
 */

import libheif from 'libheif-js/wasm-bundle';
import { FORMATS } from './heic';
import type { ConvertRequest, WorkerMessage } from './types';

const post = (msg: WorkerMessage, transfer?: Transferable[]) =>
  (self as unknown as Worker).postMessage(msg, transfer ?? []);

// A single decoder instance is reused for the worker's lifetime.
let decoder: InstanceType<typeof import('libheif-js/wasm-bundle').default.HeifDecoder> | null = null;

function getDecoder() {
  if (!decoder) decoder = new libheif.HeifDecoder();
  return decoder;
}

/** Composite any translucent pixels over white so JPEG (no alpha) looks right. */
function flattenOntoWhite(data: Uint8ClampedArray): void {
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a === 255) continue;
    const inv = 255 - a;
    // src-over onto opaque white background
    data[i] = (data[i] * a + 255 * inv) / 255;
    data[i + 1] = (data[i + 1] * a + 255 * inv) / 255;
    data[i + 2] = (data[i + 2] * a + 255 * inv) / 255;
    data[i + 3] = 255;
  }
}

async function handleConvert(req: ConvertRequest): Promise<void> {
  const { id, name, format, quality, buffer } = req;
  const spec = FORMATS[format];

  post({ type: 'progress', id, phase: 'decode' });

  const images = getDecoder().decode(new Uint8Array(buffer));
  if (!images || images.length === 0) {
    throw new Error('No image found inside the file.');
  }
  const image = images[0];
  const width = image.get_width();
  const height = image.get_height();
  if (!width || !height) throw new Error('Decoded image has no dimensions.');

  const target = { data: new Uint8ClampedArray(width * height * 4), width, height };
  await new Promise<void>((resolve, reject) => {
    image.display(target, (result) => {
      if (!result) reject(new Error('HEIF decode failed (unsupported or corrupt file).'));
      else resolve();
    });
  });
  image.free?.();

  post({ type: 'progress', id, phase: 'encode' });

  if (format === 'jpeg') flattenOntoWhite(target.data);

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not create a drawing context.');
  ctx.putImageData(new ImageData(target.data, width, height), 0, 0);

  const blob = await canvas.convertToBlob({
    type: spec.mime,
    quality: spec.lossy ? quality : undefined,
  });
  if (!blob || blob.size === 0) throw new Error(`Encoding to ${spec.label} produced no data.`);

  post({ type: 'done', id, blob, width, height, outName: name });
}

self.addEventListener('message', (ev: MessageEvent<ConvertRequest>) => {
  const req = ev.data;
  if (req?.type !== 'convert') return;
  handleConvert(req).catch((err: unknown) => {
    post({
      type: 'error',
      id: req.id,
      message: err instanceof Error ? err.message : 'Unknown conversion error.',
    });
  });
});

post({ type: 'ready' });
