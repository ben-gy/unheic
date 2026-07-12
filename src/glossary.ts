/**
 * glossary.ts — jargon → plain-English definitions plus a tiny click-to-define
 * tooltip. Any element with `data-term` becomes a definable term.
 */

export const GLOSSARY: Record<string, string> = {
  heic: 'High Efficiency Image Container — the format iPhones use to save photos. It stores the same picture in about half the space of a JPG, but many websites and apps can\'t open it.',
  heif: 'High Efficiency Image Format — the broader standard that HEIC is a flavour of. Same idea, same decoder.',
  jpg: 'The universal photo format. Slightly larger files than HEIC, but every website, printer and app accepts it.',
  webp: 'A modern web image format with excellent compression. Great for uploading to websites; not every desktop app opens it yet.',
  png: 'A lossless image format — every pixel is preserved exactly, at the cost of a larger file. Best for screenshots and graphics with sharp edges.',
  wasm: 'WebAssembly — a way to run fast, compiled code (here, the same libheif engine that servers use) directly and securely inside your browser tab.',
  libheif: 'The open-source library that actually reads HEIC files. unHEIC runs it locally as WebAssembly, so your photos are decoded on your own device.',
  'web-worker': 'A background thread in your browser. The heavy decoding runs here so the page never freezes while it works.',
  metadata: 'Hidden data tucked inside a photo — GPS location, camera model, date and time. Re-encoding through the canvas strips it out; only the rotation is carried over.',
  quality: 'How much detail the lossy encoder keeps. Higher looks better but makes a bigger file; lower saves space. It has no effect on PNG, which is always lossless.',
};

let tooltip: HTMLElement | null = null;

export function initGlossary(): void {
  document.addEventListener('click', (ev) => {
    const target = ev.target as HTMLElement;
    const link = target.closest<HTMLElement>('.glossary-link');
    if (link) {
      ev.preventDefault();
      const term = link.dataset.term ?? '';
      showTooltip(link, GLOSSARY[term] ?? 'No definition available.');
    } else if (!target.closest('.glossary-tip')) {
      hideTooltip();
    }
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') hideTooltip();
  });
}

function showTooltip(anchor: HTMLElement, text: string): void {
  hideTooltip();
  tooltip = document.createElement('div');
  tooltip.className = 'glossary-tip';
  tooltip.setAttribute('role', 'tooltip');
  tooltip.textContent = text;
  document.body.appendChild(tooltip);

  const r = anchor.getBoundingClientRect();
  const tipR = tooltip.getBoundingClientRect();
  let left = r.left + window.scrollX;
  left = Math.min(left, window.scrollX + window.innerWidth - tipR.width - 12);
  left = Math.max(left, window.scrollX + 12);
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${r.bottom + window.scrollY + 8}px`;
}

function hideTooltip(): void {
  tooltip?.remove();
  tooltip = null;
}

/** Wrap a term in a glossary link span. */
export function term(label: string, key: string): string {
  return `<span class="glossary-link" data-term="${key}" role="button" tabindex="0">${label}</span>`;
}
