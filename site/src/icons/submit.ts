import { buildIconPackMosaicPng } from './mosaic';
import type { PackGlyphFile } from './pack';

export interface IconPackSubmitResult {
  pullRequestUrl: string;
  branchName: string;
}

export function iconPackProxyBaseUrl(): string {
  const apiBase = import.meta.env.VITE_PR_PROXY_URL?.trim();
  if (!apiBase) {
    throw new Error('Missing VITE_PR_PROXY_URL. Configure the PR proxy before submitting an icon pack.');
  }

  return apiBase.replace(/\/$/, '');
}

/** Glyphs plus a generated 3×2 preview.png for the catalog cover. */
export async function withMosaicPreview(glyphs: PackGlyphFile[]): Promise<PackGlyphFile[]> {
  const withoutPreview = glyphs.filter((glyph) => glyph.fileName !== 'preview.png');
  const mosaic = await buildIconPackMosaicPng(withoutPreview);
  return [...withoutPreview, { fileName: 'preview.png', file: mosaic }];
}

export async function submitIconPack(
  packId: string,
  name: string,
  author: string,
  glyphs: PackGlyphFile[],
): Promise<IconPackSubmitResult> {
  const files = await withMosaicPreview(glyphs);
  const formData = new FormData();
  formData.set('id', packId);
  formData.set('name', name.trim());
  formData.set('author', author.trim());
  formData.set('glyphFiles', JSON.stringify(files.map((glyph) => glyph.fileName)));

  for (const glyph of files) {
    formData.set(`glyph:${glyph.fileName}`, glyph.file, glyph.fileName);
  }

  const response = await fetch(`${iconPackProxyBaseUrl()}/api/icon-packs`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Icon pack submission failed with status ${response.status}`);
  }

  return response.json() as Promise<IconPackSubmitResult>;
}
