import {
  Download,
  FileAudio2,
  FolderInput,
  Gamepad2,
  Grid3x3,
  ImageIcon,
  LockKeyhole,
  LogIn,
  Music4,
  Power,
  Send,
  Settings2,
  Smile,
  Sparkles,
  Type,
  Upload,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { loadIconCatalog, loadIconPackGlyphAssets } from '../catalog/api';
import { downloadDraftArchive, submitThemeProposal, type ProposalMode, type ProposalResult, type ProposalUpdateResult } from '../github/proposals';
import type { AuthUser } from '../github/auth';
import {
  LEFT_SIDEBAR_VISUAL,
  PACK_GLYPHS,
  RIGHT_SIDEBAR_VISUAL,
  glyphsInVisualOrder,
  type IconPackGlyph,
} from '../icons/pack';
import { themeInstallPath, themeShopInstallPath } from '../install/paths';
import { SwitchUPreview } from '../preview/SwitchUPreview';
import { hexToHslTriplet, hslTripletToHex, hslTripletToRgb, rgbToHslTriplet } from '../theme/color';
import {
  DEFAULT_SFX_NAMES,
  clampStudioBackground,
  cloneDraft,
  createOptimizedBackgroundUploadAsset,
  createUploadAsset,
  inferIconSource,
  normalizeDraftId,
  themeIconsPackId,
  type DefaultSfxName,
  type StudioAsset,
  type StudioDraft,
  type StudioTriplet,
} from '../theme/draft';
import { BACKGROUND_BOUNDS, draftSubmitIssues, normalizeFinite, normalizeInt, normalizeUnitInterval } from '../theme/normalize';
import { draftFromThemeZip } from '../theme/importZip';
import type { IconPackRecord, ThemeCatalogRecord } from '../theme/schema';

const THEME_EDITOR_GLYPHS: IconPackGlyph[] = [
  ...glyphsInVisualOrder(LEFT_SIDEBAR_VISUAL),
  ...glyphsInVisualOrder(RIGHT_SIDEBAR_VISUAL),
  ...PACK_GLYPHS.filter((glyph) => glyph.sidebar === 'chrome'),
];

const THEME_GLYPH_FALLBACKS: Record<string, typeof ImageIcon> = {
  'album.png': ImageIcon,
  'mii_editor.png': Smile,
  'settings.png': Settings2,
  'controller.png': Gamepad2,
  'power.png': Power,
  'themes.png': Grid3x3,
};

function themeGlyphFallback(glyph: IconPackGlyph) {
  return THEME_GLYPH_FALLBACKS[glyph.file] ?? ImageIcon;
}

function GlyphPreview({
  url,
  label,
  Fallback,
}: {
  url?: string;
  label: string;
  Fallback: typeof ImageIcon;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
  }, [url]);
  if (!url || failed) {
    return <Fallback size={28} />;
  }
  return (
    <img
      src={url}
      alt={label}
      onError={() => setFailed(true)}
    />
  );
}

function glyphFileName(asset: StudioAsset): string {
  return asset.relativePath.replace(/\\/g, '/').split('/').pop() ?? asset.name;
}

function findThemeGlyph(draft: StudioDraft, fileName: string): StudioAsset | undefined {
  return (draft.iconGlyphs ?? []).find((asset) => glyphFileName(asset) === fileName);
}

function withThemeGlyphs(
  draft: StudioDraft,
  glyphs: StudioAsset[],
  options: { iconSource?: 'none' | 'pack' | 'custom'; packId?: string } = {},
): StudioDraft {
  const next = cloneDraft(draft);
  next.iconGlyphs = glyphs;
  const iconSource = options.iconSource
    ?? (options.packId || themeIconsPackId(draft.icons)
      ? 'pack'
      : glyphs.length > 0
        ? 'custom'
        : 'none');
  next.iconSource = iconSource;

  if (iconSource === 'none') {
    next.icons = undefined;
    next.iconGlyphs = [];
    return next;
  }

  if (glyphs.length === 0) {
    next.icons = iconSource === 'pack' && (options.packId || themeIconsPackId(draft.icons))
      ? { path: 'assets/icons', packId: options.packId ?? themeIconsPackId(draft.icons) }
      : undefined;
    return next;
  }

  const packId = iconSource === 'pack' ? (options.packId ?? themeIconsPackId(draft.icons)) : undefined;
  next.icons = {
    path: 'assets/icons',
    files: glyphs.map((asset) => asset.relativePath.replace(/\\/g, '/')),
    ...(packId ? { packId } : {}),
  };
  return next;
}

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
  authUser?: AuthUser | null;
  editorUnlocked?: boolean;
  onLogin?: () => void;
  onUpdateProposal?: (draft: StudioDraft, previewNode: HTMLElement) => Promise<ProposalUpdateResult>;
  onProposalCreated?: (result: ProposalResult, draft: StudioDraft) => void;
}

interface SubmitSuccessState {
  message: string;
  href?: string;
}

type StudioEditorTab = 'setup' | 'palette' | 'background' | 'icons' | 'audio' | 'publish';

const studioEditorTabs: Array<{ id: StudioEditorTab; label: string }> = [
  { id: 'setup', label: 'Setup' },
  { id: 'palette', label: 'Palette' },
  { id: 'background', label: 'Background' },
  { id: 'icons', label: 'Icons' },
  { id: 'audio', label: 'Audio' },
  { id: 'publish', label: 'Publish' },
];

function Field({
  label,
  children,
  hint,
  span = false,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  span?: boolean;
}) {
  return (
    <label className={`studio-field${span ? ' studio-field--span' : ''}`}>
      <span className="studio-field__label">{label}</span>
      {children}
      {hint ? <small className="studio-field__hint">{hint}</small> : null}
    </label>
  );
}

function UnitSlider({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  const safe = normalizeUnitInterval(value, 0);
  const percent = `${Math.round(safe * 100)}%`;
  return (
    <Field label={label} hint={percent}>
      <div className="studio-slider">
        <input
          className="studio-slider__range"
          type="range"
          min={0}
          max={1}
          step={0.01}
          disabled={disabled}
          value={safe}
          aria-valuetext={percent}
          onChange={(event) => onChange(normalizeUnitInterval(Number(event.currentTarget.value), 0))}
        />
      </div>
    </Field>
  );
}

/** Bipolar slider: center = 0, left = reverse %, right = forward %. Maps ±100% onto [min, max]. */
function SignedPercentSlider({
  label,
  value,
  onChange,
  min,
  max,
  disabled = false,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  disabled?: boolean;
}) {
  const extent = Math.max(Math.abs(min), Math.abs(max)) || 1;
  const safe = normalizeFinite(value, min, max, 0);
  const percent = Math.round((safe / extent) * 100);
  const hint = `${percent}%`;
  return (
    <Field label={label} hint={hint}>
      <div className="studio-slider">
        <input
          className="studio-slider__range"
          type="range"
          min={-100}
          max={100}
          step={1}
          disabled={disabled}
          value={percent}
          aria-valuetext={hint}
          onChange={(event) => {
            const nextPercent = Number(event.currentTarget.value);
            onChange(normalizeFinite((nextPercent / 100) * extent, min, max, 0));
          }}
        />
      </div>
    </Field>
  );
}

function BoundNumber({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  integer = false,
  hint,
  disabled = false,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  integer?: boolean;
  hint?: string;
  disabled?: boolean;
}) {
  const safe = integer
    ? normalizeInt(value, min, max, min)
    : normalizeFinite(value, min, max, min);
  return (
    <Field label={label} hint={hint ?? `${min}–${max}`}>
      <input
        className="studio-input"
        type="number"
        inputMode={integer ? 'numeric' : 'decimal'}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        value={safe}
        onChange={(event) => {
          const raw = Number(event.currentTarget.value);
          onChange(integer ? normalizeInt(raw, min, max, min) : normalizeFinite(raw, min, max, min));
        }}
      />
    </Field>
  );
}

function StudioDropField({
  label,
  accept,
  icon: Icon,
  fileName,
  previewUrl,
  hint,
  dropHint = 'Drop file',
  buttonLabel = 'Upload',
  disabled = false,
  compact = false,
  onFile,
}: {
  label: string;
  accept: string;
  icon: typeof Upload;
  fileName?: string;
  previewUrl?: string;
  hint?: string;
  dropHint?: string;
  buttonLabel?: string;
  disabled?: boolean;
  compact?: boolean;
  onFile: (file: File | undefined) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const filled = Boolean(fileName || previewUrl);

  function acceptDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (disabled) {
      return;
    }
    setDragOver(false);
    onFile(event.dataTransfer.files?.[0]);
  }

  function onDragOver(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (disabled) {
      return;
    }
    setDragOver(true);
  }

  function onDragLeave(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
      return;
    }
    setDragOver(false);
  }

  return (
    <div
      className={[
        'studio-drop',
        compact ? 'studio-drop--compact' : '',
        filled ? 'studio-drop--filled' : '',
        dragOver ? 'studio-drop--dragover' : '',
        disabled ? 'studio-drop--disabled' : '',
      ].filter(Boolean).join(' ')}
      onDragEnter={onDragOver}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={acceptDrop}
    >
      <div className="studio-drop__label">{label}</div>
      <div className="studio-drop__zone">
        {previewUrl ? (
          <img className="studio-drop__preview" src={previewUrl} alt="" />
        ) : (
          <Icon size={compact ? 22 : 28} aria-hidden />
        )}
        <span className="studio-drop__drop-hint">{filled ? (fileName || 'Ready') : dropHint}</span>
      </div>
      {hint ? <small className="studio-drop__hint">{hint}</small> : null}
      <label className="ghost-button studio-drop__upload">
        <Upload size={15} />
        <span>{buttonLabel}</span>
        <input
          type="file"
          accept={accept}
          hidden
          disabled={disabled}
          onChange={(event) => {
            onFile(event.currentTarget.files?.[0]);
            event.currentTarget.value = '';
          }}
        />
      </label>
    </div>
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
  authUser = null,
  editorUnlocked = false,
  onLogin,
  onUpdateProposal,
  onProposalCreated,
}: ThemeStudioProps) {
  const previewRef = useRef<HTMLDivElement>(null);
  const [activeEditorTab, setActiveEditorTab] = useState<StudioEditorTab>('setup');
  const [downloadingArchive, setDownloadingArchive] = useState(false);
  const [importingZip, setImportingZip] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [updatingProposal, setUpdatingProposal] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [archiveSuccess, setArchiveSuccess] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<SubmitSuccessState | null>(null);
  const [assetError, setAssetError] = useState<string | null>(null);
  const [backgroundOptimizing, setBackgroundOptimizing] = useState(false);
  const [iconDragOverFile, setIconDragOverFile] = useState<string | null>(null);
  const [iconPacks, setIconPacks] = useState<IconPackRecord[]>([]);
  const [iconPacksLoading, setIconPacksLoading] = useState(false);
  const [iconPackApplying, setIconPackApplying] = useState(false);
  const controlsLocked = Boolean(linkedProposal && (linkedProposal.proposalMode === 'preview' || !editorUnlocked));

  const iconSource = inferIconSource(draft);
  const selectedIconPackId = themeIconsPackId(draft.icons) ?? '';
  const iconGlyphCount = draft.iconGlyphs?.length ?? 0;

  useEffect(() => {
    let cancelled = false;
    setIconPacksLoading(true);
    void loadIconCatalog()
      .then((packs) => {
        if (!cancelled) {
          setIconPacks(packs);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setIconPacks([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIconPacksLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const hasProposalAssets = useMemo(() => {
    return Boolean(
      draft.background.image?.proposalReady ||
      draft.fonts.regular?.proposalReady ||
      draft.fonts.small?.proposalReady ||
      draft.audio.music?.proposalReady ||
      Object.values(draft.audio.sfx).some((asset) => asset?.proposalReady) ||
      (draft.iconGlyphs ?? []).some((asset) => asset.proposalReady),
    );
  }, [draft]);

  function update(next: StudioDraft) {
    onChange(next);
    setAssetError(null);
    setArchiveError(null);
    setArchiveSuccess(null);
    setImportError(null);
    setImportSuccess(null);
    setSubmitError(null);
    setSubmitSuccess(null);
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
      background: clampStudioBackground({
        ...draft.background,
        [key]: value,
      }),
    });
  }

  async function onAssetUpload(
    field: 'background' | 'backgroundPortrait' | 'music' | 'regularFont' | 'smallFont',
    file: File | undefined,
  ) {
    if (!file) {
      return;
    }

    const safeName = file.name.replace(/\s+/g, '-');
    if (field === 'background' || field === 'backgroundPortrait') {
      setBackgroundOptimizing(true);
      setAssetError(null);
      try {
        const optimizedAsset = await createOptimizedBackgroundUploadAsset(file, 'media/backgrounds');
        patchBackground(field === 'background' ? 'image' : 'imagePortrait', optimizedAsset);
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

  function pickThemeIconPng(fileList: FileList | null | undefined): File | undefined {
    if (!fileList?.length) {
      return undefined;
    }
    return Array.from(fileList).find((file) => {
      const name = file.name.toLowerCase();
      return file.type === 'image/png' || name.endsWith('.png');
    });
  }

  function onThemeIconUpload(glyph: IconPackGlyph, file: File | undefined) {
    if (!file) {
      return;
    }
    const name = file.name.toLowerCase();
    if (file.type && file.type !== 'image/png' && !name.endsWith('.png')) {
      setAssetError(`${glyph.label} expects a .png file.`);
      return;
    }

    const relativePath = `assets/icons/${glyph.file}`;
    const remaining = (draft.iconGlyphs ?? []).filter((asset) => glyphFileName(asset) !== glyph.file);
    // Uploading a glyph always switches to custom (drops packId so Icon Shop can mirror).
    update(withThemeGlyphs(draft, [...remaining, createUploadAsset(file, relativePath)], { iconSource: 'custom' }));
  }

  function onThemeIconClear(glyph: IconPackGlyph) {
    const remaining = (draft.iconGlyphs ?? []).filter((asset) => glyphFileName(asset) !== glyph.file);
    update(withThemeGlyphs(draft, remaining, {
      iconSource: remaining.length === 0 ? 'none' : (iconSource === 'pack' ? 'pack' : 'custom'),
      packId: iconSource === 'pack' ? selectedIconPackId : undefined,
    }));
  }

  function onIconSourceChange(nextSource: 'none' | 'pack' | 'custom') {
    if (nextSource === 'none') {
      update(withThemeGlyphs(draft, [], { iconSource: 'none' }));
      return;
    }
    if (nextSource === 'custom') {
      // Start custom from empty slots — don't keep the previous shop pack's glyphs.
      update(withThemeGlyphs(draft, [], { iconSource: 'custom' }));
      return;
    }
    if (selectedIconPackId) {
      void onIconPackSelection(selectedIconPackId);
      return;
    }
    const next = cloneDraft(draft);
    next.iconSource = 'pack';
    next.iconGlyphs = [];
    next.icons = undefined;
    update(next);
  }

  async function onIconPackSelection(packId: string) {
    if (!packId) {
      update(withThemeGlyphs(draft, [], { iconSource: 'none' }));
      return;
    }
    const record = iconPacks.find((pack) => pack.entry.id === packId);
    if (!record) {
      setAssetError(`Icon pack “${packId}” is not in the catalog.`);
      return;
    }

    setIconPackApplying(true);
    setAssetError(null);
    try {
      const glyphs = await loadIconPackGlyphAssets(record);
      if (glyphs.length === 0) {
        setAssetError(`Could not load glyphs for “${record.entry.name}”.`);
        return;
      }
      update(withThemeGlyphs(draft, glyphs, { iconSource: 'pack', packId: record.entry.id }));
    } catch (cause) {
      setAssetError(cause instanceof Error ? cause.message : 'Failed to load icon pack.');
    } finally {
      setIconPackApplying(false);
    }
  }

  function onThemeIconDragOver(event: DragEvent<HTMLElement>, glyph: IconPackGlyph) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setIconDragOverFile(glyph.file);
  }

  function onThemeIconDragLeave(event: DragEvent<HTMLElement>, glyph: IconPackGlyph) {
    const next = event.relatedTarget as Node | null;
    if (next && event.currentTarget.contains(next)) {
      return;
    }
    setIconDragOverFile((current) => (current === glyph.file ? null : current));
  }

  function onThemeIconDrop(event: DragEvent<HTMLElement>, glyph: IconPackGlyph) {
    event.preventDefault();
    setIconDragOverFile(null);
    const file = pickThemeIconPng(event.dataTransfer.files);
    if (!file) {
      setAssetError(`Drop a .png onto ${glyph.label}.`);
      return;
    }
    onThemeIconUpload(glyph, file);
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

    const publishIssues = draftSubmitIssues(draft);
    if (publishIssues.length > 0) {
      setSubmitError(publishIssues[0] ?? 'Fix the theme details before submitting.');
      return;
    }

    // Re-clamp numerics so zip/import leftovers never leave the browser unnormalized.
    const publishDraft = cloneDraft(draft);
    publishDraft.background = clampStudioBackground(publishDraft.background);
    update(publishDraft);

    if (linkedProposal) {
      if (linkedProposal.proposalMode !== 'edit') {
        setSubmitError('This PR link is in preview mode only. Use the edit link from the PR to save changes.');
        return;
      }

      if (!editorUnlocked) {
        if (!authUser) {
          onLogin?.();
          setSubmitError('Sign in with GitHub to update this proposal.');
        } else {
          setSubmitError('You are not the author of this proposal.');
        }
        return;
      }

      if (!onUpdateProposal) {
        setSubmitError('Proposal update is not available in this environment.');
        return;
      }

      setUpdatingProposal(true);
      setSubmitError(null);
      setSubmitSuccess(null);
      try {
        const result = await onUpdateProposal(publishDraft, previewRef.current);
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

    if (!authUser) {
      onLogin?.();
      setSubmitError('Sign in with GitHub to submit a theme.');
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(null);
    try {
      const result = await submitThemeProposal(publishDraft, previewRef.current);
      onProposalCreated?.(result, publishDraft);
      setSubmitSuccess({
        message: 'Pull request created.',
        href: result.editUrl ?? result.pullRequestUrl,
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
      setArchiveSuccess(
        `Local zip download started. Extract it to ${themeInstallPath(draft.id || 'my-theme')} on your SD card `
        + `(or ${themeShopInstallPath(draft.id || 'my-theme')}).`,
      );
    } catch (cause) {
      setArchiveError(cause instanceof Error ? cause.message : 'Unknown archive export error');
    } finally {
      setDownloadingArchive(false);
    }
  }

  async function handleZipImport(file: File | undefined) {
    if (!file) {
      return;
    }

    setImportingZip(true);
    setImportError(null);
    setImportSuccess(null);
    try {
      const imported = await draftFromThemeZip(file);
      update(imported);
      setActiveEditorTab('setup');
      const importedIcons = imported.iconGlyphs?.length ?? 0;
      setImportSuccess(
        importedIcons > 0
          ? `Imported “${imported.name}” from ${file.name} (${importedIcons} icon${importedIcons === 1 ? '' : 's'} - edit under Icons). Draft autosave will keep it for 24 hours.`
          : `Imported “${imported.name}” from ${file.name}. Draft autosave will keep it for 24 hours.`,
      );
    } catch (cause) {
      setImportError(cause instanceof Error ? cause.message : 'Unknown zip import error');
    } finally {
      setImportingZip(false);
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
              ? `Linked to ${linkedProposal.proposalId} on ${linkedProposal.branchName}. Preview is public; saving edits requires signing in with the GitHub account that opened the PR.`
              : draft.proposalMode === 'update'
                ? `Editing ${draft.id}. This will create a pull request that updates the existing catalog theme instead of adding a new folder.`
              : selectedRecord
                ? `Loaded from ${selectedRecord.entry.name}. Existing assets are previewable immediately; uploaded assets are the ones bundled into the generated proposal.`
                : 'Start from a blank theme and tune the SwitchU preview in real time.'}
          </p>
        </div>
        <div className="studio-shell__status">
          <span><Sparkles size={16} /> live preview</span>
          <span><Upload size={16} /> background + icons + fonts + audio</span>
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
                <strong>
                  {linkedProposal?.proposalMode === 'edit'
                    ? authUser
                      ? 'Not the author'
                      : 'Sign in to edit'
                    : 'Preview-only link'}
                </strong>
                <span>
                  {linkedProposal?.proposalMode === 'edit'
                    ? authUser
                      ? 'Only the proposal author can update this PR branch.'
                      : 'Sign in with GitHub to edit this proposal.'
                    : 'This PR link only loads the draft for inspection. Exit to return Theme creator to a blank draft, or use the edit link from the PR to save changes.'}
                </span>
                {linkedProposal?.proposalMode === 'edit' && !authUser ? (
                  <button className="submit-button submit-button--secondary" type="button" onClick={onLogin}>
                    <LogIn size={18} />
                    <span>Sign in with GitHub</span>
                  </button>
                ) : null}
                {linkedProposal ? (
                  <button className="submit-button submit-button--secondary" type="button" onClick={onReset}>
                    <X size={18} />
                    <span>Exit linked draft</span>
                  </button>
                ) : null}
              </div>
            ) : null}

            {activeEditorTab === 'setup' ? (
              <>
                <div className="studio-control-section">
                  <div className="studio-control-section__title">Template</div>
                  <div className="studio-grid studio-grid--two">
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
                  </div>
                  {!linkedProposal ? (
                    <div className="studio-import-drop">
                      <StudioDropField
                        label="Import a theme zip"
                        accept=".zip,application/zip"
                        icon={FolderInput}
                        dropHint="Drop theme zip"
                        buttonLabel={importingZip ? 'Importing…' : 'Upload zip'}
                        hint="Restores settings + assets into this editor."
                        disabled={importingZip}
                        onFile={(file) => { void handleZipImport(file); }}
                      />
                      {importError ? <div className="submit-feedback submit-feedback--error">{importError}</div> : null}
                      {importSuccess ? <div className="submit-feedback submit-feedback--success">{importSuccess}</div> : null}
                    </div>
                  ) : null}
                </div>

                <div className="studio-control-section">
                  <div className="studio-control-section__title">Metadata</div>
                  <div className="studio-grid studio-grid--metadata">
                    <Field label="Display name">
                      <input className="studio-input" value={draft.name} onChange={(event) => patchDisplayName(event.currentTarget.value)} />
                    </Field>
                    <Field label="Author">
                      <input className="studio-input" value={draft.author} onChange={(event) => patch('author', event.currentTarget.value)} />
                    </Field>
                    <Field
                      label="Theme ID"
                      hint={draft.proposalMode === 'update' ? 'Locked to the existing theme folder.' : 'Lowercase + hyphens. Becomes folder name.'}
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
                    <Field label="PR title">
                      <input className="studio-input" value={draft.summary} onChange={(event) => patch('summary', event.currentTarget.value)} />
                    </Field>
                    <Field label="Contributor handle">
                      <input className="studio-input" value={draft.contributor} onChange={(event) => patch('contributor', event.currentTarget.value)} placeholder="optional GitHub username" />
                    </Field>
                    <Field span label="PR notes" hint="Optional context for reviewers.">
                      <textarea className="studio-textarea" rows={4} value={draft.notes} onChange={(event) => patch('notes', event.currentTarget.value)} />
                    </Field>
                  </div>
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
                  <BoundNumber
                    label="Count"
                    integer
                    min={BACKGROUND_BOUNDS.count.min}
                    max={BACKGROUND_BOUNDS.count.max}
                    value={draft.background.count}
                    onChange={(value) => patchBackground('count', value)}
                    disabled={controlsLocked}
                  />
                  <UnitSlider
                    label="Roundness"
                    value={draft.background.roundness}
                    onChange={(value) => patchBackground('roundness', value)}
                    disabled={controlsLocked}
                  />
                  <BoundNumber
                    label="Grid columns"
                    integer
                    min={BACKGROUND_BOUNDS.columns.min}
                    max={BACKGROUND_BOUNDS.columns.max}
                    value={draft.background.columns}
                    onChange={(value) => patchBackground('columns', value)}
                    hint="1–32"
                    disabled={controlsLocked}
                  />
                  <BoundNumber
                    label="Grid rows"
                    integer
                    min={BACKGROUND_BOUNDS.rows.min}
                    max={BACKGROUND_BOUNDS.rows.max}
                    value={draft.background.rows}
                    onChange={(value) => patchBackground('rows', value)}
                    disabled={controlsLocked}
                  />
                  <BoundNumber
                    label="Spacing X"
                    min={BACKGROUND_BOUNDS.spacing.min}
                    max={BACKGROUND_BOUNDS.spacing.max}
                    value={draft.background.spacingX}
                    onChange={(value) => patchBackground('spacingX', value)}
                    disabled={controlsLocked}
                  />
                  <BoundNumber
                    label="Spacing Y"
                    min={BACKGROUND_BOUNDS.spacing.min}
                    max={BACKGROUND_BOUNDS.spacing.max}
                    value={draft.background.spacingY}
                    onChange={(value) => patchBackground('spacingY', value)}
                    disabled={controlsLocked}
                  />
                  <BoundNumber
                    label="Size min"
                    min={BACKGROUND_BOUNDS.size.min}
                    max={BACKGROUND_BOUNDS.size.max}
                    value={draft.background.sizeMin}
                    onChange={(value) => patchBackground('sizeMin', value)}
                    disabled={controlsLocked}
                  />
                  <BoundNumber
                    label="Size max"
                    min={BACKGROUND_BOUNDS.size.min}
                    max={BACKGROUND_BOUNDS.size.max}
                    value={draft.background.sizeMax}
                    onChange={(value) => patchBackground('sizeMax', value)}
                    disabled={controlsLocked}
                  />
                  <BoundNumber
                    label="Speed min"
                    min={BACKGROUND_BOUNDS.speed.min}
                    max={BACKGROUND_BOUNDS.speed.max}
                    step={0.05}
                    value={draft.background.speedMin}
                    onChange={(value) => patchBackground('speedMin', value)}
                    disabled={controlsLocked}
                  />
                  <BoundNumber
                    label="Speed max"
                    min={BACKGROUND_BOUNDS.speed.min}
                    max={BACKGROUND_BOUNDS.speed.max}
                    step={0.05}
                    value={draft.background.speedMax}
                    onChange={(value) => patchBackground('speedMax', value)}
                    disabled={controlsLocked}
                  />
                  <BoundNumber
                    label="Wobble"
                    min={BACKGROUND_BOUNDS.wobble.min}
                    max={BACKGROUND_BOUNDS.wobble.max}
                    step={0.1}
                    value={draft.background.wobble}
                    onChange={(value) => patchBackground('wobble', value)}
                    disabled={controlsLocked}
                  />
                  <SignedPercentSlider
                    label="Rotation speed"
                    min={BACKGROUND_BOUNDS.rotationSpeed.min}
                    max={BACKGROUND_BOUNDS.rotationSpeed.max}
                    value={draft.background.rotationSpeed}
                    onChange={(value) => patchBackground('rotationSpeed', value)}
                    disabled={controlsLocked}
                  />
                  <UnitSlider
                    label="Opacity"
                    value={draft.background.opacity}
                    onChange={(value) => patchBackground('opacity', value)}
                    disabled={controlsLocked}
                  />
                  <UnitSlider
                    label="Image opacity"
                    value={draft.background.imageOpacity}
                    onChange={(value) => patchBackground('imageOpacity', value)}
                    disabled={controlsLocked}
                  />
                  <Field label="Image fit">
                    <select className="studio-input" value={draft.background.imageFit} onChange={(event) => patchBackground('imageFit', event.currentTarget.value as 'cover' | 'contain')}>
                      <option value="cover">cover</option>
                      <option value="contain">contain</option>
                    </select>
                  </Field>
                </div>

                  {assetError ? <div className="submit-feedback submit-feedback--error">{assetError}</div> : null}

                <div className="studio-grid studio-grid--three studio-assets-row">
                  <StudioDropField
                    label="Background image"
                    accept=".png,.jpg,.jpeg,.webp"
                    icon={ImageIcon}
                    dropHint="Drop image"
                    buttonLabel={backgroundOptimizing ? 'Optimizing…' : draft.background.image?.proposalReady ? 'Replace' : 'Upload'}
                    fileName={draft.background.image?.proposalReady ? draft.background.image.name : undefined}
                    previewUrl={draft.background.image?.url}
                    hint={
                      draft.background.image?.proposalReady
                        ? (backgroundOptimizing ? 'Optimizing…' : 'Optimized PNG')
                        : backgroundOptimizing
                          ? 'Optimizing…'
                          : 'PNG/JPG/WebP'
                    }
                    disabled={backgroundOptimizing}
                    onFile={(file) => { void onAssetUpload('background', file); }}
                  />
                  <StudioDropField
                    label="Portrait / Flip-Grip background"
                    accept=".png,.jpg,.jpeg,.webp"
                    icon={ImageIcon}
                    dropHint="Drop image"
                    buttonLabel={backgroundOptimizing ? 'Optimizing…' : draft.background.imagePortrait?.proposalReady ? 'Replace' : 'Upload'}
                    fileName={draft.background.imagePortrait?.proposalReady ? draft.background.imagePortrait.name : undefined}
                    previewUrl={draft.background.imagePortrait?.url}
                    hint={
                      draft.background.imagePortrait?.proposalReady
                        ? (backgroundOptimizing ? 'Optimizing…' : 'Used in Flip-Grip')
                        : backgroundOptimizing
                          ? 'Optimizing…'
                          : '(Optional)'
                    }
                    disabled={backgroundOptimizing}
                    onFile={(file) => { void onAssetUpload('backgroundPortrait', file); }}
                  />
                  <StudioDropField
                    label="Regular font"
                    accept=".ttf,.otf,.woff,.woff2"
                    icon={Type}
                    dropHint="Drop font"
                    buttonLabel={draft.fonts.regular?.proposalReady ? 'Replace' : 'Upload'}
                    fileName={draft.fonts.regular?.proposalReady ? draft.fonts.regular.name : undefined}
                    hint={draft.fonts.regular?.proposalReady ? draft.fonts.regular.name : 'Optional TTF/OTF'}
                    onFile={(file) => { void onAssetUpload('regularFont', file); }}
                  />
                  <StudioDropField
                    label="Small font"
                    accept=".ttf,.otf,.woff,.woff2"
                    icon={Type}
                    dropHint="Drop font"
                    buttonLabel={draft.fonts.small?.proposalReady ? 'Replace' : 'Upload'}
                    fileName={draft.fonts.small?.proposalReady ? draft.fonts.small.name : undefined}
                    hint={draft.fonts.small?.proposalReady ? draft.fonts.small.name : 'Optional TTF/OTF'}
                    onFile={(file) => { void onAssetUpload('smallFont', file); }}
                  />
                </div>
              </div>
            ) : null}

            {activeEditorTab === 'icons' ? (
              <div className="studio-control-section">
                <div className="studio-control-section__title">Sidebar icons</div>
                <p className="studio-control-section__subtitle">
                  Optional HOME menu glyphs. Use an Icon Shop pack (ships with the theme, no shop duplicate)
                  or upload your own (auto-listed in Icon Shop on publish).
                </p>

                <Field
                  label="Icon source"
                  hint={
                    iconSource === 'pack'
                      ? 'Console applies this pack when the theme is installed.'
                      : iconSource === 'custom'
                        ? 'Custom glyphs ship with the theme and appear in Icon Shop.'
                        : 'Leave empty to keep the console default icons.'
                  }
                >
                  <select
                    className="studio-input"
                    value={iconSource}
                    disabled={controlsLocked || iconPackApplying}
                    onChange={(event) => onIconSourceChange(event.currentTarget.value as 'none' | 'pack' | 'custom')}
                  >
                    <option value="none">None (console defaults)</option>
                    <option value="pack">Icon Shop pack…</option>
                    <option value="custom">Custom uploads</option>
                  </select>
                </Field>

                {iconSource === 'pack' ? (
                  <Field
                    label="Icon Shop pack"
                    hint={iconPacksLoading ? 'Loading packs…' : iconPackApplying ? 'Copying pack glyphs into this theme…' : 'Copied into assets/icons for first install; packId avoids a duplicate listing.'}
                  >
                    <select
                      className="studio-input"
                      value={selectedIconPackId}
                      disabled={controlsLocked || iconPacksLoading || iconPackApplying}
                      onChange={(event) => { void onIconPackSelection(event.currentTarget.value); }}
                    >
                      <option value="">Select a pack…</option>
                      {iconPacks.map((pack) => (
                        <option key={pack.entry.id} value={pack.entry.id}>
                          {pack.entry.name} · {pack.entry.author || 'Unknown'}
                          {pack.entry.builtin ? ' (builtin)' : ''}
                        </option>
                      ))}
                    </select>
                  </Field>
                ) : null}

                {assetError ? <div className="submit-feedback submit-feedback--error">{assetError}</div> : null}

                {iconSource !== 'none' ? (
                  <>
                    {iconSource === 'pack' && iconGlyphCount > 0 ? (
                      <p className="studio-control-section__subtitle">
                        Preview of <code>{selectedIconPackId}</code> ({iconGlyphCount} glyphs). Switch to Custom to edit individual slots.
                      </p>
                    ) : null}
                    <div className={`icon-glyph-grid${iconSource === 'pack' ? ' icon-glyph-grid--readonly' : ''}`}>
                      {THEME_EDITOR_GLYPHS.map((glyph) => {
                        const entry = findThemeGlyph(draft, glyph.file);
                        const Fallback = themeGlyphFallback(glyph);
                        const isDragOver = iconSource === 'custom' && iconDragOverFile === glyph.file;
                        const packMode = iconSource === 'pack';
                        return (
                          <div
                            className={`icon-glyph-card ${entry ? 'icon-glyph-card--filled' : 'icon-glyph-card--empty'} ${isDragOver ? 'icon-glyph-card--dragover' : ''}`}
                            key={glyph.file}
                            onDragEnter={packMode ? undefined : (event) => onThemeIconDragOver(event, glyph)}
                            onDragOver={packMode ? undefined : (event) => onThemeIconDragOver(event, glyph)}
                            onDragLeave={packMode ? undefined : (event) => onThemeIconDragLeave(event, glyph)}
                            onDrop={packMode ? undefined : (event) => onThemeIconDrop(event, glyph)}
                          >
                            <div className="icon-glyph-card__preview">
                              <GlyphPreview url={entry?.url} label={glyph.label} Fallback={Fallback} />
                              {!entry && !packMode ? <span className="icon-glyph-card__drop-hint">Drop PNG</span> : null}
                            </div>
                            <div className="icon-glyph-card__body">
                              <strong>{glyph.label}</strong>
                              <span className="icon-glyph-card__file">{glyph.file}</span>
                            </div>
                            {packMode ? null : (
                              <div className={`icon-glyph-card__actions${entry ? ' icon-glyph-card__actions--filled' : ''}`}>
                                <label className="ghost-button icon-glyph-card__upload">
                                  <Upload size={15} />
                                  <span>{entry ? 'Replace' : 'Upload'}</span>
                                  <input
                                    type="file"
                                    accept=".png,image/png"
                                    hidden
                                    disabled={controlsLocked}
                                    onChange={(event) => onThemeIconUpload(glyph, event.currentTarget.files?.[0])}
                                  />
                                </label>
                                {entry ? (
                                  <button
                                    className="ghost-button icon-glyph-card__clear"
                                    type="button"
                                    disabled={controlsLocked}
                                    onClick={() => onThemeIconClear(glyph)}
                                    title={`Remove ${glyph.label}`}
                                  >
                                    <X size={15} />
                                  </button>
                                ) : null}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </>
                ) : null}
              </div>
            ) : null}

            {activeEditorTab === 'audio' ? (
              <div className="studio-control-section">
                <div className="studio-control-section__title">Audio</div>
                <p className="studio-control-section__subtitle">
                  {draft.audio.bundled || hasProposalAssets
                    ? 'Bundled audio enabled - uploads ship with the theme.'
                    : 'Using built-in sounds. Upload music or any SFX you want to override.'}
                </p>

                <div className="studio-audio-music">
                  <StudioDropField
                    label="Background music"
                    accept=".mp3,audio/mpeg"
                    icon={Music4}
                    dropHint="Drop MP3"
                    buttonLabel={draft.audio.music?.proposalReady ? 'Replace' : 'Upload'}
                    fileName={draft.audio.music?.proposalReady ? draft.audio.music.name : undefined}
                    hint={draft.audio.music?.proposalReady ? draft.audio.music.name : 'Copied into sounds/music'}
                    onFile={(file) => { void onAssetUpload('music', file); }}
                  />
                  {draft.audio.music?.url ? (
                    <audio className="audio-player" controls src={draft.audio.music.url} />
                  ) : null}
                </div>

                <div className="studio-control-section__title studio-control-section__title--sub">SFX overrides</div>
                <p className="studio-control-section__subtitle">WAV only. Empty slots keep the console defaults.</p>
                <div className="studio-grid studio-grid--three studio-sfx-grid">
                  {DEFAULT_SFX_NAMES.map((name) => {
                    const asset = draft.audio.sfx[name];
                    return (
                      <StudioDropField
                        key={name}
                        compact
                        label={name}
                        accept=".wav,audio/wav"
                        icon={FileAudio2}
                        dropHint="Drop WAV"
                        buttonLabel={asset?.proposalReady ? 'Replace' : 'Upload'}
                        fileName={asset?.proposalReady ? asset.name : undefined}
                        hint={`${name}.wav`}
                        onFile={(file) => onSfxUpload(name, file)}
                      />
                    );
                  })}
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
                  {iconSource === 'pack' && selectedIconPackId ? (
                    <p>
                      Uses Icon Shop pack <code>{selectedIconPackId}</code>
                      {iconGlyphCount > 0 ? ` (${iconGlyphCount} glyphs bundled for first install)` : ''}.
                      The pack will not be re-listed.
                    </p>
                  ) : iconSource === 'custom' && iconGlyphCount > 0 ? (
                    <p>
                      {iconGlyphCount} custom sidebar icon{iconGlyphCount === 1 ? '' : 's'} will ship with the theme
                      and also appear in the Icon Shop (skipped if already listed).
                    </p>
                  ) : (
                    <p className="studio-field__hint">
                      No sidebar icons yet - pick an Icon Shop pack or upload custom PNGs under Icons.
                    </p>
                  )}
                  <div className="submit-actions">
                    {linkedProposal?.proposalMode === 'preview' ? null : (
                      <button className="submit-button" type="button" disabled={submitting || downloadingArchive || importingZip || updatingProposal} onClick={() => { void handleSubmit(); }}>
                        <Send size={18} />
                        <span>
                          {linkedProposal
                            ? updatingProposal
                              ? 'Updating linked proposal…'
                              : editorUnlocked
                                ? 'Update this linked proposal'
                                : 'Sign in as author to update'
                            : submitting
                              ? 'Creating pull request…'
                              : draft.proposalMode === 'update'
                                ? 'Create update pull request'
                                : 'Create pull request from this draft'}
                        </span>
                      </button>
                    )}
                    <button className="submit-button submit-button--secondary" type="button" disabled={submitting || downloadingArchive || importingZip} onClick={() => { void handleArchiveDownload(); }}>
                      <Download size={18} />
                      <span>{downloadingArchive ? 'Building local zip…' : 'Save this draft as a local zip'}</span>
                    </button>
                  </div>
                  <p className="studio-field__hint">
                    Manual install (1.4.1+): <code>{themeInstallPath(draft.id || 'my-theme')}</code>
                    {' '}Also valid: <code>{themeShopInstallPath(draft.id || 'my-theme')}</code>.
                    {' '}Zips include an INSTALL.txt with the same instructions.
                  </p>
                  {linkedProposal?.proposalMode === 'preview' ? (
                    <div className="submit-feedback submit-feedback--success">
                      This PR link is preview-only. Open the edit link from the PR, then sign in with the author GitHub account to save.
                    </div>
                  ) : null}
                  {archiveError ? <div className="submit-feedback submit-feedback--error">{archiveError}</div> : null}
                  {archiveSuccess ? <div className="submit-feedback submit-feedback--success">{archiveSuccess}</div> : null}
                  {importError ? <div className="submit-feedback submit-feedback--error">{importError}</div> : null}
                  {importSuccess ? <div className="submit-feedback submit-feedback--success">{importSuccess}</div> : null}
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
