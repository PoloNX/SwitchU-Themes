// Icon pack glyph definitions, matching SwitchU's romfs/icons/<pack>/ layout
// (see IconPackManager in the SwitchU repo: kPackGlyphFiles + shared chrome).

export interface IconPackGlyph {
  file: string; // filename inside icons/<pack>/
  label: string;
  sidebar: 'left' | 'right' | 'chrome';
}

// The six sidebar glyphs SwitchU reads from a pack, plus the shared chrome
// glyphs that fall back to the default pack when omitted.
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

export interface BuiltInPack {
  id: string;
  name: string;
  description: string;
}

// Built-in packs that ship with SwitchU. The workshop references these so
// users can see what a complete pack looks like, but the glyphs themselves
// live in the SwitchU repo (romfs/icons/<id>/).
export const BUILT_IN_PACKS: BuiltInPack[] = [
  {
    id: 'default',
    name: 'Default',
    description: 'The stock coloured glyphs that ship with SwitchU.',
  },
  {
    id: 'grayscale',
    name: 'Grayscale',
    description: 'Monochrome glyphs that adapt to the active theme chrome.',
  },
  {
    id: 'solid',
    name: 'Solid',
    description: 'Flat, solid monochrome glyphs.',
  },
  {
    id: 'tinted',
    name: 'Tinted',
    description: 'Coloured glyphs supporting a custom on-device HSL tint.',
  },
];

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
