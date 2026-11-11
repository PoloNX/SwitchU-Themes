import JSZip from 'jszip';
import {
  DEFAULT_SFX_NAMES,
  clampStudioBackground,
  createEmptyDraft,
  themeIconsPackId,
  type DefaultSfxName,
  type StudioAsset,
  type StudioDraft,
  type StudioTriplet,
} from './draft';
import type { ThemeBackgroundConfig, ThemeManifest, ThemeMode } from './schema';

function guessMime(relativePath: string): string {
  const lower = relativePath.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.mp3')) return 'audio/mpeg';
  if (lower.endsWith('.wav')) return 'audio/wav';
  if (lower.endsWith('.ttf')) return 'font/ttf';
  if (lower.endsWith('.otf')) return 'font/otf';
  if (lower.endsWith('.woff')) return 'font/woff';
  if (lower.endsWith('.woff2')) return 'font/woff2';
  if (lower.endsWith('.json')) return 'application/json';
  return 'application/octet-stream';
}

function toTriplet(value: [number, number, number] | undefined, fallback: StudioTriplet): StudioTriplet {
  if (!value) {
    return fallback;
  }
  return { h: value[0], s: value[1], l: value[2] };
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

function audioMusicPath(audio: ThemeManifest['audio']): string | undefined {
  const music = audio?.music;
  if (!music) {
    return undefined;
  }
  return Array.isArray(music) ? music[0] : music;
}

function normalizeZipPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.\//, '');
}

function findThemeJsonPath(paths: string[]): string | null {
  const normalized = paths.map(normalizeZipPath);
  const exact = normalized.find((path) => path === 'theme.json' || path.endsWith('/theme.json'));
  if (!exact) {
    return null;
  }

  // Prefer the shallowest theme.json (package root).
  return normalized
    .filter((path) => path === 'theme.json' || path.endsWith('/theme.json'))
    .sort((a, b) => a.split('/').length - b.split('/').length)[0] ?? exact;
}

function stripRootPrefix(path: string, themeJsonPath: string): string {
  const normalized = normalizeZipPath(path);
  const rootPrefix = themeJsonPath.includes('/')
    ? themeJsonPath.slice(0, themeJsonPath.lastIndexOf('/') + 1)
    : '';
  return rootPrefix && normalized.startsWith(rootPrefix)
    ? normalized.slice(rootPrefix.length)
    : normalized;
}

async function zipEntryToAsset(
  zip: JSZip,
  absolutePath: string,
  relativePath: string,
): Promise<StudioAsset | undefined> {
  const entry = zip.file(absolutePath);
  if (!entry || entry.dir) {
    return undefined;
  }

  const blob = await entry.async('blob');
  const mimeType = blob.type || guessMime(relativePath);
  const typedBlob = blob.type ? blob : new Blob([blob], { type: mimeType });
  const name = relativePath.split('/').pop() ?? relativePath;
  const file = new File([typedBlob], name, { type: mimeType });

  return {
    source: 'upload',
    name,
    url: URL.createObjectURL(typedBlob),
    relativePath,
    proposalReady: true,
    file,
  };
}

export async function draftFromThemeZip(file: File): Promise<StudioDraft> {
  const zip = await JSZip.loadAsync(file);
  const originalPaths = Object.keys(zip.files);
  const normalizedToOriginal = new Map(
    originalPaths.map((path) => [normalizeZipPath(path), path] as const),
  );
  const paths = [...normalizedToOriginal.keys()];
  const themeJsonPath = findThemeJsonPath(paths);
  if (!themeJsonPath) {
    throw new Error('No theme.json found in that zip. Export a SwitchU theme package and try again.');
  }

  const themeJsonOriginal = normalizedToOriginal.get(themeJsonPath) ?? themeJsonPath;
  const themeJsonFile = zip.file(themeJsonOriginal);
  if (!themeJsonFile) {
    throw new Error('Could not read theme.json from that zip.');
  }

  let manifest: ThemeManifest;
  try {
    manifest = JSON.parse(await themeJsonFile.async('string')) as ThemeManifest;
  } catch {
    throw new Error('theme.json in that zip is not valid JSON.');
  }

  if (!manifest || typeof manifest !== 'object' || !manifest.id || !manifest.name) {
    throw new Error('theme.json is missing required id/name fields.');
  }

  const absoluteByRelative = new Map<string, string>();
  for (const [normalized, original] of normalizedToOriginal) {
    const entry = zip.files[original];
    if (!entry || entry.dir) {
      continue;
    }
    const relative = stripRootPrefix(normalized, themeJsonPath);
    if (relative && relative !== 'theme.json' && !relative.startsWith('.switchu-studio')) {
      absoluteByRelative.set(relative, original);
    }
  }

  const resolveAsset = async (relativePath: string | undefined): Promise<StudioAsset | undefined> => {
    if (!relativePath?.trim()) {
      return undefined;
    }
    const trimmed = relativePath.trim().replace(/\\/g, '/');
    const absolute = absoluteByRelative.get(trimmed);
    if (!absolute) {
      return undefined;
    }
    return zipEntryToAsset(zip, absolute, trimmed);
  };

  const base = createEmptyDraft();
  const theme = manifest.theme;
  const colors = theme?.colors;
  const background = theme?.background;
  const fonts = theme?.fonts;

  const draft: StudioDraft = {
    ...base,
    proposalMode: 'create',
    basedOnThemeId: undefined,
    id: String(manifest.id),
    name: String(manifest.name),
    author: String(manifest.author ?? ''),
    version: String(manifest.version ?? '1.0.0'),
    summary: `Imported ${manifest.name}`,
    notes: '',
    contributor: '',
    mode: (theme?.mode === 'light' ? 'light' : 'dark') as ThemeMode,
    colors: {
      cursor: toTriplet(colors?.cursor, base.colors.cursor),
      accent: toTriplet(colors?.accent, base.colors.accent),
      background: toTriplet(colors?.background, base.colors.background),
      backgroundAccent: toTriplet(colors?.backgroundAccent, base.colors.backgroundAccent),
      shapes: toTriplet(colors?.shapes, base.colors.shapes),
    },
    background: {
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
      image: await resolveAsset(backgroundImagePath(background)),
    },
    fonts: {
      regular: await resolveAsset(fonts?.regular),
      small: await resolveAsset(fonts?.small),
    },
    icons: theme?.icons ? { ...theme.icons } : undefined,
    iconGlyphs: [],
    audio: {
      bundled: Boolean(manifest.audio?.bundled),
      music: await resolveAsset(audioMusicPath(manifest.audio)),
      sfx: {},
    },
  };

  const iconGlyphs: StudioAsset[] = [];
  for (const relative of absoluteByRelative.keys()) {
    const normalized = relative.replace(/\\/g, '/');
    if (!normalized.toLowerCase().startsWith('assets/icons/')) {
      continue;
    }
    if (!normalized.toLowerCase().endsWith('.png')) {
      continue;
    }
    const asset = await resolveAsset(normalized);
    if (asset) {
      iconGlyphs.push(asset);
    }
  }
  const packId = themeIconsPackId(theme?.icons);
  if (iconGlyphs.length > 0 || packId) {
    draft.iconGlyphs = iconGlyphs;
    draft.icons = {
      ...(theme?.icons ? { ...theme.icons } : {}),
      path: theme?.icons?.path ?? 'assets/icons',
      files: iconGlyphs.map((asset) => asset.relativePath.replace(/\\/g, '/')),
      ...(packId ? { packId } : {}),
    };
    draft.iconSource = packId ? 'pack' : iconGlyphs.length > 0 ? 'custom' : 'none';
  }

  const sfxEntries = await Promise.all(
    DEFAULT_SFX_NAMES.map(async (name) => {
      const path = manifest.audio?.sfx?.[name];
      const asset = await resolveAsset(path);
      return asset ? ([name, asset] as const) : null;
    }),
  );

  draft.audio.sfx = Object.fromEntries(
    sfxEntries.filter((entry): entry is readonly [DefaultSfxName, StudioAsset] => Boolean(entry)),
  ) as Partial<Record<DefaultSfxName, StudioAsset>>;

  if (draft.audio.music || Object.keys(draft.audio.sfx).length > 0) {
    draft.audio.bundled = true;
  }

  draft.background = clampStudioBackground(draft.background);
  return draft;
}
