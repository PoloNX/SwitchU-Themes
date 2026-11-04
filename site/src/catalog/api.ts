import { PACK_GLYPHS } from '../icons/pack';
import { createUploadAsset, type StudioAsset } from '../theme/draft';
import type {
  IconCatalogEntry,
  IconPackManifest,
  IconPackRecord,
  ThemeCatalog,
  ThemeCatalogEntry,
  ThemeCatalogRecord,
  ThemeManifest,
} from '../theme/schema';

export function catalogBaseUrl(): string {
  return `${import.meta.env.BASE_URL}catalog/`;
}

export function buildCatalogUrl(path: string): string {
  return new URL(path, new URL(catalogBaseUrl(), window.location.href)).toString();
}

export function themeRootFromManifestPath(manifestPath: string): string {
  const parts = manifestPath.split('/');
  parts.pop();
  return parts.join('/');
}

export function resolveThemeAssetUrl(record: ThemeCatalogRecord, relativePath: string): string {
  const themeRoot = themeRootFromManifestPath(record.entry.manifest);
  return buildCatalogUrl(`${themeRoot}/${relativePath}`);
}

function resolveCoverUrl(entry: ThemeCatalogEntry, manifest: ThemeManifest): string | undefined {
  if (entry.cover) {
    return buildCatalogUrl(entry.cover);
  }

  const firstScreenshot = manifest.preview?.screenshots?.[0];
  if (!firstScreenshot) {
    return undefined;
  }

  const themeRoot = themeRootFromManifestPath(entry.manifest);
  return buildCatalogUrl(`${themeRoot}/${firstScreenshot}`);
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Failed to load ${url}: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export async function loadThemeCatalog(): Promise<ThemeCatalogRecord[]> {
  const catalog = await fetchJson<ThemeCatalog>(buildCatalogUrl('index.json'));

  const records = await Promise.all(
    catalog.themes.map(async (entry) => {
      const manifestUrl = buildCatalogUrl(entry.manifest);
      const manifest = await fetchJson<ThemeManifest>(manifestUrl);
      // Prefer theme.json for title/version so studio cards match the package
      // even when a cached index.json lags a rename.
      const resolvedEntry: ThemeCatalogEntry = {
        ...entry,
        name: (manifest.name && manifest.name.trim()) || entry.name,
        version: (manifest.version && String(manifest.version).trim()) || entry.version,
        author: (manifest.author && manifest.author.trim()) || entry.author,
      };

      return {
        entry: resolvedEntry,
        manifest,
        manifestUrl,
        coverUrl: resolveCoverUrl(resolvedEntry, manifest),
      } satisfies ThemeCatalogRecord;
    }),
  );

  return records;
}


export async function loadIconCatalog(): Promise<IconPackRecord[]> {
  const catalog = await fetchJson<ThemeCatalog>(buildCatalogUrl('index.json'));
  const entries = catalog.icons ?? [];

  return Promise.all(
    entries.map(async (entry) => {
      const manifestUrl = buildCatalogUrl(entry.manifest);
      let manifest: IconPackManifest = { id: entry.id, name: entry.name };
      try {
        manifest = await fetchJson<IconPackManifest>(manifestUrl);
      } catch {
        // A pack without a readable manifest still lists; the cover falls back
        // to the icon convention below.
      }

      // Prefer pack.json for title/author/version/theme so cards stay current
      // even when a cached index.json lags a rename.
      const resolvedEntry: IconCatalogEntry = {
        ...entry,
        name: (manifest.name && manifest.name.trim()) || entry.name,
        author: (manifest.author && manifest.author.trim()) || entry.author,
        version: (manifest.version && String(manifest.version).trim()) || entry.version,
        description: (manifest.description && manifest.description.trim()) || entry.description,
        colour: manifest.colour ?? entry.colour,
        builtin: manifest.builtin ?? entry.builtin,
        theme: (manifest.theme && manifest.theme.trim()) || entry.theme,
      };

      const coverPath = resolvedEntry.cover ?? (manifest.preview ? `${resolvedEntry.path}/${manifest.preview}` : undefined);
      return {
        entry: resolvedEntry,
        manifest,
        manifestUrl,
        coverUrl: coverPath ? buildCatalogUrl(coverPath) : undefined,
      } satisfies IconPackRecord;
    }),
  );
}

function isPngBytes(bytes: ArrayBuffer): boolean {
  if (bytes.byteLength < 8) {
    return false;
  }
  const header = new Uint8Array(bytes, 0, 8);
  return header[0] === 0x89
    && header[1] === 0x50
    && header[2] === 0x4e
    && header[3] === 0x47
    && header[4] === 0x0d
    && header[5] === 0x0a
    && header[6] === 0x1a
    && header[7] === 0x0a;
}

/** Download an Icon Shop pack's PNGs as proposal-ready theme assets (Atmosphere-style light bundle). */
export async function loadIconPackGlyphAssets(record: IconPackRecord): Promise<StudioAsset[]> {
  const listedGlyphs = (record.manifest.glyphs ?? [])
    .filter((glyph): glyph is string => typeof glyph === 'string' && glyph.toLowerCase().endsWith('.png'))
    .map((glyph) => glyph.replace(/^.*\//, ''));

  // Prefer the pack's declared glyph list so partial packs don't probe missing
  // files (Vite can 200 HTML for misses → broken <img>). Fall back to probing
  // the standard set only when the manifest doesn't list glyphs.
  const fileNames = new Set<string>(
    listedGlyphs.length > 0 ? listedGlyphs : PACK_GLYPHS.map((glyph) => glyph.file),
  );
  if (record.manifest.preview) {
    fileNames.add(record.manifest.preview.replace(/^.*\//, ''));
  }

  const assets: StudioAsset[] = [];
  await Promise.all(
    Array.from(fileNames).map(async (fileName) => {
      const url = buildCatalogUrl(`${record.entry.path}/${fileName}`);
      try {
        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) {
          return;
        }
        const bytes = await response.arrayBuffer();
        const contentType = (response.headers.get('content-type') ?? '').toLowerCase();
        // Skip SPA HTML / non-image responses for missing pack slots.
        if (!isPngBytes(bytes) && !contentType.includes('image/png') && !contentType.includes('image/')) {
          return;
        }
        if (!isPngBytes(bytes)) {
          return;
        }
        const file = new File([bytes], fileName, { type: 'image/png' });
        assets.push(createUploadAsset(file, `assets/icons/${fileName}`));
      } catch {
        // Partial packs (e.g. iisu) omit some glyphs — skip missing files.
      }
    }),
  );

  assets.sort((left, right) => left.name.localeCompare(right.name));
  return assets;
}
