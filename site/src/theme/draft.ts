import type {
  ThemeAudioConfig,
  ThemeBackgroundConfig,
  ThemeCatalogRecord,
  ThemeColorConfig,
  ThemeFontsConfig,
  ThemeManifest,
  ThemeMode,
} from './schema';
import { resolveThemeAssetUrl } from '../catalog/api';

export const DEFAULT_SFX_NAMES = [
  'activation',
  'confirm',
  'show_modal',
  'hide_modal',
  'navigation',
  'launch_game',
  'slider_up',
  'slider_down',
  'toggle_on',
  'toggle_off',
  'tab_transition',
  'volume',
] as const;

export type DefaultSfxName = (typeof DEFAULT_SFX_NAMES)[number];

export interface StudioTriplet {
  h: number;
  s: number;
  l: number;
}

export interface StudioAsset {
  source: 'catalog' | 'upload';
  name: string;
  url: string;
  relativePath: string;
  proposalReady: boolean;
  file?: File;
}

export interface StudioDraft {
  basedOnThemeId?: string;
  id: string;
  name: string;
  author: string;
  version: string;
  summary: string;
  notes: string;
  contributor: string;
  mode: ThemeMode;
  colors: {
    cursor: StudioTriplet;
    accent: StudioTriplet;
    background: StudioTriplet;
    backgroundAccent: StudioTriplet;
    shapes: StudioTriplet;
  };
  background: {
    layout: 'floating' | 'grid';
    shape: 'mixed' | 'circle' | 'triangle' | 'square' | 'diamond' | 'hexagon';
    symmetry: 'none' | 'horizontal' | 'vertical' | 'quad';
    count: number;
    fixedOrientation: boolean;
    orientation: number;
    roundness: number;
    columns: number;
    rows: number;
    spacingX: number;
    spacingY: number;
    sizeMin: number;
    sizeMax: number;
    speedMin: number;
    speedMax: number;
    wobble: number;
    rotationSpeed: number;
    opacity: number;
    imageOpacity: number;
    imageFit: 'cover' | 'contain';
    image?: StudioAsset;
  };
  fonts: {
    regular?: StudioAsset;
    small?: StudioAsset;
  };
  audio: {
    bundled: boolean;
    music?: StudioAsset;
    sfx: Partial<Record<DefaultSfxName, StudioAsset>>;
  };
}

function blankTriplet(h: number, s: number, l: number): StudioTriplet {
  return { h, s, l };
}

function toTriplet(value: [number, number, number] | undefined, fallback: StudioTriplet): StudioTriplet {
  if (!value) {
    return fallback;
  }

  return { h: value[0], s: value[1], l: value[2] };
}

function toCatalogAsset(record: ThemeCatalogRecord, relativePath: string | undefined): StudioAsset | undefined {
  if (!relativePath) {
    return undefined;
  }

  const trimmed = relativePath.trim();
  if (!trimmed) {
    return undefined;
  }

  return {
    source: 'catalog',
    name: trimmed.split('/').pop() ?? trimmed,
    url: resolveThemeAssetUrl(record, trimmed),
    relativePath: trimmed,
    proposalReady: false,
  };
}

function backgroundImagePath(background: ThemeBackgroundConfig | undefined): string | undefined {
  const image = background?.image;
  if (!image) {
    return undefined;
  }

  return typeof image === 'string' ? image : image.path;
}

function backgroundImageOpacity(background: ThemeBackgroundConfig | undefined): number {
  const image = background?.image;
  if (!image || typeof image === 'string') {
    return 0.24;
  }

  return typeof image.opacity === 'number' ? image.opacity : 0.24;
}

function backgroundImageFit(background: ThemeBackgroundConfig | undefined): 'cover' | 'contain' {
  const image = background?.image;
  if (!image || typeof image === 'string') {
    return 'cover';
  }

  return image.fit === 'contain' ? 'contain' : 'cover';
}

function slugifyThemeId(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function cloneSfxRecord(source?: Partial<Record<DefaultSfxName, StudioAsset>>): Partial<Record<DefaultSfxName, StudioAsset>> {
  return { ...(source ?? {}) };
}

export function createEmptyDraft(): StudioDraft {
  return {
    id: 'my-theme',
    name: 'My Theme',
    author: '',
    version: '1.0.0',
    summary: 'Add a new SwitchU theme',
    notes: '',
    contributor: '',
    mode: 'dark',
    colors: {
      cursor: blankTriplet(0.58, 0.9, 0.62),
      accent: blankTriplet(0.53, 0.8, 0.55),
      background: blankTriplet(0.58, 0.5, 0.08),
      backgroundAccent: blankTriplet(0.56, 0.55, 0.14),
      shapes: blankTriplet(0.56, 0.4, 0.3),
    },
    background: {
      layout: 'grid',
      shape: 'square',
      symmetry: 'quad',
      count: 72,
      fixedOrientation: true,
      orientation: 0,
      roundness: 0.18,
      columns: 16,
      rows: 9,
      spacingX: 74,
      spacingY: 74,
      sizeMin: 7,
      sizeMax: 12,
      speedMin: 0,
      speedMax: 0,
      wobble: 8,
      rotationSpeed: 0.04,
      opacity: 0.82,
      imageOpacity: 0.24,
      imageFit: 'cover',
    },
    fonts: {},
    audio: {
      bundled: false,
      sfx: {},
    },
  };
}

export function createUploadAsset(file: File, relativePath: string): StudioAsset {
  return {
    source: 'upload',
    name: file.name,
    url: URL.createObjectURL(file),
    relativePath,
    proposalReady: true,
    file,
  };
}

export function draftFromCatalogRecord(record: ThemeCatalogRecord): StudioDraft {
  const manifest = record.manifest;
  const theme = manifest.theme;
  const colors = theme?.colors;
  const background = theme?.background;
  const fonts = theme?.fonts;

  const base = createEmptyDraft();
  base.basedOnThemeId = record.entry.id;
  base.id = `${slugifyThemeId(record.entry.id)}-variant`;
  base.name = `${record.entry.name} Variant`;
  base.author = manifest.author;
  base.version = manifest.version;
  base.summary = `Add theme ${base.name}`;
  base.mode = theme?.mode ?? 'dark';
  base.colors = {
    cursor: toTriplet(colors?.cursor, base.colors.cursor),
    accent: toTriplet(colors?.accent, base.colors.accent),
    background: toTriplet(colors?.background, base.colors.background),
    backgroundAccent: toTriplet(colors?.backgroundAccent, base.colors.backgroundAccent),
    shapes: toTriplet(colors?.shapes, base.colors.shapes),
  };
  base.background = {
    layout: background?.layout ?? base.background.layout,
    shape: background?.shape ?? base.background.shape,
    symmetry: background?.symmetry ?? base.background.symmetry,
    count: background?.count ?? base.background.count,
    fixedOrientation: background?.fixedOrientation ?? base.background.fixedOrientation,
    orientation: background?.orientation ?? base.background.orientation,
    roundness: background?.roundness ?? base.background.roundness,
    columns: background?.grid?.columns ?? base.background.columns,
    rows: background?.grid?.rows ?? base.background.rows,
    spacingX: background?.grid?.spacing?.[0] ?? base.background.spacingX,
    spacingY: background?.grid?.spacing?.[1] ?? base.background.spacingY,
    sizeMin: background?.size?.[0] ?? base.background.sizeMin,
    sizeMax: background?.size?.[1] ?? base.background.sizeMax,
    speedMin: background?.speed?.[0] ?? base.background.speedMin,
    speedMax: background?.speed?.[1] ?? base.background.speedMax,
    wobble: background?.wobble ?? base.background.wobble,
    rotationSpeed: background?.rotationSpeed ?? base.background.rotationSpeed,
    opacity: background?.opacity ?? base.background.opacity,
    imageOpacity: backgroundImageOpacity(background),
    imageFit: backgroundImageFit(background),
    image: toCatalogAsset(record, backgroundImagePath(background)),
  };
  base.fonts = {
    regular: toCatalogAsset(record, fonts?.regular),
    small: toCatalogAsset(record, fonts?.small),
  };
  base.audio = {
    bundled: Boolean(manifest.audio?.bundled),
    sfx: {},
  };

  return base;
}

function serializeColors(colors: StudioDraft['colors']): ThemeColorConfig {
  return {
    cursor: [colors.cursor.h, colors.cursor.s, colors.cursor.l],
    accent: [colors.accent.h, colors.accent.s, colors.accent.l],
    background: [colors.background.h, colors.background.s, colors.background.l],
    backgroundAccent: [colors.backgroundAccent.h, colors.backgroundAccent.s, colors.backgroundAccent.l],
    shapes: [colors.shapes.h, colors.shapes.s, colors.shapes.l],
  };
}

function serializeBackground(draft: StudioDraft): ThemeBackgroundConfig {
  const background: ThemeBackgroundConfig = {
    layout: draft.background.layout,
    shape: draft.background.shape,
    symmetry: draft.background.symmetry,
    count: draft.background.count,
    fixedOrientation: draft.background.fixedOrientation,
    orientation: draft.background.orientation,
    roundness: draft.background.roundness,
    grid: {
      columns: draft.background.columns,
      rows: draft.background.rows,
      spacing: [draft.background.spacingX, draft.background.spacingY],
    },
    size: [draft.background.sizeMin, draft.background.sizeMax],
    speed: [draft.background.speedMin, draft.background.speedMax],
    wobble: draft.background.wobble,
    rotationSpeed: draft.background.rotationSpeed,
    opacity: draft.background.opacity,
  };

  if (draft.background.image?.proposalReady) {
    background.image = {
      path: draft.background.image.relativePath,
      opacity: draft.background.imageOpacity,
      fit: draft.background.imageFit,
    };
  }

  return background;
}

function serializeFonts(draft: StudioDraft): ThemeFontsConfig | undefined {
  const regular = draft.fonts.regular?.proposalReady ? draft.fonts.regular.relativePath : undefined;
  const small = draft.fonts.small?.proposalReady ? draft.fonts.small.relativePath : undefined;

  if (!regular && !small) {
    return undefined;
  }

  return {
    regular,
    small: small ?? regular,
  };
}

function serializeAudio(draft: StudioDraft): ThemeAudioConfig | undefined {
  const hasMusic = Boolean(draft.audio.music?.proposalReady);
  const hasSfx = Object.values(draft.audio.sfx).some((asset) => asset?.proposalReady);
  if (!draft.audio.bundled && !hasMusic && !hasSfx) {
    return undefined;
  }

  return { bundled: true };
}

export function buildManifestFromDraft(draft: StudioDraft): ThemeManifest {
  const manifest: ThemeManifest = {
    id: slugifyThemeId(draft.id),
    name: draft.name.trim(),
    author: draft.author.trim(),
    version: draft.version.trim(),
    preview: {
      screenshots: ['media/screenshots/00.png'],
    },
    theme: {
      mode: draft.mode,
      colors: serializeColors(draft.colors),
      background: serializeBackground(draft),
    },
  };

  const fonts = serializeFonts(draft);
  if (fonts) {
    manifest.theme!.fonts = fonts;
  }

  const audio = serializeAudio(draft);
  if (audio) {
    manifest.audio = audio;
  }

  return manifest;
}

export function cloneDraft(draft: StudioDraft): StudioDraft {
  return {
    ...draft,
    colors: {
      cursor: { ...draft.colors.cursor },
      accent: { ...draft.colors.accent },
      background: { ...draft.colors.background },
      backgroundAccent: { ...draft.colors.backgroundAccent },
      shapes: { ...draft.colors.shapes },
    },
    background: { ...draft.background },
    fonts: { ...draft.fonts },
    audio: {
      ...draft.audio,
      sfx: cloneSfxRecord(draft.audio.sfx),
    },
  };
}

export function normalizeDraftId(value: string): string {
  return slugifyThemeId(value);
}
