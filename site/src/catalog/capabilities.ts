import type { ThemeCatalogRecord, ThemeManifest } from '../theme/schema';

export function themeDeclaresMusic(manifest: ThemeManifest): boolean {
  const music = manifest.audio?.music;
  if (typeof music === 'string' && music.trim()) return true;
  if (Array.isArray(music) && music.some((entry) => typeof entry === 'string' && entry.trim())) return true;
  return false;
}

export function themeDeclaresSounds(manifest: ThemeManifest): boolean {
  const sfx = manifest.audio?.sfx;
  return Boolean(sfx && typeof sfx === 'object' && Object.keys(sfx).length > 0);
}

export function themeDeclaresIcons(manifest: ThemeManifest): boolean {
  const icons = manifest.theme?.icons;
  return Boolean(icons?.path || icons?.basePath || icons?.base_path || (icons?.files && icons.files.length > 0));
}

export function themeCapabilities(record: ThemeCatalogRecord) {
  return {
    music: themeDeclaresMusic(record.manifest),
    sounds: themeDeclaresSounds(record.manifest),
    icons: themeDeclaresIcons(record.manifest),
  };
}
