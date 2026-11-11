import { Download, LoaderCircle, RefreshCw, Search, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { loadIconCatalog } from '../catalog/api';
import { downloadIconPackArchive } from '../catalog/download';
import { compareCatalogEntries, type CatalogSortMode } from '../catalog/sort';
import type { IconPackRecord } from '../theme/schema';

function packId(record: IconPackRecord): string {
  return record.entry.path.split('/').filter(Boolean).pop() ?? record.entry.id;
}

/// Online icon packs published in the catalog (`icons/`). Same flow as themes:
/// the catalog lists them, the site downloads them, the console installs them
/// under sdmc:/switch/SwitchU/icons/<id>/.
export function IconCatalog({ onCreatePack }: { onCreatePack?: () => void } = {}) {
  const [records, setRecords] = useState<IconPackRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [catalogSort, setCatalogSort] = useState<CatalogSortMode>('newest');

  const refresh = useMemo(
    () => async () => {
      setLoading(true);
      setError('');
      try {
        setRecords(await loadIconCatalog());
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Could not load the icon catalog.');
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filteredRecords = useMemo(() => {
    const query = search.trim().toLowerCase();
    const matched = query
      ? records.filter((record) => {
          const haystack = [
            record.entry.id,
            record.entry.name,
            record.entry.author,
            record.entry.description,
            record.entry.theme,
            record.manifest.theme,
          ].filter(Boolean).join(' ').toLowerCase();
          return haystack.includes(query);
        })
      : records.slice();

    matched.sort((left, right) => {
      // A–Z keeps built-ins first; Newest is pure land-on-main date order.
      if (catalogSort === 'name' && left.entry.builtin !== right.entry.builtin) {
        return left.entry.builtin ? -1 : 1;
      }
      return compareCatalogEntries(left.entry, right.entry, catalogSort);
    });
    return matched;
  }, [catalogSort, records, search]);

  const handleDownload = async (record: IconPackRecord) => {
    const id = packId(record);
    setDownloading(id);
    try {
      await downloadIconPackArchive(record);
    } finally {
      setDownloading(null);
    }
  };

  return (
    <>
      <section className="panel panel--spotlight">
        <div className="panel__header">
          <div>
            <p className="panel__eyebrow">Icon catalog</p>
            <h2>Explore and download icon packs</h2>
          </div>
          {onCreatePack ? (
            <button className="ghost-button" type="button" onClick={onCreatePack}>
              Create your own pack
            </button>
          ) : null}
        </div>
        <p className="panel__note panel__note--flush">
          Packs listed here are installable from the console (Theme Library → Icons).
          Download gives you the same folder for <code>sdmc:/switch/SwitchU/icons/</code>.
        </p>
      </section>

      <section className="panel">
      <div className="panel__header">
        <div>
          <p className="panel__eyebrow">Online shop</p>
          <h2>Icon packs</h2>
        </div>
        <div className="catalog-toolbar">
          <div className="catalog-sort" role="group" aria-label="Sort icon packs">
            <button
              className={`catalog-sort__button ${catalogSort === 'name' ? 'catalog-sort__button--active' : ''}`}
              type="button"
              onClick={() => setCatalogSort('name')}
            >
              A–Z
            </button>
            <button
              className={`catalog-sort__button ${catalogSort === 'newest' ? 'catalog-sort__button--active' : ''}`}
              type="button"
              onClick={() => setCatalogSort('newest')}
            >
              Newest
            </button>
          </div>
          <label className="search-field">
            <Search size={16} />
            <input
              value={search}
              onChange={(event) => setSearch(event.currentTarget.value)}
              placeholder="Search pack, author…"
            />
          </label>
          <button className="ghost-button" type="button" onClick={() => { void refresh(); }} disabled={loading}>
            <RefreshCw size={16} />
            <span>{loading ? 'Refreshing…' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="loading-state">
          <LoaderCircle className="loading-state__spinner" size={24} />
          <span>Loading icon packs…</span>
        </div>
      ) : null}

      {error ? <div className="submit-feedback submit-feedback--error">{error}</div> : null}

      {!loading && !error ? (
        filteredRecords.length ? (
          <div className="theme-grid">
            {filteredRecords.map((record) => {
              const id = packId(record);
              const isBusy = downloading === id;
              return (
                <article className="theme-card theme-card--icons" key={record.entry.id}>
                  <div className="theme-card__cover-wrap theme-card__cover-wrap--icons">
                    {record.coverUrl ? (
                      <img
                        className="theme-card__cover theme-card__cover--icons"
                        src={record.coverUrl}
                        alt={`Glyphs of ${record.entry.name}`}
                      />
                    ) : (
                      <div className="theme-card__cover theme-card__cover--empty">
                        <Sparkles size={22} />
                        <span>No preview yet</span>
                      </div>
                    )}
                  </div>
                  <div className="theme-card__body">
                    <div>
                      <p className="theme-card__eyebrow">{id}</p>
                      <h3>{record.entry.name}</h3>
                      <p className="theme-card__meta">
                        by {record.entry.author} · v{record.entry.version}
                      </p>
                      <div className="theme-card__flags">
                        {record.entry.builtin ? <span>built-in</span> : <span>community</span>}
                        {record.manifest.colour === false ? <span>mono</span> : <span>colour</span>}
                        {record.entry.theme || record.manifest.theme ? (
                          <span>theme: {record.entry.theme || record.manifest.theme}</span>
                        ) : null}
                      </div>
                      {record.entry.description ? (
                        <p className="theme-card__meta">{record.entry.description}</p>
                      ) : null}
                    </div>
                    <div className="theme-card__actions">
                      <button
                        className="theme-card__action"
                        type="button"
                        onClick={() => { void handleDownload(record); }}
                        disabled={isBusy}
                        title={`Download ${record.entry.name}`}
                      >
                        {isBusy ? <LoaderCircle className="loading-state__spinner" size={16} /> : <Download size={16} />}
                        <span>{isBusy ? 'Preparing…' : 'Download'}</span>
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="empty-state">
            {records.length ? 'No icon packs match that search.' : 'No icon packs published yet.'}
          </div>
        )
      ) : null}
    </section>
    </>
  );
}
