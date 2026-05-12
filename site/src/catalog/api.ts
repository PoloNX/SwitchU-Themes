import type { ThemeCatalog, ThemeCatalogEntry, ThemeCatalogRecord, ThemeManifest } from '../theme/schema';

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

      return {
        entry,
        manifest,
        manifestUrl,
        coverUrl: resolveCoverUrl(entry, manifest),
      } satisfies ThemeCatalogRecord;
    }),
  );

  return records;
}
