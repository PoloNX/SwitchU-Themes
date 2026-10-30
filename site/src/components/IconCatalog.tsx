import { Download, LoaderCircle, RefreshCw, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { loadIconCatalog } from '../catalog/api';
import { downloadIconPackArchive } from '../catalog/download';
import type { IconPackRecord } from '../theme/schema';

function packId(record: IconPackRecord): string {
  return record.entry.path.split('/').filter(Boolean).pop() ?? record.entry.id;
}

/// Online icon packs published in the catalog (`icons/`). Same flow as themes:
/// the catalog lists them, the site downloads them, the console installs them
/// under sdmc:/switch/SwitchU/icons/<id>/.
export function IconCatalog() {
  const [records, setRecords] = useState<IconPackRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState<string | null>(null);

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
    <section className="panel">
      <div className="panel__header">
        <div>
          <p className="panel__eyebrow">Online shop</p>
          <h2>Icon packs</h2>
        </div>
        <button className="ghost-button" type="button" onClick={() => { void refresh(); }} disabled={loading}>
          <RefreshCw size={16} />
          <span>{loading ? 'Refreshing…' : 'Refresh'}</span>
        </button>
      </div>

      <p className="panel__note">
        Packs listed here are installable straight from the console
        (Theme Library → Icons). Downloading gives you the same folder to drop into
        <code> sdmc:/switch/SwitchU/icons/</code> manually.
      </p>

      {loading ? (
        <div className="loading-state">
          <LoaderCircle className="loading-state__spinner" size={24} />
          <span>Loading icon packs…</span>
        </div>
      ) : null}

      {error ? <div className="submit-feedback submit-feedback--error">{error}</div> : null}

      {!loading && !error ? (
        records.length ? (
          <div className="theme-grid">
            {records.map((record) => {
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
                        {record.manifest.theme ? <span>theme: {record.manifest.theme}</span> : null}
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
          <div className="empty-state">No icon packs published yet.</div>
        )
      ) : null}
    </section>
  );
}
