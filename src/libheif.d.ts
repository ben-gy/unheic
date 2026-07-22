// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
/** Minimal typings for the high-level libheif-js decoder surface we use. */
declare module 'libheif-js/wasm-bundle' {
  interface HeifImage {
    get_width(): number;
    get_height(): number;
    /**
     * Fills `target.data` (RGBA) with the decoded pixels, then invokes the
     * callback with the same object — or `null` on a decode error.
     */
    display(
      target: { data: Uint8ClampedArray; width: number; height: number },
      cb: (result: { data: Uint8ClampedArray; width: number; height: number } | null) => void,
    ): void;
    free?(): void;
  }

  class HeifDecoder {
    decode(buffer: Uint8Array | ArrayBuffer): HeifImage[];
  }

  const libheif: { HeifDecoder: typeof HeifDecoder };
  export default libheif;
}
