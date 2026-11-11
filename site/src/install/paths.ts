/** Theme Shop / managed installs. Wins on id collision with the manual root. */
export const THEME_SHOP_INSTALL_ROOT = 'sdmc:/config/SwitchU/themes';

/**
 * Preferred manual drop folder (SwitchU 1.4.1+).
 * Same tree as icon packs under /switch/SwitchU.
 */
export const THEME_MANUAL_INSTALL_ROOT = 'sdmc:/switch/SwitchU/themes';

/** @deprecated Prefer THEME_MANUAL_INSTALL_ROOT for user-facing copy. */
export const THEME_INSTALL_ROOT = THEME_MANUAL_INSTALL_ROOT;

/** Standalone icon packs install here (different from themes). */
export const ICON_PACK_INSTALL_ROOT = 'sdmc:/switch/SwitchU/icons';

export function themeInstallPath(themeId: string): string {
  const id = themeId.trim() || '<theme-id>';
  return `${THEME_MANUAL_INSTALL_ROOT}/${id}/`;
}

export function themeShopInstallPath(themeId: string): string {
  const id = themeId.trim() || '<theme-id>';
  return `${THEME_SHOP_INSTALL_ROOT}/${id}/`;
}

export function themeInstallInstructions(themeId = '<theme-id>'): string {
  const folder = themeId.trim() || '<theme-id>';
  return [
    'SwitchU theme - manual install',
    '',
    '1. Unzip this archive on your computer.',
    `2. Copy the theme folder to ${THEME_MANUAL_INSTALL_ROOT}/${folder}/`,
    '   (SwitchU 1.4.1+; create the folders if they do not exist).',
    `   Also valid: ${THEME_SHOP_INSTALL_ROOT}/${folder}/`,
    '3. On the Switch, open SwitchU → Theme Shop and apply the theme from Installed.',
    '',
    `Theme Shop downloads install under ${THEME_SHOP_INSTALL_ROOT}/.`,
    'If the same theme id exists in both places, the Theme Shop (config) copy wins.',
    'The /switch/SwitchU/themes/ drop folder requires SwitchU 1.4.1 or newer.',
    `Icon packs are different: extract those to ${ICON_PACK_INSTALL_ROOT}/`,
    '',
  ].join('\n');
}
