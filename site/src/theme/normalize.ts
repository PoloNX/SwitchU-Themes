/** Shared Theme Studio / submit clamps so bad number fields never ship. */

export function normalizeUnitInterval(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) {
    return fallback;
  }
  if (n >= 0 && n <= 1) {
    return n;
  }
  // Common mistake: percent (50 → 0.5). Values above 100 collapse to 1.
  if (n > 1 && n <= 100) {
    return n / 100;
  }
  return Math.max(0, Math.min(1, n > 1 ? 1 : 0));
}

export function normalizeInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.round(n)));
}

export function normalizeFinite(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, n));
}

export interface BackgroundNumericFields {
  count: number;
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
}

export const BACKGROUND_BOUNDS = {
  count: { min: 1, max: 64, fallback: 24 },
  columns: { min: 1, max: 32, fallback: 16 },
  rows: { min: 1, max: 18, fallback: 9 },
  spacing: { min: 0, max: 400, fallback: 8 },
  size: { min: 1, max: 400, fallback: 48 },
  speed: { min: 0, max: 20, fallback: 1 },
  wobble: { min: 0, max: 40, fallback: 0 },
  rotationSpeed: { min: -2, max: 2, fallback: 0.04 },
} as const;

export function normalizeBackgroundNumerics(
  input: Partial<BackgroundNumericFields>,
): BackgroundNumericFields {
  let sizeMin = normalizeFinite(input.sizeMin, BACKGROUND_BOUNDS.size.min, BACKGROUND_BOUNDS.size.max, BACKGROUND_BOUNDS.size.fallback);
  let sizeMax = normalizeFinite(input.sizeMax, BACKGROUND_BOUNDS.size.min, BACKGROUND_BOUNDS.size.max, BACKGROUND_BOUNDS.size.fallback);
  if (sizeMin > sizeMax) {
    [sizeMin, sizeMax] = [sizeMax, sizeMin];
  }

  let speedMin = normalizeFinite(input.speedMin, BACKGROUND_BOUNDS.speed.min, BACKGROUND_BOUNDS.speed.max, BACKGROUND_BOUNDS.speed.fallback);
  let speedMax = normalizeFinite(input.speedMax, BACKGROUND_BOUNDS.speed.min, BACKGROUND_BOUNDS.speed.max, BACKGROUND_BOUNDS.speed.fallback);
  if (speedMin > speedMax) {
    [speedMin, speedMax] = [speedMax, speedMin];
  }

  return {
    count: normalizeInt(input.count, BACKGROUND_BOUNDS.count.min, BACKGROUND_BOUNDS.count.max, BACKGROUND_BOUNDS.count.fallback),
    roundness: normalizeUnitInterval(input.roundness, 0.35),
    columns: normalizeInt(input.columns, BACKGROUND_BOUNDS.columns.min, BACKGROUND_BOUNDS.columns.max, BACKGROUND_BOUNDS.columns.fallback),
    rows: normalizeInt(input.rows, BACKGROUND_BOUNDS.rows.min, BACKGROUND_BOUNDS.rows.max, BACKGROUND_BOUNDS.rows.fallback),
    spacingX: normalizeFinite(input.spacingX, BACKGROUND_BOUNDS.spacing.min, BACKGROUND_BOUNDS.spacing.max, BACKGROUND_BOUNDS.spacing.fallback),
    spacingY: normalizeFinite(input.spacingY, BACKGROUND_BOUNDS.spacing.min, BACKGROUND_BOUNDS.spacing.max, BACKGROUND_BOUNDS.spacing.fallback),
    sizeMin,
    sizeMax,
    speedMin,
    speedMax,
    wobble: normalizeFinite(input.wobble, BACKGROUND_BOUNDS.wobble.min, BACKGROUND_BOUNDS.wobble.max, BACKGROUND_BOUNDS.wobble.fallback),
    rotationSpeed: normalizeFinite(
      input.rotationSpeed,
      BACKGROUND_BOUNDS.rotationSpeed.min,
      BACKGROUND_BOUNDS.rotationSpeed.max,
      BACKGROUND_BOUNDS.rotationSpeed.fallback,
    ),
    opacity: normalizeUnitInterval(input.opacity, 0.82),
    imageOpacity: normalizeUnitInterval(input.imageOpacity, 0.24),
  };
}

const PLACEHOLDER_NAMES = new Set([
  'my theme',
  'new theme',
  'untitled',
  'theme',
  'test',
  'test theme',
]);

/** Soft publish checks — returns messages to block submit. */
export function draftSubmitIssues(draft: {
  id: string;
  name: string;
  author: string;
}): string[] {
  const issues: string[] = [];
  const name = draft.name.trim();
  const author = draft.author.trim();
  const id = draft.id.trim();

  if (!name) {
    issues.push('Add a theme name before submitting.');
  } else if (PLACEHOLDER_NAMES.has(name.toLowerCase())) {
    issues.push(`Pick a real display name (not “${name}”).`);
  }

  if (!author) {
    issues.push('Add an author name before submitting.');
  }

  if (!id || id === 'my-theme' || id === 'new-theme' || id === 'theme') {
    issues.push('Pick a unique theme id (not a placeholder like my-theme).');
  }

  return issues;
}
