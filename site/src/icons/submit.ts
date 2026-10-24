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

export async function submitIconPack(
  packId: string,
  name: string,
  author: string,
  glyphs: PackGlyphFile[],
): Promise<IconPackSubmitResult> {
  const formData = new FormData();
  formData.set('id', packId);
  formData.set('name', name.trim());
  formData.set('author', author.trim());
  formData.set('glyphFiles', JSON.stringify(glyphs.map((glyph) => glyph.fileName)));

  for (const glyph of glyphs) {
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
