// Icon pack glyph definitions, matching SwitchU's romfs/icons/<pack>/ layout
// (see IconPackManager in the SwitchU repo: kPackGlyphFiles + shared chrome).

export interface IconPackGlyph {
  file: string; // filename inside icons/<pack>/
  label: string;
  sidebar: 'left' | 'right' | 'chrome';
}

// The six sidebar glyphs SwitchU reads from a pack, plus the shared chrome
// glyphs that fall back to the default pack when omitted.
// Inventory / mosaic bake order (matches SwitchU IconPackManager kPackGlyphFiles).
// HOME visual stack order is separate — see LEFT/RIGHT_SIDEBAR_VISUAL below.
export const PACK_GLYPHS: IconPackGlyph[] = [
  { file: 'album.png', label: 'Album', sidebar: 'left' },
  { file: 'mii_editor.png', label: 'Mii Editor', sidebar: 'left' },
  { file: 'settings.png', label: 'Settings', sidebar: 'left' },
  { file: 'controller.png', label: 'Controllers', sidebar: 'right' },
  { file: 'power.png', label: 'Power', sidebar: 'right' },
  { file: 'themes.png', label: 'Theme Shop', sidebar: 'right' },
  { file: 'gamecard.png', label: 'Game Card', sidebar: 'chrome' },
  { file: 'change_view.png', label: 'Change View', sidebar: 'chrome' },
];

export const SIDEBAR_GLYPHS = PACK_GLYPHS.filter((glyph) => glyph.sidebar !== 'chrome');

/** Console HOME left stack, top → bottom (SidebarManager). */
export const LEFT_SIDEBAR_VISUAL: readonly string[] = [
  'album.png',
  'mii_editor.png',
  'settings.png',
];

/** Console HOME right stack, top → bottom: Controllers → Theme Shop → Power. */
export const RIGHT_SIDEBAR_VISUAL: readonly string[] = [
  'controller.png',
  'themes.png',
  'power.png',
];

export function glyphsInVisualOrder(files: readonly string[]): IconPackGlyph[] {
  return files.flatMap((file) => {
    const glyph = PACK_GLYPHS.find((entry) => entry.file === file);
    return glyph ? [glyph] : [];
  });
}

export function slugifyPackId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export interface PackGlyphFile {
  fileName: string;
  file: File;
}

export function packInstallPath(packId: string): string {
  return `sdmc:/switch/SwitchU/icons/${packId}/`;
}
