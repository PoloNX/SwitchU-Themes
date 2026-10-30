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

      const coverPath = entry.cover ?? (manifest.preview ? `${entry.path}/${manifest.preview}` : undefined);
      return {
        entry,
        manifest,
        manifestUrl,
        coverUrl: coverPath ? buildCatalogUrl(coverPath) : undefined,
      } satisfies IconPackRecord;
    }),
  );
}
