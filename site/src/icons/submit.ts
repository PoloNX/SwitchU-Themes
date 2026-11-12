import { authHeaders } from '../github/auth';
import { buildIconPackMosaicPng } from './mosaic';
import type { PackGlyphFile } from './pack';

export interface IconPackSubmitResult {
  pullRequestUrl: string;
  branchName: string;
}

export interface OpenIconPackSummary {
  kind: 'icon';
  number: number;
  title: string;
  pullRequestUrl: string;
  branchName: string;
  packId: string;
  name: string;
  author: string;
  version: string;
  colour: boolean;
  contributor: string;
  createdAt: string;
  updatedAt: string;
  coverUrl: string;
  glyphUrls: Array<{ fileName: string; url: string }>;
}

interface OpenIconPacksResponse {
  packs: OpenIconPackSummary[];
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

export async function loadOpenIconPacks(): Promise<OpenIconPackSummary[]> {
  const response = await fetch(`${iconPackProxyBaseUrl()}/api/icon-packs`, { cache: 'no-store' });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Failed to load open icon packs (${response.status})`);
  }

  const payload = await response.json() as OpenIconPacksResponse;
  return Array.isArray(payload.packs) ? payload.packs : [];
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
    headers: authHeaders(),
    body: formData,
  });

  if (!response.ok) {
    const text = await response.text();
    let message = text || `Icon pack submission failed with status ${response.status}`;
    try {
      const parsed = JSON.parse(text) as { error?: string };
      if (parsed.error) {
        message = parsed.error;
      }
    } catch {
      // keep raw text
    }
    throw new Error(message);
  }

  return response.json() as Promise<IconPackSubmitResult>;
}
