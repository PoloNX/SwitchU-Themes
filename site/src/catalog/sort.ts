export type CatalogSortMode = 'name' | 'newest';

export interface CatalogSortable {
  id: string;
  name: string;
  addedAt?: string;
  updatedAt?: string;
}

function stampMs(entry: CatalogSortable): number {
  const raw = entry.updatedAt || entry.addedAt || '';
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Client-side catalog ordering. Index.json stays A-Z for stable diffs. */
export function compareCatalogEntries(
  left: CatalogSortable,
  right: CatalogSortable,
  mode: CatalogSortMode,
): number {
  if (mode === 'newest') {
    const delta = stampMs(right) - stampMs(left);
    if (delta !== 0) {
      return delta;
    }
  }
  const byName = left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
  if (byName !== 0) {
    return byName;
  }
  return left.id.localeCompare(right.id);
}
