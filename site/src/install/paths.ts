/** Manual + Theme Shop theme packages currently install here. */
export const THEME_INSTALL_ROOT = 'sdmc:/config/SwitchU/themes';

/** Standalone icon packs install here (different from themes). */
export const ICON_PACK_INSTALL_ROOT = 'sdmc:/switch/SwitchU/icons';

export function themeInstallPath(themeId: string): string {
  const id = themeId.trim() || '<theme-id>';
  return `${THEME_INSTALL_ROOT}/${id}/`;
}

export function themeInstallInstructions(themeId = '<theme-id>'): string {
  const folder = themeId.trim() || '<theme-id>';
  return [
    'SwitchU theme — manual install',
    '',
    '1. Unzip this archive on your computer.',
    `2. Copy the theme folder to ${THEME_INSTALL_ROOT}/${folder}/`,
    '   (create the folders if they do not exist).',
    '3. On the Switch, open SwitchU → Theme Shop and apply the theme from Installed.',
    '',
    'Theme Shop downloads also use this same config path.',
    `Icon packs are different: extract those to ${ICON_PACK_INSTALL_ROOT}/`,
    '',
  ].join('\n');
}
