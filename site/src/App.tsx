import { AudioLines, Download, ExternalLink, Eye, GitPullRequest, LoaderCircle, LogIn, LogOut, Palette, PenLine, RefreshCw, Search, Sparkles, Volume2, Wand2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { loadThemeCatalog } from './catalog/api';
import { themeCapabilities, themeDeclaresIcons, themeDeclaresMusic, themeDeclaresSounds } from './catalog/capabilities';
import { downloadThemeArchive } from './catalog/download';
import { ThemeStudio } from './components/ThemeStudio';
import { IconCatalog } from './components/IconCatalog';
import { IconWorkshop } from './components/IconWorkshop';
import { beginGitHubLogin, clearSessionToken, completeAuthFromUrl, fetchCurrentUser, type AuthUser } from './github/auth';
import { loadOpenProposals, loadProposalDraft, readProposalRouteState, updateThemeProposal, type OpenProposalSummary, type ProposalResult, type ProposalRouteState } from './github/proposals';
import { loadOpenIconPacks, type OpenIconPackSummary } from './icons/submit';
import { SwitchUPreview } from './preview/SwitchUPreview';
import { createEmptyDraft, draftFromCatalogRecord, type StudioDraft } from './theme/draft';
import {
  clearDraftSession,
  loadDraftSession,
  peekDraftSession,
  saveDraftSession,
  type DraftSessionMeta,
} from './theme/draftSession';
import type { ThemeCatalogRecord } from './theme/schema';

type AppTab = 'explore' | 'pending' | 'create' | 'icons';
type ValidationFilter = 'all' | 'themes' | 'icons';

type ValidationItem =
  | { kind: 'theme'; updatedAt: string; proposal: OpenProposalSummary }
  | { kind: 'icon'; updatedAt: string; pack: OpenIconPackSummary };

function isPristineDraft(draft: StudioDraft): boolean {
  return (
    draft.proposalMode === 'create'
    && !draft.basedOnThemeId
    && draft.id === 'my-theme'
    && draft.name === 'My Theme'
    && !draft.author.trim()
    && !draft.notes.trim()
    && !draft.contributor.trim()
    && !draft.background.image
    && !draft.fonts.regular
    && !draft.fonts.small
    && !draft.audio.music
    && Object.keys(draft.audio.sfx).length === 0
  );
}

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
  return themeDeclaresIcons(record.manifest);
}

function loginMatches(a: string | undefined, b: string | undefined): boolean {
  const left = a?.trim().toLowerCase();
  const right = b?.trim().toLowerCase();
  return Boolean(left && right) && left === right;
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
  const caps = themeCapabilities(record);
  const hasBackgroundImage = Boolean(background?.image);
  const layout = background?.layout ?? 'floating';

  return (
    <article className={`theme-card ${previewed ? 'theme-card--selected' : ''}`}>
      <button
        className="theme-card__cover-button"
        type="button"
        onClick={onPreview}
        title={`Open live preview for ${record.entry.name}`}
      >
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
            {caps.music ? <span>music</span> : null}
            {caps.sounds ? <span>sounds</span> : null}
            {caps.icons ? <span>icons</span> : null}
            {hasBackgroundImage ? <span>bg</span> : null}
          </div>
        </div>
      </button>
      <div className="theme-card__body">
        <div>
          <p className="theme-card__eyebrow">{record.entry.id}</p>
          <h3>{record.entry.name}</h3>
          <p className="theme-card__meta">
            by {record.entry.author} · v{record.entry.version}
          </p>
        </div>
        <div className="theme-card__actions">
          <button
            className={`theme-card__action theme-card__action--icon theme-card__action--preview ${previewed ? 'theme-card__action--active' : ''}`}
            type="button"
            onClick={onPreview}
            aria-label={`Preview ${record.entry.name}`}
            title={`Preview ${record.entry.name}`}
          >
            <Eye size={16} />
            <span>Preview</span>
          </button>
          <button
            className={`theme-card__action theme-card__action--icon ${templated ? 'theme-card__action--active' : ''}`}
            type="button"
            onClick={onUseTemplate}
            aria-label={`Use ${record.entry.name} as template`}
            title={`Use ${record.entry.name} as template`}
          >
            <Wand2 size={16} />
            <span>Template</span>
          </button>
          <button
            className="theme-card__action theme-card__action--icon"
            type="button"
            onClick={onEditTheme}
            aria-label={`Edit ${record.entry.name}`}
            title={`Edit ${record.entry.name}`}
          >
            <PenLine size={16} />
            <span>Edit</span>
          </button>
          <button
            className="ghost-button theme-card__secondary theme-card__action--icon"
            type="button"
            onClick={onDownload}
            disabled={downloading}
            aria-label={`Download ${record.entry.name} zip`}
            title={downloading ? 'Building zip…' : `Download ${record.entry.name} zip`}
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
          <span>Theme</span>
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
        <div className="theme-card__flags proposal-card__flags">
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

function IconPackProposalCard({ pack }: { pack: OpenIconPackSummary }) {
  return (
    <article className="theme-card proposal-card theme-card--icons">
      <div className="theme-card__cover-wrap theme-card__cover-wrap--icons">
        {pack.glyphUrls.length ? (
          <div className="proposal-card__glyph-mosaic" aria-hidden>
            {pack.glyphUrls.slice(0, 6).map((glyph) => (
              <img key={glyph.fileName} src={glyph.url} alt="" />
            ))}
          </div>
        ) : pack.coverUrl ? (
          <img className="theme-card__cover theme-card__cover--icons" src={pack.coverUrl} alt={`Glyphs of ${pack.name}`} />
        ) : (
          <div className="theme-card__cover theme-card__cover--empty">
            <Sparkles size={22} />
            <span>No preview yet</span>
          </div>
        )}
        <div className="theme-card__badges">
          <span>Icon pack</span>
          <span>PR #{pack.number}</span>
          <span>{pack.colour ? 'colour' : 'mono'}</span>
        </div>
      </div>
      <div className="theme-card__body">
        <div>
          <p className="theme-card__eyebrow">{pack.packId}</p>
          <h3>{pack.name}</h3>
          <p className="theme-card__meta">
            by {pack.author} · v{pack.version}
          </p>
        </div>
        <div className="proposal-card__status">
          <GitPullRequest size={16} />
          <span>{pack.title}</span>
        </div>
        <div className="theme-card__flags proposal-card__flags">
          <span>{pack.contributor ? `submitted by ${pack.contributor}` : 'community proposal'}</span>
          <span>updated {formatDateTime(pack.updatedAt)}</span>
          <span>{pack.glyphUrls.length || 0} glyph{pack.glyphUrls.length === 1 ? '' : 's'}</span>
        </div>
        <div className="theme-card__actions">
          <a className="theme-card__action theme-card__action--preview" href={pack.pullRequestUrl} target="_blank" rel="noreferrer">
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
  const [linkedProposalAuthorLogin, setLinkedProposalAuthorLogin] = useState<string>('');
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [openProposals, setOpenProposals] = useState<OpenProposalSummary[]>([]);
  const [openIconPacks, setOpenIconPacks] = useState<OpenIconPackSummary[]>([]);
  const [openProposalsLoading, setOpenProposalsLoading] = useState(false);
  const [openProposalsLoaded, setOpenProposalsLoaded] = useState(false);
  const [openProposalsError, setOpenProposalsError] = useState<string | null>(null);
  const [validationFilter, setValidationFilter] = useState<ValidationFilter>('all');
  const [savedSession, setSavedSession] = useState<DraftSessionMeta | null>(null);
  const [sessionBusy, setSessionBusy] = useState(false);
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);
  const skipNextAutosaveRef = useRef(false);

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
    let cancelled = false;

    void (async () => {
      try {
        const completion = await completeAuthFromUrl();
        if (cancelled) {
          return;
        }
        if (completion.error) {
          setAuthError(completion.error);
          return;
        }
        if (completion.user) {
          setAuthUser(completion.user);
          return;
        }
        setAuthUser(await fetchCurrentUser());
      } catch (cause) {
        if (!cancelled) {
          setAuthError(cause instanceof Error ? cause.message : 'Sign-in failed.');
        }
      } finally {
        if (!cancelled) {
          setAuthReady(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (initialProposalRoute) {
      return undefined;
    }

    let cancelled = false;
    void (async () => {
      try {
        const meta = await peekDraftSession();
        if (!cancelled) {
          setSavedSession(meta);
        }
      } catch {
        if (!cancelled) {
          setSavedSession(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [initialProposalRoute]);

  useEffect(() => {
    if (!linkedProposal) {
      return undefined;
    }

    let cancelled = false;
    setProposalLoading(true);
    setProposalError(null);
    setActiveTab('create');
    setSavedSession(null);
    setSessionNotice(null);

    void (async () => {
      try {
        const proposalDraft = await loadProposalDraft(linkedProposal);
        if (!cancelled) {
          skipNextAutosaveRef.current = true;
          setSelectedThemeId(null);
          setPreviewThemeId(null);
          setDraft(proposalDraft.draft);
          setLinkedProposalAuthorLogin(proposalDraft.authorLogin);
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
    if (linkedProposal || proposalLoading) {
      return undefined;
    }

    if (skipNextAutosaveRef.current) {
      skipNextAutosaveRef.current = false;
      return undefined;
    }

    const timer = window.setTimeout(() => {
      if (isPristineDraft(draft)) {
        void clearDraftSession()
          .then(() => setSavedSession(null))
          .catch(() => {});
        return;
      }

      void saveDraftSession(draft)
        .then(async () => {
          setSavedSession(await peekDraftSession());
        })
        .catch(() => {
          // Autosave is best-effort; ignore quota / private-mode failures.
        });
    }, 700);

    return () => {
      window.clearTimeout(timer);
    };
  }, [draft, linkedProposal, proposalLoading]);

  useEffect(() => {
    if (activeTab !== 'pending' || openProposalsLoaded || openProposalsLoading) {
      return;
    }

    void refreshOpenProposals();
  }, [activeTab, openProposalsLoaded, openProposalsLoading]);

  const stats = useMemo(() => {
    const withMusic = records.filter((record) => themeDeclaresMusic(record.manifest)).length;
    const withSounds = records.filter((record) => themeDeclaresSounds(record.manifest)).length;
    const withCustomIcons = records.filter(hasCustomIcons).length;

    return {
      total: records.length,
      withMusic,
      withSounds,
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

  const editorUnlocked = useMemo(() => {
    if (!linkedProposal) {
      return true;
    }
    return Boolean(authUser) && loginMatches(authUser?.login, linkedProposalAuthorLogin);
  }, [linkedProposal, authUser, linkedProposalAuthorLogin]);

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
      const [proposals, packs] = await Promise.all([loadOpenProposals(), loadOpenIconPacks()]);
      setOpenProposals(proposals);
      setOpenIconPacks(packs);
      setOpenProposalsLoaded(true);
    } catch (cause) {
      setOpenProposalsError(cause instanceof Error ? cause.message : 'Unknown proposal list error');
    } finally {
      setOpenProposalsLoading(false);
    }
  }

  const validationItems = useMemo(() => {
    const themes: ValidationItem[] = openProposals.map((proposal) => ({
      kind: 'theme',
      updatedAt: proposal.updatedAt,
      proposal,
    }));
    const icons: ValidationItem[] = openIconPacks.map((pack) => ({
      kind: 'icon',
      updatedAt: pack.updatedAt,
      pack,
    }));

    const merged = validationFilter === 'themes'
      ? themes
      : validationFilter === 'icons'
        ? icons
        : [...themes, ...icons];

    return merged.sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
  }, [openIconPacks, openProposals, validationFilter]);

  const validationCounts = useMemo(() => ({
    all: openProposals.length + openIconPacks.length,
    themes: openProposals.length,
    icons: openIconPacks.length,
  }), [openIconPacks.length, openProposals.length]);

  function clearProposalRoute() {
    const url = new URL(window.location.href);
    url.searchParams.delete('proposalId');
    url.searchParams.delete('proposalBranch');
    url.searchParams.delete('proposalMode');
    window.history.replaceState({}, '', url);
    setLinkedProposal(null);
    setLinkedProposalAuthorLogin('');
    setProposalLoading(false);
    setProposalError(null);
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
    setLinkedProposalAuthorLogin(proposal.authorLogin);
    setSelectedThemeId(null);
    setPreviewThemeId(null);
    setActiveTab('create');
  }

  function handleProposalCreated(_result: ProposalResult, _createdDraft: StudioDraft) {
    setOpenProposalsLoaded(false);
  }

  async function handleLogin() {
    setAuthError(null);
    try {
      await beginGitHubLogin();
    } catch (cause) {
      setAuthError(cause instanceof Error ? cause.message : 'Sign-in failed.');
    }
  }

  function handleLogout() {
    clearSessionToken();
    setAuthUser(null);
  }

  function showRecordPreview(record: ThemeCatalogRecord) {
    setPreviewThemeId(record.entry.id);
  }

  function loadRecordInStudio(record: ThemeCatalogRecord) {
    clearProposalRoute();
    setSelectedThemeId(record.entry.id);
    setPreviewThemeId(null);
    setSessionNotice(null);
    setDraft(draftFromCatalogRecord(record, { proposalMode: 'create' }));
    setActiveTab('create');
  }

  function editRecordInStudio(record: ThemeCatalogRecord) {
    clearProposalRoute();
    setSelectedThemeId(record.entry.id);
    setPreviewThemeId(null);
    setSessionNotice(null);
    setDraft(draftFromCatalogRecord(record, { proposalMode: 'update' }));
    setActiveTab('create');
  }

  function resetStudio() {
    clearProposalRoute();
    setSelectedThemeId(null);
    setSessionNotice(null);
    setDraft(createEmptyDraft());
    setActiveTab('create');
    void clearDraftSession().then(() => setSavedSession(null));
  }

  async function resumeSavedDraft() {
    setSessionBusy(true);
    setSessionNotice(null);
    try {
      const restored = await loadDraftSession();
      if (!restored) {
        setSavedSession(null);
        setSessionNotice('No saved draft was available to restore.');
        return;
      }

      clearProposalRoute();
      skipNextAutosaveRef.current = true;
      setSelectedThemeId(null);
      setPreviewThemeId(null);
      setDraft(restored);
      setActiveTab('create');
      setSavedSession(await peekDraftSession());
      setSessionNotice(`Restored “${restored.name}” from your browser draft (kept for 24 hours).`);
    } catch (cause) {
      setSessionNotice(cause instanceof Error ? cause.message : 'Failed to restore the saved draft.');
    } finally {
      setSessionBusy(false);
    }
  }

  async function discardSavedDraft() {
    setSessionBusy(true);
    try {
      await clearDraftSession();
      setSavedSession(null);
      setSessionNotice('Discarded the browser-saved draft.');
    } catch (cause) {
      setSessionNotice(cause instanceof Error ? cause.message : 'Failed to discard the saved draft.');
    } finally {
      setSessionBusy(false);
    }
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

    if (!authUser) {
      throw new Error('Sign in with GitHub to update this proposal.');
    }

    return updateThemeProposal(nextDraft, previewNode, linkedProposal.branchName);
  }

  return (
    <div className="app-shell">
      <header className="hero">
        <div className="hero__copy">
          <div className="hero__title-row">
            <img className="hero__brand" src="/brand-themes.png" alt="" width={72} height={72} />
            <h1>SwitchU Themes</h1>
          </div>
          <p className="hero__lede">
            Browse and download themes, or use the studio to build your own with a live SwitchU preview.
            Download your custom theme or Sign in with GitHub to submit it to the theme shop and review or update your open submissions.
          </p>
          <div className="auth-control">
            {authUser ? (
              <div className="auth-control__user">
                {authUser.avatarUrl ? <img src={authUser.avatarUrl} alt="" className="auth-control__avatar" /> : null}
                <span className="auth-control__login">@{authUser.login}</span>
                <button className="ghost-button" type="button" onClick={handleLogout} title="Sign out">
                  <LogOut size={16} />
                  <span>Sign out</span>
                </button>
              </div>
            ) : (
              <button className="ghost-button" type="button" onClick={() => { void handleLogin(); }} title="Sign in with GitHub">
                <LogIn size={16} />
                <span>Sign in with GitHub</span>
              </button>
            )}
            {authError ? <div className="submit-feedback submit-feedback--error auth-control__error">{authError}</div> : null}
          </div>
        </div>

        <div className="hero__stats">
          <StatChip icon={<Palette size={18} />} label="Themes" value={String(stats.total)} />
          <StatChip icon={<AudioLines size={18} />} label="Music" value={String(stats.withMusic)} />
          <StatChip icon={<Volume2 size={18} />} label="Sounds" value={String(stats.withSounds)} />
          <StatChip icon={<Sparkles size={18} />} label="Icons" value={String(stats.withCustomIcons)} />
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
        <button
          className={`tab-button ${activeTab === 'icons' ? 'tab-button--active' : ''}`}
          type="button"
          onClick={() => setActiveTab('icons')}
        >
          Icon workshop
        </button>
        <button
          className={`tab-button ${activeTab === 'pending' ? 'tab-button--active' : ''}`}
          type="button"
          onClick={() => setActiveTab('pending')}
        >
          Validation
        </button>
      </nav>

      <main className="content-grid">
        {activeTab === 'explore' ? (
          <>
            <section className="panel panel--spotlight">
              <div className="panel__header">
                <div>
                  <p className="panel__eyebrow">Theme catalog</p>
                  <h2>Explore and download themes</h2>
                </div>
                <button className="ghost-button" type="button" onClick={resetStudio}>
                  Create your own theme
                </button>
              </div>
              <div className="feature-list">
                <div className="feature-card">
                  <strong>Browse themes</strong>
                  <span>Browse, preview and download themes below or use SwitchU&apos;s built in theme shop.</span>
                </div>
                <div className="feature-card">
                  <strong>How to install</strong>
                  <span>
                    Use the SwitchU theme shop or extract downloaded themes to:{' '}
                    <code>/config/SwitchU/themes/&lt;theme-id&gt;/</code>.
                  </span>
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
                  <h2>Themes and icon packs awaiting review</h2>
                </div>
                <button className="ghost-button" type="button" onClick={() => { void refreshOpenProposals(); }} disabled={openProposalsLoading}>
                  <RefreshCw size={16} />
                  <span>{openProposalsLoading ? 'Refreshing…' : 'Refresh'}</span>
                </button>
              </div>
              <div className="feature-list">
                <div className="feature-card">
                  <strong>Preview theme PRs</strong>
                  <span>Open studio theme proposals in the live SwitchU renderer used by the creator.</span>
                </div>
                <div className="feature-card">
                  <strong>Review icon packs</strong>
                  <span>Inspect glyph mosaics from open icon-pack PRs, then jump to GitHub to merge.</span>
                </div>
                <div className="feature-card">
                  <strong>Edit as the author</strong>
                  <span>Theme authors can keep editing their own PR after signing in with the same GitHub account.</span>
                </div>
              </div>
            </section>

            <section className="panel">
              <div className="panel__header">
                <div>
                  <p className="panel__eyebrow">Open proposals</p>
                  <h2>
                    {validationCounts.all
                      ? `${validationCounts.all} item${validationCounts.all === 1 ? '' : 's'} in validation`
                      : 'Nothing in validation'}
                  </h2>
                </div>
                <div className="validation-filters" role="group" aria-label="Filter validation queue">
                  {([
                    ['all', `All (${validationCounts.all})`],
                    ['themes', `Themes (${validationCounts.themes})`],
                    ['icons', `Icons (${validationCounts.icons})`],
                  ] as const).map(([value, label]) => (
                    <button
                      key={value}
                      className={`validation-filter ${validationFilter === value ? 'validation-filter--active' : ''}`}
                      type="button"
                      onClick={() => setValidationFilter(value)}
                    >
                      {label}
                    </button>
                  ))}
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
                validationItems.length ? (
                  <div className="theme-grid">
                    {validationItems.map((item) => (
                      item.kind === 'theme' ? (
                        <ProposalCard
                          key={`theme:${item.proposal.branchName}:${item.proposal.proposalId}`}
                          proposal={item.proposal}
                          onPreview={() => openProposalInStudio(item.proposal, 'preview')}
                          onEdit={() => openProposalInStudio(item.proposal, 'edit')}
                        />
                      ) : (
                        <IconPackProposalCard
                          key={`icon:${item.pack.branchName}:${item.pack.packId}`}
                          pack={item.pack}
                        />
                      )
                    ))}
                  </div>
                ) : (
                  <div className="empty-state">
                    {validationFilter === 'themes'
                      ? 'No open theme proposals right now.'
                      : validationFilter === 'icons'
                        ? 'No open icon pack proposals right now.'
                        : 'No open theme or icon pack proposals right now.'}
                  </div>
                )
              ) : null}
            </section>
          </>
        ) : activeTab === 'icons' ? (
          <>
            <IconCatalog />
            <IconWorkshop />
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
                        ? 'This link opens the editor for the linked PR. Sign in with the author GitHub account to save updates.'
                        : 'This link opens the linked PR in preview mode without write access.'
                      : 'Pick an existing theme in the creator to clone its palette, assets, and layout values. Drafts autosave in this browser for 24 hours, and you can import a local zip anytime.'}
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

            {!linkedProposal && savedSession ? (
              <div className="submit-feedback submit-feedback--success draft-session-banner">
                <div>
                  Browser draft “{savedSession.draftName}” ({savedSession.draftId}) is saved until{' '}
                  {formatDateTime(new Date(savedSession.expiresAt).toISOString())}.
                </div>
                <div className="draft-session-banner__actions">
                  <button className="ghost-button" type="button" disabled={sessionBusy} onClick={() => { void resumeSavedDraft(); }}>
                    <span>{sessionBusy ? 'Working…' : 'Resume saved draft'}</span>
                  </button>
                  <button className="ghost-button" type="button" disabled={sessionBusy} onClick={() => { void discardSavedDraft(); }}>
                    <span>Discard</span>
                  </button>
                </div>
              </div>
            ) : null}

            {sessionNotice ? <div className="submit-feedback submit-feedback--success">{sessionNotice}</div> : null}

            <ThemeStudio
              draft={draft}
              records={records}
              selectedRecord={selectedRecord}
              onChange={setDraft}
              onLoadTemplate={loadRecordInStudio}
              onReset={resetStudio}
              linkedProposal={linkedProposal}
              authUser={authUser}
              editorUnlocked={editorUnlocked}
              onLogin={handleLogin}
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
                  <span>{themeDeclaresMusic(previewRecord.manifest) ? 'music' : 'no music'}</span>
                  <span>{themeDeclaresSounds(previewRecord.manifest) ? 'sounds' : 'no sounds'}</span>
                  <span>{themeDeclaresIcons(previewRecord.manifest) ? 'custom icons' : 'default icons'}</span>
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
                    <span>{downloadingThemeId === previewRecord.entry.id ? 'Building zip…' : 'Download'}</span>
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
