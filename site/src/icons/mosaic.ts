import { SIDEBAR_GLYPHS, type PackGlyphFile } from './pack';

/** Catalog / console cover size used by existing packs (3×2 of 128px cells). */
export const MOSAIC_CELL = 128;
export const MOSAIC_COLS = 3;
export const MOSAIC_ROWS = 2;
export const MOSAIC_PAD = 12;
export const MOSAIC_WIDTH = MOSAIC_CELL * MOSAIC_COLS;
export const MOSAIC_HEIGHT = MOSAIC_CELL * MOSAIC_ROWS;

const MOSAIC_BG = '#101820';

function loadImage(source: Blob | string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = typeof source === 'string' ? source : URL.createObjectURL(source);
    image.onload = () => {
      if (typeof source !== 'string') {
        URL.revokeObjectURL(url);
      }
      resolve(image);
    };
    image.onerror = () => {
      if (typeof source !== 'string') {
        URL.revokeObjectURL(url);
      }
      reject(new Error('Failed to decode a glyph for the mosaic preview.'));
    };
    image.src = url;
  });
}

/**
 * Build a 384×256 PNG mosaic of the six sidebar glyphs (same layout as
 * default / atmos catalog covers). Missing slots stay empty on the plate.
 */
export async function buildIconPackMosaicPng(
  glyphs: PackGlyphFile[],
): Promise<File> {
  const byName = new Map(glyphs.map((glyph) => [glyph.fileName, glyph.file]));
  const canvas = document.createElement('canvas');
  canvas.width = MOSAIC_WIDTH;
  canvas.height = MOSAIC_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas is not available to build the icon mosaic.');
  }

  ctx.fillStyle = MOSAIC_BG;
  ctx.fillRect(0, 0, MOSAIC_WIDTH, MOSAIC_HEIGHT);

  const box = MOSAIC_CELL - MOSAIC_PAD * 2;
  for (let index = 0; index < SIDEBAR_GLYPHS.length; index += 1) {
    const file = byName.get(SIDEBAR_GLYPHS[index].file);
    if (!file) {
      continue;
    }

    const image = await loadImage(file);
    const scale = Math.min(box / image.width, box / image.height);
    const drawW = Math.max(1, Math.round(image.width * scale));
    const drawH = Math.max(1, Math.round(image.height * scale));
    const col = index % MOSAIC_COLS;
    const row = Math.floor(index / MOSAIC_COLS);
    const x = col * MOSAIC_CELL + Math.floor((MOSAIC_CELL - drawW) / 2);
    const y = row * MOSAIC_CELL + Math.floor((MOSAIC_CELL - drawH) / 2);
    ctx.drawImage(image, x, y, drawW, drawH);
  }

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (value) => (value ? resolve(value) : reject(new Error('Failed to encode mosaic PNG.'))),
      'image/png',
    );
  });

  return new File([blob], 'preview.png', { type: 'image/png' });
}
