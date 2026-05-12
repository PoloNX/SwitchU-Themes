export type ThemeMode = 'dark' | 'light';

export interface ThemeCatalogEntry {
  id: string;
  name: string;
  author: string;
  version: string;
  path: string;
  manifest: string;
  cover?: string;
}

export interface ThemeCatalog {
  schemaVersion: number;
  themes: ThemeCatalogEntry[];
}

export interface ThemePreviewConfig {
  screenshots?: string[];
}

export interface ThemeBackgroundImageConfig {
  path: string;
  opacity?: number;
  fit?: 'cover' | 'contain';
}

export interface ThemeBackgroundGridConfig {
  columns?: number;
  rows?: number;
  spacing?: [number, number];
}

export interface ThemeBackgroundConfig {
  image?: string | ThemeBackgroundImageConfig;
  layout?: 'floating' | 'grid';
  shape?: 'mixed' | 'circle' | 'triangle' | 'square' | 'diamond' | 'hexagon';
  symmetry?: 'none' | 'horizontal' | 'vertical' | 'quad';
  count?: number;
  fixedOrientation?: boolean;
  orientation?: number;
  roundness?: number;
  grid?: ThemeBackgroundGridConfig;
  size?: [number, number];
  speed?: [number, number];
  wobble?: number;
  rotationSpeed?: number;
  opacity?: number;
}

export interface ThemeFontsConfig {
  regular?: string;
  small?: string;
}

export interface ThemeIconsConfig {
  path?: string;
}

export interface ThemeColorConfig {
  cursor?: [number, number, number];
  accent?: [number, number, number];
  background?: [number, number, number];
  backgroundAccent?: [number, number, number];
  shapes?: [number, number, number];
}

export interface ThemeThemeConfig {
  mode?: ThemeMode;
  colors?: ThemeColorConfig;
  background?: ThemeBackgroundConfig;
  fonts?: ThemeFontsConfig;
  icons?: ThemeIconsConfig;
}

export interface ThemeAudioConfig {
  bundled?: boolean;
}

export interface ThemeManifest {
  id: string;
  name: string;
  author: string;
  version: string;
  preview?: ThemePreviewConfig;
  theme?: ThemeThemeConfig;
  audio?: ThemeAudioConfig;
}

export interface ThemeCatalogRecord {
  entry: ThemeCatalogEntry;
  manifest: ThemeManifest;
  manifestUrl: string;
  coverUrl?: string;
}
