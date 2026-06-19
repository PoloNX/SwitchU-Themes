import {
  Download,
  LockKeyhole,
  Music4,
  Send,
  Sparkles,
  Upload,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { downloadDraftArchive, submitThemeProposal, type ProposalMode, type ProposalUpdateResult } from '../github/proposals';
import { SwitchUPreview } from '../preview/SwitchUPreview';
import { hexToHslTriplet, hslTripletToHex, hslTripletToRgb, rgbToHslTriplet } from '../theme/color';
import {
  DEFAULT_SFX_NAMES,
  cloneDraft,
  createOptimizedBackgroundUploadAsset,
  createUploadAsset,
  normalizeDraftId,
  type DefaultSfxName,
  type StudioDraft,
  type StudioTriplet,
} from '../theme/draft';
import type { ThemeCatalogRecord } from '../theme/schema';

interface ThemeStudioProps {
  draft: StudioDraft;
  records: ThemeCatalogRecord[];
  selectedRecord: ThemeCatalogRecord | null;
  onChange: (draft: StudioDraft) => void;
  onLoadTemplate: (record: ThemeCatalogRecord) => void;
  onReset: () => void;
  linkedProposal?: {
    proposalId: string;
    branchName: string;
    proposalMode: ProposalMode;
  } | null;
  editorUnlocked?: boolean;
  onUnlockEditor?: () => Promise<boolean>;
  onUpdateProposal?: (draft: StudioDraft, previewNode: HTMLElement) => Promise<ProposalUpdateResult>;
}

interface SubmitSuccessState {
  message: string;
  href?: string;
}

type StudioEditorTab = 'setup' | 'palette' | 'background' | 'audio' | 'publish';

const studioEditorTabs: Array<{ id: StudioEditorTab; label: string }> = [
  { id: 'setup', label: 'Setup' },
  { id: 'palette', label: 'Palette' },
  { id: 'background', label: 'Background' },
  { id: 'audio', label: 'Audio' },
  { id: 'publish', label: 'Publish' },
];

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="studio-field">
      <span className="studio-field__label">{label}</span>
      {children}
      {hint ? <small className="studio-field__hint">{hint}</small> : null}
    </label>
  );
}

function clampRgbChannel(value: number): number {
  if (Number.isNaN(value)) {
    return 0;
  }

  return Math.max(0, Math.min(255, Math.round(value)));
}

function RgbChannelInput({
  label,
  value,
  onChange,
  min = 0,
  max = 255,
  step = 1,
  disabled = false,
}: {
  label: 'R' | 'G' | 'B' | 'A';
  value: number;
  onChange?: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
}) {
  return (
    <label className="rgb-channel">
      <span>{label}</span>
      <input
        className="rgb-channel__input"
        type="number"
        inputMode={step < 1 ? 'decimal' : 'numeric'}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        value={value}
        onChange={(event) => onChange?.(clampRgbChannel(Number(event.currentTarget.value)))}
      />
    </label>
  );
}

function ColorEditor({
  title,
  triplet,
  onChange,
}: {
  title: string;
  triplet: StudioTriplet;
  onChange: (next: StudioTriplet) => void;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const wheelRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const hex = hslTripletToHex(triplet);
  const [red, green, blue] = hslTripletToRgb(triplet);
  const alpha = 1;
  const cursorAngle = triplet.h * Math.PI * 2;
  const cursorRadius = triplet.s * 42;
  const cursorX = 50 + Math.cos(cursorAngle) * cursorRadius;
  const cursorY = 50 + Math.sin(cursorAngle) * cursorRadius;

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    function onPointerDown(event: MouseEvent) {
      if (!editorRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen]);

  function patchRgb(index: 0 | 1 | 2, value: number) {
    const nextRgb: [number, number, number] = [red, green, blue];
    nextRgb[index] = clampRgbChannel(value);
    onChange(rgbToHslTriplet(nextRgb));
  }

  function updateFromWheel(clientX: number, clientY: number) {
    if (!wheelRef.current) {
      return;
    }

    const rect = wheelRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const deltaX = clientX - centerX;
    const deltaY = clientY - centerY;
    const maxRadius = rect.width / 2;
    const distance = Math.min(Math.hypot(deltaX, deltaY), maxRadius);
    const nextHue = ((Math.atan2(deltaY, deltaX) / (Math.PI * 2)) + 1) % 1;
    const nextSaturation = distance / maxRadius;

    onChange({
      ...triplet,
      h: nextHue,
      s: nextSaturation,
    });
  }

  return (
    <div className={`color-editor ${isOpen ? 'color-editor--open' : ''}`} ref={editorRef}>
      <div className="color-editor__header">
        <div className="color-editor__identity">
          <div className="color-editor__title">{title}</div>
          <div className="color-editor__token">{hex.toUpperCase()}</div>
          <div className="color-editor__rgb-token">RGBA {red}, {green}, {blue}, {alpha.toFixed(2)}</div>
        </div>

        <button
          className="color-editor__trigger"
          type="button"
          title={`Open ${title.toLowerCase()} color picker`}
          aria-haspopup="dialog"
          aria-expanded={isOpen}
          onClick={() => setIsOpen((open) => !open)}
        >
          <span className="color-editor__swatch-shell">
            <span className="color-editor__swatch" style={{ background: hex }} />
          </span>
        </button>
      </div>

      {isOpen ? (
        <div className="color-editor__popover" role="dialog" aria-label={`${title} color picker`}>
          <div className="color-editor__popover-header">
            <strong>{title}</strong>
            <span>Pick on the chromatic wheel or type exact RGBA values. Theme colors stay opaque, so alpha is fixed at 1.00.</span>
          </div>

          <div
            ref={wheelRef}
            className="color-editor__wheel"
            style={{
              ['--color-editor-lightness' as string]: `${Math.round(triplet.l * 100)}%`,
              ['--color-editor-cursor-x' as string]: `${cursorX}%`,
              ['--color-editor-cursor-y' as string]: `${cursorY}%`,
            }}
            onPointerDown={(event) => {
              event.preventDefault();
              event.currentTarget.setPointerCapture(event.pointerId);
              updateFromWheel(event.clientX, event.clientY);
            }}
            onPointerMove={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                updateFromWheel(event.clientX, event.clientY);
              }
            }}
            onPointerUp={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
              }
            }}
            onPointerCancel={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
              }
            }}
          >
            <span className="color-editor__wheel-cursor" />
          </div>

          <div className="color-editor__controls">
            <div className="color-editor__rgb-header">
              <span>RGBA</span>
              <small>{`rgba(${red}, ${green}, ${blue}, ${alpha.toFixed(2)})`}</small>
            </div>
            <div className="color-editor__rgb-grid">
              <RgbChannelInput label="R" value={red} onChange={(value) => patchRgb(0, value)} />
              <RgbChannelInput label="G" value={green} onChange={(value) => patchRgb(1, value)} />
              <RgbChannelInput label="B" value={blue} onChange={(value) => patchRgb(2, value)} />
              <RgbChannelInput label="A" value={alpha} min={0} max={1} step={0.01} disabled />
            </div>
            <div className="color-editor__rgb-header">
              <span>Hex</span>
              <small>Optional direct entry</small>
            </div>
            <input
              className="studio-input color-editor__hex-input"
              value={hex.toUpperCase()}
              onChange={(event) => {
                const next = hexToHslTriplet(event.currentTarget.value);
                if (next) {
                  onChange(next);
                }
              }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function ThemeStudio({
  draft,
  records,
  selectedRecord,
  onChange,
  onLoadTemplate,
  onReset,
  linkedProposal = null,
  editorUnlocked = false,
  onUnlockEditor,
  onUpdateProposal,
}: ThemeStudioProps) {
  const previewRef = useRef<HTMLDivElement>(null);
  const [activeEditorTab, setActiveEditorTab] = useState<StudioEditorTab>('setup');
  const [downloadingArchive, setDownloadingArchive] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [updatingProposal, setUpdatingProposal] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [archiveSuccess, setArchiveSuccess] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<SubmitSuccessState | null>(null);
  const [assetError, setAssetError] = useState<string | null>(null);
  const [backgroundOptimizing, setBackgroundOptimizing] = useState(false);
  const controlsLocked = Boolean(linkedProposal && (linkedProposal.proposalMode === 'preview' || !editorUnlocked));

  const hasProposalAssets = useMemo(() => {
    return Boolean(
      draft.background.image?.proposalReady ||
      draft.fonts.regular?.proposalReady ||
      draft.fonts.small?.proposalReady ||
      draft.audio.music?.proposalReady ||
      Object.values(draft.audio.sfx).some((asset) => asset?.proposalReady),
    );
  }, [draft]);

  function update(next: StudioDraft) {
    onChange(next);
    setAssetError(null);
    setArchiveError(null);
    setArchiveSuccess(null);
    setSubmitError(null);
    setSubmitSuccess(null);
  }

  async function handleUnlockEditor() {
    if (!onUnlockEditor) {
      setSubmitError('Editor unlock is not available for this proposal.');
      return false;
    }

    const unlocked = await onUnlockEditor();
    if (!unlocked) {
      setSubmitError('Editor token is required to update this linked proposal.');
      return false;
    }

    setSubmitError(null);
    return true;
  }

  function patch<K extends keyof StudioDraft>(key: K, value: StudioDraft[K]) {
    update({ ...cloneDraft(draft), [key]: value });
  }

  function patchDisplayName(name: string) {
    const next = cloneDraft(draft);
    const currentNameId = normalizeDraftId(draft.name);
    next.name = name;

    if (draft.proposalMode === 'create' && (!draft.id || draft.id === currentNameId)) {
      next.id = normalizeDraftId(name);
    }

    update(next);
  }

  function patchColor(key: keyof StudioDraft['colors'], triplet: StudioTriplet) {
    update({
      ...cloneDraft(draft),
      colors: {
        ...draft.colors,
        [key]: triplet,
      },
    });
  }

  function patchBackground<Key extends keyof StudioDraft['background']>(key: Key, value: StudioDraft['background'][Key]) {
    update({
      ...cloneDraft(draft),
      background: {
        ...draft.background,
        [key]: value,
      },
    });
  }

  async function onAssetUpload(field: 'background' | 'music' | 'regularFont' | 'smallFont', file: File | undefined) {
    if (!file) {
      return;
    }

    const safeName = file.name.replace(/\s+/g, '-');
    if (field === 'background') {
      setBackgroundOptimizing(true);
      setAssetError(null);
      try {
        const optimizedAsset = await createOptimizedBackgroundUploadAsset(file, 'media/backgrounds');
        patchBackground('image', optimizedAsset);
      } catch (cause) {
        setAssetError(cause instanceof Error ? cause.message : 'Unknown background conversion error');
      } finally {
        setBackgroundOptimizing(false);
      }
      return;
    }

    setAssetError(null);
    if (field === 'music') {
      update({
        ...cloneDraft(draft),
        audio: {
          ...draft.audio,
          bundled: true,
          music: createUploadAsset(file, `sounds/music/${safeName}`),
          sfx: { ...draft.audio.sfx },
        },
      });
      return;
    }

    const nextAsset = createUploadAsset(file, `fonts/${safeName}`);
    update({
      ...cloneDraft(draft),
      fonts: {
        ...draft.fonts,
        [field === 'regularFont' ? 'regular' : 'small']: nextAsset,
      },
    });
  }

  function onSfxUpload(name: DefaultSfxName, file: File | undefined) {
    if (!file) {
      return;
    }
    update({
      ...cloneDraft(draft),
      audio: {
        ...draft.audio,
        bundled: true,
        sfx: {
          ...draft.audio.sfx,
          [name]: createUploadAsset(file, `sounds/sfx/${name}.wav`),
        },
      },
    });
  }

  function onTemplateSelection(themeId: string) {
    if (!themeId) {
      setActiveEditorTab('setup');
      onReset();
      return;
    }

    const template = records.find((record) => record.entry.id === themeId);
    if (template) {
      setActiveEditorTab('setup');
      onLoadTemplate(template);
    }
  }

  async function handleSubmit() {
    if (!previewRef.current) {
      setSubmitError('The preview surface is not ready yet.');
      return;
    }

    if (linkedProposal) {
      if (linkedProposal.proposalMode !== 'edit') {
        setSubmitError('This PR link is in preview mode only. Use the edit link from the PR to save changes.');
        return;
      }

      if (!editorUnlocked) {
        const unlocked = await handleUnlockEditor();
        if (!unlocked) {
          return;
        }
      }

      if (!onUpdateProposal) {
        setSubmitError('Proposal update is not available in this environment.');
        return;
      }

      setUpdatingProposal(true);
      setSubmitError(null);
      setSubmitSuccess(null);
      try {
        const result = await onUpdateProposal(draft, previewRef.current);
        setSubmitSuccess({
          message: 'Linked proposal updated successfully.',
          href: result.editUrl ?? result.previewUrl,
        });
      } catch (cause) {
        setSubmitError(cause instanceof Error ? cause.message : 'Unknown proposal update error');
      } finally {
        setUpdatingProposal(false);
      }
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(null);
    try {
      const result = await submitThemeProposal(draft, previewRef.current);
      setSubmitSuccess({
        message: 'Pull request created.',
        href: result.pullRequestUrl,
      });
    } catch (cause) {
      setSubmitError(cause instanceof Error ? cause.message : 'Unknown submission error');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleArchiveDownload() {
    if (!previewRef.current) {
      setArchiveError('The preview surface is not ready yet.');
      return;
    }

    setDownloadingArchive(true);
    setArchiveError(null);
    setArchiveSuccess(null);
    try {
      await downloadDraftArchive(draft, previewRef.current);
      setArchiveSuccess('Local zip download started.');
    } catch (cause) {
      setArchiveError(cause instanceof Error ? cause.message : 'Unknown archive export error');
    } finally {
      setDownloadingArchive(false);
    }
  }

  return (
    <section className="studio-shell">
      <div className="studio-shell__header">
        <div>
          <p className="panel__eyebrow">Theme creator</p>
          <h2>Live theme studio</h2>
          <p className="studio-shell__lede">
            {linkedProposal
              ? `Linked to ${linkedProposal.proposalId} on ${linkedProposal.branchName}. Preview mode is public; saving edits stays locked behind your private editor token.`
              : draft.proposalMode === 'update'
                ? `Editing ${draft.id}. This will create a pull request that updates the existing catalog theme instead of adding a new folder.`
              : selectedRecord
                ? `Loaded from ${selectedRecord.entry.name}. Existing assets are previewable immediately; uploaded assets are the ones bundled into the generated proposal.`
                : 'Start from a blank theme and tune the SwitchU preview in real time.'}
          </p>
        </div>
        <div className="studio-shell__status">
          <span><Sparkles size={16} /> live preview</span>
          <span><Upload size={16} /> background + fonts + audio</span>
          <span><Send size={16} /> {linkedProposal ? 'PR linked' : 'PR ready'}</span>
        </div>
      </div>

      <div className="studio-layout">
        <div className="panel studio-panel studio-panel--preview">
          <div className="panel__header">
            <div>
              <p className="panel__eyebrow">SwitchU runtime replica</p>
              <h2>Preview</h2>
            </div>
          </div>
          <SwitchUPreview ref={previewRef} draft={draft} selectedRecord={selectedRecord} />
        </div>

        <div className="panel studio-panel studio-panel--controls">
          <div className="studio-editor-tabs" role="tablist" aria-label="Theme creator sections">
            {studioEditorTabs.map((tab) => (
              <button
                key={tab.id}
                className={`studio-editor-tab ${activeEditorTab === tab.id ? 'studio-editor-tab--active' : ''}`}
                type="button"
                role="tab"
                aria-selected={activeEditorTab === tab.id}
                onClick={() => setActiveEditorTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="studio-editor-view">
            {controlsLocked ? (
              <div className="studio-lock-overlay">
                <LockKeyhole size={22} />
                <strong>{linkedProposal?.proposalMode === 'edit' ? 'Editing is locked' : 'Preview-only link'}</strong>
                <span>
                  {linkedProposal?.proposalMode === 'edit'
                    ? 'Enter the private editor token to unlock changes and update the same PR branch.'
                    : 'This PR link only loads the draft for inspection. Use the edit link from the PR if you need to save changes.'}
                </span>
                {linkedProposal?.proposalMode === 'edit' ? (
                  <button className="submit-button submit-button--secondary" type="button" onClick={() => { void handleUnlockEditor(); }}>
                    <LockKeyhole size={18} />
                    <span>{editorUnlocked ? 'Editor unlocked' : 'Unlock editor'}</span>
                  </button>
                ) : null}
              </div>
            ) : null}

            {activeEditorTab === 'setup' ? (
              <>
                <div className="studio-control-section">
                  <div className="studio-control-section__title">Template</div>
                  <div className="studio-grid studio-grid--two">
                    <Field label="Base theme" hint="Start from blank or clone an existing theme into a new theme. Use Edit from the catalog to update an existing theme.">
                      <select
                        className="studio-input"
                        value={selectedRecord?.entry.id ?? ''}
                        onChange={(event) => onTemplateSelection(event.currentTarget.value)}
                      >
                        <option value="">Blank draft</option>
                        {records.map((record) => (
                          <option key={record.entry.id} value={record.entry.id}>
                            {record.entry.name} · {record.entry.author}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <div className="studio-template-card">
                      <strong>{selectedRecord ? selectedRecord.entry.name : 'Blank draft'}</strong>
                      <span>
                        {selectedRecord
                          ? draft.proposalMode === 'update'
                            ? `Editing the existing ${selectedRecord.entry.id} theme.`
                            : `Using ${selectedRecord.entry.id} as the current template.`
                          : 'No catalog template loaded. The editor is using a fresh draft.'}
                      </span>
                      <button className="ghost-button" type="button" onClick={() => {
                        setActiveEditorTab('setup');
                        onReset();
                      }}>Start blank draft</button>
                    </div>
                  </div>
                </div>

                <div className="studio-control-section">
                  <div className="studio-control-section__title">Metadata</div>
                  <div className="studio-grid studio-grid--two">
                    <Field
                      label="Theme ID"
                      hint={draft.proposalMode === 'update' ? 'Locked to the existing theme folder.' : 'Lowercase + hyphens. This becomes the folder name.'}
                    >
                      <input
                        className="studio-input"
                        value={draft.id}
                        disabled={draft.proposalMode === 'update'}
                        onChange={(event) => patch('id', normalizeDraftId(event.currentTarget.value))}
                      />
                    </Field>
                    <Field label="Version">
                      <input className="studio-input" value={draft.version} onChange={(event) => patch('version', event.currentTarget.value)} />
                    </Field>
                    <Field label="Display name">
                      <input className="studio-input" value={draft.name} onChange={(event) => patchDisplayName(event.currentTarget.value)} />
                    </Field>
                    <Field label="Author">
                      <input className="studio-input" value={draft.author} onChange={(event) => patch('author', event.currentTarget.value)} />
                    </Field>
                    <Field label="PR title">
                      <input className="studio-input" value={draft.summary} onChange={(event) => patch('summary', event.currentTarget.value)} />
                    </Field>
                    <Field label="Contributor handle">
                      <input className="studio-input" value={draft.contributor} onChange={(event) => patch('contributor', event.currentTarget.value)} placeholder="optional GitHub username" />
                    </Field>
                  </div>
                  <Field label="PR notes">
                    <textarea className="studio-textarea" rows={4} value={draft.notes} onChange={(event) => patch('notes', event.currentTarget.value)} />
                  </Field>
                </div>
              </>
            ) : null}

            {activeEditorTab === 'palette' ? (
              <div className="studio-control-section">
                <div className="studio-control-section__title">Palette</div>
                <div className="studio-grid studio-grid--palette">
                  <ColorEditor title="Cursor" triplet={draft.colors.cursor} onChange={(next) => patchColor('cursor', next)} />
                  <ColorEditor title="Accent" triplet={draft.colors.accent} onChange={(next) => patchColor('accent', next)} />
                  <ColorEditor title="Background" triplet={draft.colors.background} onChange={(next) => patchColor('background', next)} />
                  <ColorEditor title="Background Accent" triplet={draft.colors.backgroundAccent} onChange={(next) => patchColor('backgroundAccent', next)} />
                  <ColorEditor title="Shapes" triplet={draft.colors.shapes} onChange={(next) => patchColor('shapes', next)} />
                </div>
              </div>
            ) : null}

            {activeEditorTab === 'background' ? (
              <div className="studio-control-section">
                <div className="studio-control-section__title">Background</div>
                <div className="studio-grid studio-grid--three">
                  <Field label="Mode">
                    <select className="studio-input" value={draft.mode} onChange={(event) => patch('mode', event.currentTarget.value as StudioDraft['mode'])}>
                      <option value="dark">dark</option>
                      <option value="light">light</option>
                    </select>
                  </Field>
                  <Field label="Layout">
                    <select className="studio-input" value={draft.background.layout} onChange={(event) => patchBackground('layout', event.currentTarget.value as StudioDraft['background']['layout'])}>
                      <option value="grid">grid</option>
                      <option value="floating">floating</option>
                    </select>
                  </Field>
                  <Field label="Shape">
                    <select className="studio-input" value={draft.background.shape} onChange={(event) => patchBackground('shape', event.currentTarget.value as StudioDraft['background']['shape'])}>
                      <option value="mixed">mixed</option>
                      <option value="circle">circle</option>
                      <option value="triangle">triangle</option>
                      <option value="square">square</option>
                      <option value="diamond">diamond</option>
                      <option value="hexagon">hexagon</option>
                    </select>
                  </Field>
                  <Field label="Symmetry">
                    <select className="studio-input" value={draft.background.symmetry} onChange={(event) => patchBackground('symmetry', event.currentTarget.value as StudioDraft['background']['symmetry'])}>
                      <option value="none">none</option>
                      <option value="horizontal">horizontal</option>
                      <option value="vertical">vertical</option>
                      <option value="quad">quad</option>
                    </select>
                  </Field>
                  <Field label="Count">
                    <input className="studio-input" type="number" value={draft.background.count} onChange={(event) => patchBackground('count', Number(event.currentTarget.value))} />
                  </Field>
                  <Field label="Roundness">
                    <input className="studio-input" type="number" min={0} max={1} step={0.01} value={draft.background.roundness} onChange={(event) => patchBackground('roundness', Number(event.currentTarget.value))} />
                  </Field>
                  <Field label="Grid columns">
                    <input className="studio-input" type="number" value={draft.background.columns} onChange={(event) => patchBackground('columns', Number(event.currentTarget.value))} />
                  </Field>
                  <Field label="Grid rows">
                    <input className="studio-input" type="number" value={draft.background.rows} onChange={(event) => patchBackground('rows', Number(event.currentTarget.value))} />
                  </Field>
                  <Field label="Spacing X">
                    <input className="studio-input" type="number" value={draft.background.spacingX} onChange={(event) => patchBackground('spacingX', Number(event.currentTarget.value))} />
                  </Field>
                  <Field label="Spacing Y">
                    <input className="studio-input" type="number" value={draft.background.spacingY} onChange={(event) => patchBackground('spacingY', Number(event.currentTarget.value))} />
                  </Field>
                  <Field label="Size min">
                    <input className="studio-input" type="number" value={draft.background.sizeMin} onChange={(event) => patchBackground('sizeMin', Number(event.currentTarget.value))} />
                  </Field>
                  <Field label="Size max">
                    <input className="studio-input" type="number" value={draft.background.sizeMax} onChange={(event) => patchBackground('sizeMax', Number(event.currentTarget.value))} />
                  </Field>
                  <Field label="Speed min">
                    <input className="studio-input" type="number" value={draft.background.speedMin} onChange={(event) => patchBackground('speedMin', Number(event.currentTarget.value))} />
                  </Field>
                  <Field label="Speed max">
                    <input className="studio-input" type="number" value={draft.background.speedMax} onChange={(event) => patchBackground('speedMax', Number(event.currentTarget.value))} />
                  </Field>
                  <Field label="Wobble">
                    <input className="studio-input" type="number" value={draft.background.wobble} onChange={(event) => patchBackground('wobble', Number(event.currentTarget.value))} />
                  </Field>
                  <Field label="Rotation speed">
                    <input className="studio-input" type="number" step={0.01} value={draft.background.rotationSpeed} onChange={(event) => patchBackground('rotationSpeed', Number(event.currentTarget.value))} />
                  </Field>
                  <Field label="Opacity">
                    <input className="studio-input" type="number" step={0.01} min={0} max={1} value={draft.background.opacity} onChange={(event) => patchBackground('opacity', Number(event.currentTarget.value))} />
                  </Field>
                  <Field label="Image opacity">
                    <input className="studio-input" type="number" step={0.01} min={0} max={1} value={draft.background.imageOpacity} onChange={(event) => patchBackground('imageOpacity', Number(event.currentTarget.value))} />
                  </Field>
                  <Field label="Image fit">
                    <select className="studio-input" value={draft.background.imageFit} onChange={(event) => patchBackground('imageFit', event.currentTarget.value as 'cover' | 'contain')}>
                      <option value="cover">cover</option>
                      <option value="contain">contain</option>
                    </select>
                  </Field>
                </div>

                  {assetError ? <div className="submit-feedback submit-feedback--error">{assetError}</div> : null}

                <div className="studio-grid studio-grid--three studio-assets-row">
                    <Field
                      label="Background image"
                      hint={draft.background.image?.proposalReady
                        ? `${draft.background.image.name}${backgroundOptimizing ? ' · optimizing…' : ' · optimized PNG'}`
                        : backgroundOptimizing
                          ? 'Optimizing image for SwitchU…'
                          : 'PNG/JPG/WebP · auto-converted to PNG (max 1920px)'}
                    >
                      <input type="file" accept=".png,.jpg,.jpeg,.webp" disabled={backgroundOptimizing} onChange={(event) => { void onAssetUpload('background', event.currentTarget.files?.[0]); }} />
                  </Field>
                  <Field label="Regular font" hint={draft.fonts.regular?.proposalReady ? draft.fonts.regular.name : 'Optional TTF/OTF'}>
                      <input type="file" accept=".ttf,.otf,.woff,.woff2" onChange={(event) => { void onAssetUpload('regularFont', event.currentTarget.files?.[0]); }} />
                  </Field>
                  <Field label="Small font" hint={draft.fonts.small?.proposalReady ? draft.fonts.small.name : 'Optional secondary font'}>
                      <input type="file" accept=".ttf,.otf,.woff,.woff2" onChange={(event) => { void onAssetUpload('smallFont', event.currentTarget.files?.[0]); }} />
                  </Field>
                </div>
              </div>
            ) : null}

            {activeEditorTab === 'audio' ? (
              <div className="studio-control-section">
                <div className="studio-control-section__title">Audio</div>
                <div className="studio-grid studio-grid--two">
                  <Field label="Background music" hint={draft.audio.music?.proposalReady ? draft.audio.music.name : 'MP3 file copied into sounds/music'}>
                    <input type="file" accept=".mp3" onChange={(event) => { void onAssetUpload('music', event.currentTarget.files?.[0]); }} />
                  </Field>
                  <div className="audio-summary-card">
                    <Music4 size={18} />
                    <div>
                      <strong>{draft.audio.bundled || hasProposalAssets ? 'Bundled audio enabled' : 'Using built-in sound set'}</strong>
                      <span>Upload a music file and any subset of SwitchU `.wav` SFX overrides.</span>
                    </div>
                  </div>
                </div>

                {draft.audio.music?.url ? (
                  <audio className="audio-player" controls src={draft.audio.music.url} />
                ) : null}

                <div className="studio-grid studio-grid--three">
                  {DEFAULT_SFX_NAMES.map((name) => (
                    <Field key={name} label={name} hint={draft.audio.sfx[name]?.proposalReady ? draft.audio.sfx[name]?.name : `${name}.wav`}>
                      <input type="file" accept=".wav" onChange={(event) => onSfxUpload(name, event.currentTarget.files?.[0])} />
                    </Field>
                  ))}
                </div>
              </div>
            ) : null}

            {activeEditorTab === 'publish' ? (
              <div className="studio-control-section">
                <div className="studio-control-section__title">Submit</div>
                <div className="submit-card">
                  <p>
                    {linkedProposal
                      ? 'This linked PR keeps its editable draft snapshot on the proposal branch. Existing branch assets stay attached to the draft, and any new uploads replace the matching files when you save.'
                      : draft.proposalMode === 'update'
                        ? 'The PR payload will update the existing theme folder, refresh `theme.json`, replace the generated preview screenshot, and upload any newly selected assets.'
                        : 'The PR payload will include `theme.json`, a generated preview screenshot, and every uploaded asset. Catalog assets loaded from an existing theme stay available in the preview, but only uploaded files are bundled into the proposal.'}
                  </p>
                  <div className="submit-actions">
                    {linkedProposal?.proposalMode === 'preview' ? null : (
                      <button className="submit-button" type="button" disabled={submitting || downloadingArchive || updatingProposal} onClick={() => { void handleSubmit(); }}>
                        <Send size={18} />
                        <span>
                          {linkedProposal
                            ? updatingProposal
                              ? 'Updating linked proposal…'
                              : editorUnlocked
                                ? 'Update this linked proposal'
                                : 'Unlock and update linked proposal'
                            : submitting
                              ? 'Creating pull request…'
                              : draft.proposalMode === 'update'
                                ? 'Create update pull request'
                                : 'Create pull request from this draft'}
                        </span>
                      </button>
                    )}
                    <button className="submit-button submit-button--secondary" type="button" disabled={submitting || downloadingArchive} onClick={() => { void handleArchiveDownload(); }}>
                      <Download size={18} />
                      <span>{downloadingArchive ? 'Building local zip…' : 'Save this draft as a local zip'}</span>
                    </button>
                  </div>
                  {linkedProposal?.proposalMode === 'preview' ? (
                    <div className="submit-feedback submit-feedback--success">
                      This PR link is preview-only. Open the edit link from the PR to unlock branch updates.
                    </div>
                  ) : null}
                  {archiveError ? <div className="submit-feedback submit-feedback--error">{archiveError}</div> : null}
                  {archiveSuccess ? <div className="submit-feedback submit-feedback--success">{archiveSuccess}</div> : null}
                  {submitError ? <div className="submit-feedback submit-feedback--error">{submitError}</div> : null}
                  {submitSuccess ? (
                    <div className="submit-feedback submit-feedback--success">
                      {submitSuccess.message}
                      {submitSuccess.href ? <> <a href={submitSuccess.href} target="_blank" rel="noreferrer">{submitSuccess.href}</a></> : null}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
