import type { StudioDraft, StudioTriplet } from './draft';

export interface PreviewPalette {
  cursor: string;
  cursorGlow: string;
  accent: string;
  background: string;
  backgroundAccent: string;
  shape: string;
  textPrimary: string;
  textSecondary: string;
  panelBase: string;
  panelBorder: string;
  panelHighlight: string;
  pageDot: string;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function normalizeHue(value: number): number {
  const wrapped = value % 1;
  return wrapped < 0 ? wrapped + 1 : wrapped;
}

function hueToRgb(p: number, q: number, t: number): number {
  let normalized = t;
  if (normalized < 0) normalized += 1;
  if (normalized > 1) normalized -= 1;
  if (normalized < 1 / 6) return p + (q - p) * 6 * normalized;
  if (normalized < 1 / 2) return q;
  if (normalized < 2 / 3) return p + (q - p) * (2 / 3 - normalized) * 6;
  return p;
}

export function hslTripletToRgb(triplet: StudioTriplet): [number, number, number] {
  const h = normalizeHue(triplet.h);
  const s = clamp01(triplet.s);
  const l = clamp01(triplet.l);

  if (s === 0) {
    const channel = Math.round(l * 255);
    return [channel, channel, channel];
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;

  return [
    Math.round(hueToRgb(p, q, h + 1 / 3) * 255),
    Math.round(hueToRgb(p, q, h) * 255),
    Math.round(hueToRgb(p, q, h - 1 / 3) * 255),
  ];
}

export function rgbToHslTriplet(rgb: [number, number, number]): StudioTriplet {
  const [rawR, rawG, rawB] = rgb;
  const r = clamp01(rawR / 255);
  const g = clamp01(rawG / 255);
  const b = clamp01(rawB / 255);

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) * 0.5;

  if (max === min) {
    return { h: 0, s: 0, l: lightness };
  }

  const delta = max - min;
  const saturation = lightness > 0.5
    ? delta / (2 - max - min)
    : delta / (max + min);

  let hue = 0;
  if (max === r) {
    hue = (g - b) / delta + (g < b ? 6 : 0);
  } else if (max === g) {
    hue = (b - r) / delta + 2;
  } else {
    hue = (r - g) / delta + 4;
  }

  return {
    h: normalizeHue(hue / 6),
    s: clamp01(saturation),
    l: clamp01(lightness),
  };
}

export function hslTripletToCss(triplet: StudioTriplet, alpha = 1): string {
  const [r, g, b] = hslTripletToRgb(triplet);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function hslTripletToHex(triplet: StudioTriplet): string {
  const [r, g, b] = hslTripletToRgb(triplet);
  return `#${[r, g, b]
    .map((channel) => channel.toString(16).padStart(2, '0'))
    .join('')}`;
}

export function hexToHslTriplet(value: string): StudioTriplet | undefined {
  const match = /^#?([a-f0-9]{6})$/i.exec(value.trim());
  if (!match) {
    return undefined;
  }

  const hex = match[1];
  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);
  return rgbToHslTriplet([r, g, b]);
}

export function paletteFromDraft(draft: StudioDraft): PreviewPalette {
  const isLight = draft.mode === 'light';
  return {
    cursor: hslTripletToCss(draft.colors.cursor),
    cursorGlow: hslTripletToCss(draft.colors.cursor, isLight ? 0.22 : 0.16),
    accent: hslTripletToCss(draft.colors.accent),
    background: hslTripletToCss(draft.colors.background),
    backgroundAccent: hslTripletToCss(draft.colors.backgroundAccent),
    shape: hslTripletToCss(draft.colors.shapes, 0.12),
    textPrimary: isLight ? 'rgba(28, 34, 42, 0.96)' : 'rgba(248, 252, 255, 0.96)',
    textSecondary: isLight ? 'rgba(28, 34, 42, 0.66)' : 'rgba(238, 247, 252, 0.72)',
    panelBase: isLight ? 'rgba(255, 255, 255, 0.42)' : 'rgba(11, 18, 30, 0.38)',
    panelBorder: isLight ? 'rgba(255, 255, 255, 0.44)' : 'rgba(255, 255, 255, 0.16)',
    panelHighlight: isLight ? 'rgba(255, 255, 255, 0.62)' : 'rgba(255, 255, 255, 0.14)',
    pageDot: isLight ? 'rgba(35, 45, 52, 0.3)' : 'rgba(255, 255, 255, 0.2)',
  };
}
