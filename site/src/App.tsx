import { AudioLines, Download, ExternalLink, Eye, GitPullRequest, ImageIcon, LoaderCircle, Palette, PenLine, RefreshCw, Search, Sparkles, Wand2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { loadThemeCatalog } from './catalog/api';
import { downloadThemeArchive } from './catalog/download';
import { ThemeStudio } from './components/ThemeStudio';
import { loadOpenProposals, loadProposalDraft, readProposalRouteState, updateThemeProposal, type OpenProposalSummary, type ProposalResult, type ProposalRouteState } from './github/proposals';
import { SwitchUPreview } from './preview/SwitchUPreview';
import { createEmptyDraft, draftFromCatalogRecord, type StudioDraft } from './theme/draft';
import type { ThemeCatalogRecord } from './theme/schema';

type AppTab = 'explore' | 'pending' | 'create';
const PROPOSAL_EDIT_CODES_STORAGE_KEY = 'switchu-themes-proposal-edit-codes';

function StatChip({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="stat-chip">
      <span className="stat-chip__icon">{icon}</span>
      <span className="stat-chip__label">{label}</span>
      <strong className="stat-chip__value">{value}</strong>
    </div>
  );
}

function hasCustomIcons(record: ThemeCatalogRecord): boolean {
  const icons = record.manifest.theme?.icons;
  return Boolean(icons?.path || icons?.basePath || icons?.base_path);
}

function proposalEditCodeKey(proposal: Pick<ProposalRouteState, 'proposalId' | 'branchName'>): string {
  return `${proposal.branchName}::${proposal.proposalId}`;
}

function readStoredProposalEditCodes(): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(PROPOSAL_EDIT_CODES_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed as Record<string, string> : {};
  } catch {
    return {};
  }
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function ThemeCard({
  record,
  previewed,
  templated,
  downloading,
  onPreview,
  onUseTemplate,
  onEditTheme,
  onDownload,
}: {
  record: ThemeCatalogRecord;
  previewed: boolean;
  templated: boolean;
  downloading: boolean;
  onPreview: () => void;
  onUseTemplate: () => void;
  onEditTheme: () => void;
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
          <span>{hasCustomIcons(record) ? 'custom icons' : 'default icons'}</span>
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
            className="theme-card__action"
            type="button"
            onClick={onEditTheme}
            title={`Open a pull request to update ${record.entry.name}`}
          >
            <PenLine size={16} />
            <span>Edit</span>
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

function ProposalCard({
  proposal,
  onPreview,
  onEdit,
}: {
  proposal: OpenProposalSummary;
  onPreview: () => void;
  onEdit: () => void;
}) {
  return (
    <article className="theme-card proposal-card">
      <div className="theme-card__cover-wrap">
        <img className="theme-card__cover" src={proposal.coverUrl} alt={`Preview of ${proposal.name}`} />
        <div className="theme-card__badges">
          <span>PR #{proposal.number}</span>
          <span>{proposal.proposalMode === 'update' ? 'update' : 'new'}</span>
          <span>{proposal.mode}</span>
        </div>
      </div>
      <div className="theme-card__body">
        <div>
          <p className="theme-card__eyebrow">{proposal.proposalId}</p>
          <h3>{proposal.name}</h3>
          <p className="theme-card__meta">
            by {proposal.author} · v{proposal.version}
          </p>
        </div>
        <div className="proposal-card__status">
          <GitPullRequest size={16} />
          <span>{proposal.title}</span>
        </div>
        <div className="theme-card__flags">
          <span>{proposal.contributor ? `submitted by ${proposal.contributor}` : 'community proposal'}</span>
          <span>updated {formatDateTime(proposal.updatedAt)}</span>
        </div>
        <div className="theme-card__actions">
          <button className="theme-card__action theme-card__action--preview" type="button" onClick={onPreview}>
            <Eye size={16} />
            <span>Preview</span>
          </button>
          <button className="theme-card__action" type="button" onClick={onEdit}>
            <PenLine size={16} />
            <span>Edit</span>
          </button>
          <a className="ghost-button theme-card__secondary" href={proposal.pullRequestUrl} target="_blank" rel="noreferrer">
            <ExternalLink size={16} />
            <span>Open PR</span>
          </a>
        </div>
      </div>
    </article>
  );
}

export default function App() {
  const initialProposalRoute = useMemo(() => readProposalRouteState(), []);
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
  const [linkedProposal, setLinkedProposal] = useState<ProposalRouteState | null>(initialProposalRoute);
  const [proposalLoading, setProposalLoading] = useState(Boolean(initialProposalRoute));
  const [proposalError, setProposalError] = useState<string | null>(null);
  const [proposalEditCodes, setProposalEditCodes] = useState<Record<string, string>>(() => readStoredProposalEditCodes());
  const [openProposals, setOpenProposals] = useState<OpenProposalSummary[]>([]);
  const [openProposalsLoading, setOpenProposalsLoading] = useState(false);
  const [openProposalsLoaded, setOpenProposalsLoaded] = useState(false);
  const [openProposalsError, setOpenProposalsError] = useState<string | null>(null);

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

  useEffect(() => {
    if (!linkedProposal) {
      return undefined;
    }

    let cancelled = false;
    setProposalLoading(true);
    setProposalError(null);
    setActiveTab('create');

    void (async () => {
      try {
        const proposalDraft = await loadProposalDraft(linkedProposal);
        if (!cancelled) {
          setSelectedThemeId(null);
          setPreviewThemeId(null);
          setDraft(proposalDraft.draft);
        }
      } catch (cause) {
        if (!cancelled) {
          setProposalError(cause instanceof Error ? cause.message : 'Unknown proposal load error');
        }
      } finally {
        if (!cancelled) {
          setProposalLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [linkedProposal]);

  useEffect(() => {
    if (activeTab !== 'pending' || openProposalsLoaded || openProposalsLoading) {
      return;
    }

    void refreshOpenProposals();
  }, [activeTab, openProposalsLoaded, openProposalsLoading]);

  const stats = useMemo(() => {
    const withAudio = records.filter((record) => record.manifest.audio?.bundled).length;
    const withImages = records.filter((record) => record.manifest.theme?.background?.image).length;
    const withCustomIcons = records.filter(hasCustomIcons).length;

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

  const activeProposalEditCode = useMemo(() => {
    return linkedProposal ? proposalEditCodes[proposalEditCodeKey(linkedProposal)] ?? '' : '';
  }, [linkedProposal, proposalEditCodes]);

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

  async function refreshOpenProposals() {
    setOpenProposalsLoading(true);
    setOpenProposalsError(null);
    try {
      const proposals = await loadOpenProposals();
      setOpenProposals(proposals);
      setOpenProposalsLoaded(true);
    } catch (cause) {
      setOpenProposalsError(cause instanceof Error ? cause.message : 'Unknown proposal list error');
    } finally {
      setOpenProposalsLoading(false);
    }
  }

  function persistProposalEditCode(proposal: Pick<ProposalRouteState, 'proposalId' | 'branchName'>, nextCode: string) {
    const key = proposalEditCodeKey(proposal);
    const nextCodes = { ...proposalEditCodes };
    if (nextCode) {
      nextCodes[key] = nextCode;
    } else {
      delete nextCodes[key];
    }

    setProposalEditCodes(nextCodes);
    window.localStorage.setItem(PROPOSAL_EDIT_CODES_STORAGE_KEY, JSON.stringify(nextCodes));
  }

  function clearProposalRoute() {
    const url = new URL(window.location.href);
    url.searchParams.delete('proposalId');
    url.searchParams.delete('proposalBranch');
    url.searchParams.delete('proposalMode');
    window.history.replaceState({}, '', url);
    setLinkedProposal(null);
    setProposalLoading(false);
    setProposalError(null);
  }

  function requestProposalEditCode(): string | null {
    if (!linkedProposal) {
      return null;
    }

    const existing = activeProposalEditCode.trim();
    if (existing) {
      return existing;
    }

    const entered = window.prompt(`Enter the personal edit code for ${linkedProposal.proposalId}.`)?.trim();
    if (!entered) {
      return null;
    }

    persistProposalEditCode(linkedProposal, entered);
    return entered;
  }

  function openProposalInStudio(proposal: OpenProposalSummary, proposalMode: ProposalRouteState['proposalMode']) {
    const route: ProposalRouteState = {
      proposalId: proposal.proposalId,
      branchName: proposal.branchName,
      proposalMode,
    };
    const url = new URL(window.location.href);
    url.searchParams.set('proposalId', route.proposalId);
    url.searchParams.set('proposalBranch', route.branchName);
    url.searchParams.set('proposalMode', route.proposalMode);
    window.history.replaceState({}, '', url);
    setLinkedProposal(route);
    setSelectedThemeId(null);
    setPreviewThemeId(null);
    setActiveTab('create');
  }

  function handleProposalCreated(result: ProposalResult, createdDraft: StudioDraft) {
    if (!result.editCode) {
      return;
    }

    persistProposalEditCode(
      {
        proposalId: createdDraft.id,
        branchName: result.branchName,
      },
      result.editCode,
    );
    setOpenProposalsLoaded(false);
  }

  function showRecordPreview(record: ThemeCatalogRecord) {
    setPreviewThemeId(record.entry.id);
  }

  function loadRecordInStudio(record: ThemeCatalogRecord) {
    clearProposalRoute();
    setSelectedThemeId(record.entry.id);
    setPreviewThemeId(null);
    setDraft(draftFromCatalogRecord(record, { proposalMode: 'create' }));
    setActiveTab('create');
  }

  function editRecordInStudio(record: ThemeCatalogRecord) {
    clearProposalRoute();
    setSelectedThemeId(record.entry.id);
    setPreviewThemeId(null);
    setDraft(draftFromCatalogRecord(record, { proposalMode: 'update' }));
    setActiveTab('create');
  }

  function resetStudio() {
    clearProposalRoute();
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

  async function handleUpdateLinkedProposal(nextDraft: StudioDraft, previewNode: HTMLElement) {
    if (!linkedProposal) {
      throw new Error('No linked proposal is currently loaded.');
    }

    const editCode = requestProposalEditCode();
    if (!editCode) {
      throw new Error('Personal edit code is required to update this linked proposal.');
    }

    try {
      return await updateThemeProposal(nextDraft, previewNode, linkedProposal.branchName, editCode);
    } catch (cause) {
      if (cause instanceof Error && cause.message.includes('Forbidden')) {
        persistProposalEditCode(linkedProposal, '');
      }
      throw cause;
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
          className={`tab-button ${activeTab === 'pending' ? 'tab-button--active' : ''}`}
          type="button"
          onClick={() => setActiveTab('pending')}
        >
          Validation
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
                      onEditTheme={() => editRecordInStudio(record)}
                      onDownload={() => { void handleDownload(record); }}
                    />
                  ))}
                </div>
              ) : null}
            </section>
          </>
        ) : activeTab === 'pending' ? (
          <>
            <section className="panel panel--spotlight">
              <div className="panel__header">
                <div>
                  <p className="panel__eyebrow">Validation queue</p>
                  <h2>Themes awaiting review</h2>
                </div>
                <button className="ghost-button" type="button" onClick={() => { void refreshOpenProposals(); }} disabled={openProposalsLoading}>
                  <RefreshCw size={16} />
                  <span>{openProposalsLoading ? 'Refreshing…' : 'Refresh'}</span>
                </button>
              </div>
              <div className="feature-list">
                <div className="feature-card">
                  <strong>Preview PR themes</strong>
                  <span>Open any studio proposal with the same live SwitchU renderer used by the creator.</span>
                </div>
                <div className="feature-card">
                  <strong>Edit with a personal code</strong>
                  <span>Proposal authors can keep editing their own PR after entering its private edit code.</span>
                </div>
                <div className="feature-card">
                  <strong>Review from GitHub</strong>
                  <span>Jump straight to the pull request when a theme is ready for merge review.</span>
                </div>
              </div>
            </section>

            <section className="panel">
              <div className="panel__header">
                <div>
                  <p className="panel__eyebrow">Open proposals</p>
                  <h2>{openProposals.length ? `${openProposals.length} theme${openProposals.length === 1 ? '' : 's'} in validation` : 'No themes in validation'}</h2>
                </div>
              </div>

              {openProposalsLoading ? (
                <div className="loading-state">
                  <LoaderCircle className="loading-state__spinner" size={24} />
                  <span>Loading open proposals…</span>
                </div>
              ) : null}

              {openProposalsError ? <div className="submit-feedback submit-feedback--error">{openProposalsError}</div> : null}

              {!openProposalsLoading && !openProposalsError ? (
                openProposals.length ? (
                  <div className="theme-grid">
                    {openProposals.map((proposal) => (
                      <ProposalCard
                        key={`${proposal.branchName}:${proposal.proposalId}`}
                        proposal={proposal}
                        onPreview={() => openProposalInStudio(proposal, 'preview')}
                        onEdit={() => openProposalInStudio(proposal, 'edit')}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="empty-state">No open studio proposals right now.</div>
                )
              ) : null}
            </section>
          </>
        ) : (
          <>
            <section className="panel panel--spotlight">
              <div className="panel__header">
                <div>
                  <p className="panel__eyebrow">Creator workspace</p>
                  <h2>{linkedProposal ? 'Open a PR-linked draft' : 'Build a theme from scratch or from a template'}</h2>
                </div>
                <button className="ghost-button" type="button" onClick={() => setActiveTab('explore')}>
                  Back to explore
                </button>
              </div>
              <div className="feature-list creator-overview">
                <div className="feature-card">
                  <strong>{linkedProposal ? 'Linked proposal' : 'Current base'}</strong>
                  <span>
                    {linkedProposal
                      ? `${linkedProposal.proposalId} on ${linkedProposal.branchName}`
                      : selectedRecord
                        ? `${selectedRecord.entry.name} by ${selectedRecord.entry.author}`
                        : 'Blank draft with default SwitchU values.'}
                  </span>
                </div>
                <div className="feature-card">
                  <strong>{linkedProposal ? 'Access mode' : 'Template-ready'}</strong>
                  <span>
                    {linkedProposal
                      ? linkedProposal.proposalMode === 'edit'
                        ? "This link opens the editor for the linked PR. Saving remains locked until you provide this proposal's personal edit code."
                        : 'This link opens the linked PR in preview mode without write access.'
                      : 'Pick an existing theme in the creator to clone its palette, assets, and layout values.'}
                  </span>
                </div>
                <div className="feature-card">
                  <strong>{linkedProposal ? 'Exit this link' : 'Better color picking'}</strong>
                  <span>
                    {linkedProposal
                      ? 'Start a blank draft or load a catalog template to leave the PR-linked editing flow.'
                      : 'Use a native swatch picker plus readable hue, saturation, and lightness controls.'}
                  </span>
                </div>
              </div>
            </section>

            {proposalLoading ? (
              <div className="loading-state">
                <LoaderCircle className="loading-state__spinner" size={24} />
                <span>Loading linked proposal draft…</span>
              </div>
            ) : null}

            {proposalError ? <div className="submit-feedback submit-feedback--error">{proposalError}</div> : null}

            <ThemeStudio
              draft={draft}
              records={records}
              selectedRecord={selectedRecord}
              onChange={setDraft}
              onLoadTemplate={loadRecordInStudio}
              onReset={resetStudio}
              linkedProposal={linkedProposal}
              editorUnlocked={Boolean(activeProposalEditCode.trim())}
              onUnlockEditor={async () => Boolean(requestProposalEditCode())}
              onUpdateProposal={handleUpdateLinkedProposal}
              onProposalCreated={handleProposalCreated}
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
                  <button className="theme-card__action" type="button" onClick={() => editRecordInStudio(previewRecord)}>
                    <PenLine size={16} />
                    <span>Edit theme</span>
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
