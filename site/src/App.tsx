import { AudioLines, Download, Eye, ImageIcon, LoaderCircle, Palette, Search, Sparkles, Wand2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { loadThemeCatalog } from './catalog/api';
import { downloadThemeArchive } from './catalog/download';
import { ThemeStudio } from './components/ThemeStudio';
import { SwitchUPreview } from './preview/SwitchUPreview';
import { createEmptyDraft, draftFromCatalogRecord, type StudioDraft } from './theme/draft';
import type { ThemeCatalogRecord } from './theme/schema';

type AppTab = 'explore' | 'create';

function StatChip({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="stat-chip">
      <span className="stat-chip__icon">{icon}</span>
      <span className="stat-chip__label">{label}</span>
      <strong className="stat-chip__value">{value}</strong>
    </div>
  );
}

function ThemeCard({
  record,
  previewed,
  templated,
  downloading,
  onPreview,
  onUseTemplate,
  onDownload,
}: {
  record: ThemeCatalogRecord;
  previewed: boolean;
  templated: boolean;
  downloading: boolean;
  onPreview: () => void;
  onUseTemplate: () => void;
  onDownload: () => void;
}) {
  const background = record.manifest.theme?.background;
  const hasAudio = Boolean(record.manifest.audio?.bundled);
  const hasBackgroundImage = Boolean(background?.image);
  const layout = background?.layout ?? 'floating';

  return (
    <article className={`theme-card ${previewed ? 'theme-card--selected' : ''}`}>
      <div className="theme-card__cover-wrap">
        {record.coverUrl ? (
          <img className="theme-card__cover" src={record.coverUrl} alt={`Preview of ${record.entry.name}`} />
        ) : (
          <div className="theme-card__cover theme-card__cover--empty">
            <Sparkles size={22} />
            <span>No preview yet</span>
          </div>
        )}
        <div className="theme-card__badges">
          <span>{record.manifest.theme?.mode ?? 'dark'}</span>
          <span>{layout}</span>
          {hasAudio ? <span>audio</span> : null}
        </div>
      </div>
      <div className="theme-card__body">
        <div>
          <p className="theme-card__eyebrow">{record.entry.id}</p>
          <h3>{record.entry.name}</h3>
          <p className="theme-card__meta">
            by {record.entry.author} · v{record.entry.version}
          </p>
        </div>
        <div className="theme-card__flags">
          <span>{hasBackgroundImage ? 'background image' : 'procedural background'}</span>
          <span>{record.manifest.theme?.icons?.path ? 'custom icons' : 'default icons'}</span>
          <span>{record.manifest.theme?.fonts?.regular ? 'custom fonts' : 'bundled fonts'}</span>
        </div>
        <div className="theme-card__actions">
          <button
            className={`theme-card__action theme-card__action--preview ${previewed ? 'theme-card__action--active' : ''}`}
            type="button"
            onClick={onPreview}
            title={`Open live preview for ${record.entry.name}`}
          >
            <Eye size={16} />
            <span>Preview</span>
          </button>
          <button
            className={`theme-card__action ${templated ? 'theme-card__action--active' : ''}`}
            type="button"
            onClick={onUseTemplate}
            title={`Load ${record.entry.name} as the current creator template`}
          >
            <Wand2 size={16} />
            <span>Template</span>
          </button>
          <button
            className="ghost-button theme-card__secondary"
            type="button"
            onClick={onDownload}
            disabled={downloading}
            title={`Download ${record.entry.name} as a zip archive`}
          >
            <Download size={16} />
            <span>{downloading ? 'Building…' : 'Download'}</span>
          </button>
        </div>
      </div>
    </article>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('explore');
  const [records, setRecords] = useState<ThemeCatalogRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedThemeId, setSelectedThemeId] = useState<string | null>(null);
  const [previewThemeId, setPreviewThemeId] = useState<string | null>(null);
  const [draft, setDraft] = useState<StudioDraft>(() => createEmptyDraft());
  const [search, setSearch] = useState('');
  const [downloadingThemeId, setDownloadingThemeId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const nextRecords = await loadThemeCatalog();
        if (!cancelled) {
          setRecords(nextRecords);
        }
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'Unknown catalog error');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const stats = useMemo(() => {
    const withAudio = records.filter((record) => record.manifest.audio?.bundled).length;
    const withImages = records.filter((record) => record.manifest.theme?.background?.image).length;
    const withCustomIcons = records.filter((record) => record.manifest.theme?.icons?.path).length;

    return {
      total: records.length,
      withAudio,
      withImages,
      withCustomIcons,
    };
  }, [records]);

  const filteredRecords = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return records;
    }

    return records.filter((record) => {
      const haystack = [
        record.entry.id,
        record.entry.name,
        record.entry.author,
        record.manifest.theme?.mode,
      ].join(' ').toLowerCase();
      return haystack.includes(query);
    });
  }, [records, search]);

  const selectedRecord = useMemo(() => {
    return records.find((record) => record.entry.id === selectedThemeId) ?? null;
  }, [records, selectedThemeId]);

  const previewRecord = useMemo(() => {
    return records.find((record) => record.entry.id === previewThemeId) ?? null;
  }, [previewThemeId, records]);

  const previewDraft = useMemo(() => {
    return previewRecord ? draftFromCatalogRecord(previewRecord) : null;
  }, [previewRecord]);

  useEffect(() => {
    if (!previewRecord) {
      return undefined;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPreviewThemeId(null);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [previewRecord]);

  function showRecordPreview(record: ThemeCatalogRecord) {
    setPreviewThemeId(record.entry.id);
  }

  function loadRecordInStudio(record: ThemeCatalogRecord) {
    setSelectedThemeId(record.entry.id);
    setPreviewThemeId(null);
    setDraft(draftFromCatalogRecord(record));
    setActiveTab('create');
  }

  function resetStudio() {
    setSelectedThemeId(null);
    setDraft(createEmptyDraft());
    setActiveTab('create');
  }

  async function handleDownload(record: ThemeCatalogRecord) {
    setDownloadingThemeId(record.entry.id);
    setDownloadError(null);
    try {
      await downloadThemeArchive(record);
    } catch (cause) {
      setDownloadError(cause instanceof Error ? cause.message : 'Unknown archive error');
    } finally {
      setDownloadingThemeId(null);
    }
  }

  return (
    <div className="app-shell">
      <div className="hero-orb hero-orb--left" />
      <div className="hero-orb hero-orb--right" />

      <header className="hero">
        <div className="hero__copy">
          <p className="hero__kicker">Community catalog + live studio</p>
          <h1>SwitchU Themes</h1>
          <p className="hero__lede">
            Browse the live catalog, load existing themes into the studio, and tune a preview that follows
            the actual SwitchU shell.
          </p>
        </div>

        <div className="hero__stats">
          <StatChip icon={<Palette size={18} />} label="Themes" value={String(stats.total)} />
          <StatChip icon={<AudioLines size={18} />} label="Audio" value={String(stats.withAudio)} />
          <StatChip icon={<ImageIcon size={18} />} label="Backgrounds" value={String(stats.withImages)} />
          <StatChip icon={<Sparkles size={18} />} label="Custom icons" value={String(stats.withCustomIcons)} />
        </div>
      </header>

      <nav className="tab-strip" aria-label="Sections">
        <button
          className={`tab-button ${activeTab === 'explore' ? 'tab-button--active' : ''}`}
          type="button"
          onClick={() => setActiveTab('explore')}
        >
          Explore themes
        </button>
        <button
          className={`tab-button ${activeTab === 'create' ? 'tab-button--active' : ''}`}
          type="button"
          onClick={() => setActiveTab('create')}
        >
          Theme creator
        </button>
      </nav>

      <main className="content-grid">
        {activeTab === 'explore' ? (
          <>
            <section className="panel panel--spotlight">
              <div className="panel__header">
                <div>
                  <p className="panel__eyebrow">Catalog workspace</p>
                  <h2>Explore, download, template</h2>
                </div>
                <button className="ghost-button" type="button" onClick={resetStudio}>
                  Start a blank draft
                </button>
              </div>
              <div className="feature-list">
                <div className="feature-card">
                  <strong>Browse real themes</strong>
                  <span>Reads the live catalog and keeps the existing manifests visible in one place.</span>
                </div>
                <div className="feature-card">
                  <strong>Download complete zips</strong>
                  <span>Packages the whole theme folder so you can archive or install it manually.</span>
                </div>
                <div className="feature-card">
                  <strong>Jump into the creator</strong>
                  <span>Use any existing theme as a starting template and switch straight into the editor.</span>
                </div>
              </div>
            </section>

            <section className="panel">
              <div className="panel__header">
                <div>
                  <p className="panel__eyebrow">Current catalog</p>
                  <h2>Browse existing themes</h2>
                </div>
                <label className="search-field">
                  <Search size={16} />
                  <input value={search} onChange={(event) => setSearch(event.currentTarget.value)} placeholder="Search theme, author, mode…" />
                </label>
              </div>

              {downloadError ? <div className="submit-feedback submit-feedback--error">{downloadError}</div> : null}

              {loading ? (
                <div className="loading-state">
                  <LoaderCircle className="loading-state__spinner" size={24} />
                  <span>Loading theme manifests…</span>
                </div>
              ) : null}

              {error ? <div className="error-state">{error}</div> : null}

              {!loading && !error ? (
                <div className="theme-grid">
                  {filteredRecords.map((record) => (
                    <ThemeCard
                      key={record.entry.id}
                      record={record}
                      previewed={record.entry.id === previewThemeId}
                      templated={record.entry.id === selectedThemeId}
                      downloading={record.entry.id === downloadingThemeId}
                      onPreview={() => showRecordPreview(record)}
                      onUseTemplate={() => loadRecordInStudio(record)}
                      onDownload={() => { void handleDownload(record); }}
                    />
                  ))}
                </div>
              ) : null}
            </section>
          </>
        ) : (
          <>
            <section className="panel panel--spotlight">
              <div className="panel__header">
                <div>
                  <p className="panel__eyebrow">Creator workspace</p>
                  <h2>Build a theme from scratch or from a template</h2>
                </div>
                <button className="ghost-button" type="button" onClick={() => setActiveTab('explore')}>
                  Back to explore
                </button>
              </div>
              <div className="feature-list creator-overview">
                <div className="feature-card">
                  <strong>Current base</strong>
                  <span>{selectedRecord ? `${selectedRecord.entry.name} by ${selectedRecord.entry.author}` : 'Blank draft with default SwitchU values.'}</span>
                </div>
                <div className="feature-card">
                  <strong>Template-ready</strong>
                  <span>Pick an existing theme in the creator to clone its palette, assets, and layout values.</span>
                </div>
                <div className="feature-card">
                  <strong>Better color picking</strong>
                  <span>Use a native swatch picker plus readable hue, saturation, and lightness controls.</span>
                </div>
              </div>
            </section>

            <ThemeStudio
              draft={draft}
              records={records}
              selectedRecord={selectedRecord}
              onChange={setDraft}
              onLoadTemplate={loadRecordInStudio}
              onReset={resetStudio}
            />
          </>
        )}
      </main>

      {activeTab === 'explore' && previewRecord && previewDraft ? (
        <div className="preview-overlay" role="dialog" aria-modal="true" aria-label={`Preview ${previewRecord.entry.name}`} onClick={() => setPreviewThemeId(null)}>
          <div className="preview-overlay__backdrop" />
          <div className="preview-overlay__dialog" onClick={(event) => event.stopPropagation()}>
            <div className="preview-overlay__header">
              <div>
                <p className="panel__eyebrow">Live catalog preview</p>
                <h2>Preview {previewRecord.entry.name}</h2>
              </div>
              <button className="ghost-button preview-overlay__close" type="button" onClick={() => setPreviewThemeId(null)}>
                <X size={16} />
                <span>Close</span>
              </button>
            </div>

            <div className="preview-overlay__content">
              <div className="preview-overlay__surface">
                <SwitchUPreview draft={previewDraft} selectedRecord={previewRecord} />
              </div>

              <div className="preview-overlay__meta">
                <div className="preview-overlay__summary">
                  <p className="theme-card__eyebrow">{previewRecord.entry.id}</p>
                  <h3>{previewRecord.entry.name}</h3>
                  <p className="theme-card__meta">by {previewRecord.entry.author} · v{previewRecord.entry.version}</p>
                  <p className="preview-overlay__copy">
                    This uses the same SwitchU preview renderer as the creator, but opens in an overlay so the catalog grid stays in place underneath.
                  </p>
                </div>

                <div className="preview-overlay__facts">
                  <span>{previewRecord.manifest.theme?.mode ?? 'dark'} mode</span>
                  <span>{previewRecord.manifest.theme?.background?.layout ?? 'floating'} layout</span>
                  <span>{previewRecord.manifest.audio?.bundled ? 'bundled audio' : 'no bundled audio'}</span>
                  <span>{previewRecord.manifest.theme?.background?.image ? 'background image' : 'procedural background'}</span>
                  <span>{previewRecord.manifest.theme?.fonts?.regular ? 'custom fonts' : 'default fonts'}</span>
                </div>

                <div className="preview-overlay__actions">
                  <button className="theme-card__action" type="button" onClick={() => loadRecordInStudio(previewRecord)}>
                    <Wand2 size={16} />
                    <span>Use as template</span>
                  </button>
                  <button
                    className="ghost-button theme-card__secondary"
                    type="button"
                    onClick={() => { void handleDownload(previewRecord); }}
                    disabled={downloadingThemeId === previewRecord.entry.id}
                  >
                    <Download size={16} />
                    <span>{downloadingThemeId === previewRecord.entry.id ? 'Building zip…' : 'Download .zip'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
