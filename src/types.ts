/** Shared types for the worker RPC contract and conversion results. */

import type { OutputFormat } from './heic';

/** Message posted from the main thread into the decode/encode worker. */
export interface ConvertRequest {
  type: 'convert';
  id: number;
  name: string;
  format: OutputFormat;
  quality: number;
  /** Raw HEIC/HEIF bytes. Transferred (zero-copy) to the worker. */
  buffer: ArrayBuffer;
}

export type WorkerPhase = 'decode' | 'encode';

/** Messages posted from the worker back to the main thread. */
export type WorkerMessage =
  | { type: 'ready' }
  | { type: 'progress'; id: number; phase: WorkerPhase }
  | {
      type: 'done';
      id: number;
      blob: Blob;
      width: number;
      height: number;
      outName: string;
    }
  | { type: 'error'; id: number; message: string };

/** A finished (or failed) conversion, as tracked by the UI. */
export interface ConversionItem {
  id: number;
  name: string;
  inputSize: number;
  status: 'queued' | 'decoding' | 'encoding' | 'done' | 'error';
  outName?: string;
  outputSize?: number;
  width?: number;
  height?: number;
  blob?: Blob;
  previewUrl?: string;
  error?: string;
}
