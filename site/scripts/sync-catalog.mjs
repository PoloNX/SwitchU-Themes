import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const siteRoot = resolve(__dirname, '..');
const repoRoot = resolve(siteRoot, '..');
const publicCatalogRoot = resolve(siteRoot, 'public', 'catalog');

rmSync(publicCatalogRoot, { force: true, recursive: true });
mkdirSync(publicCatalogRoot, { recursive: true });

const entries = [
  ['index.json', 'index.json'],
  ['themes', 'themes'],
  ['templates', 'templates'],
];

function collectRelativeFiles(rootDir, currentDir = rootDir) {
  const entries = readdirSync(currentDir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const absolutePath = join(currentDir, entry.name);
    if (entry.isDirectory()) {
      return collectRelativeFiles(rootDir, absolutePath);
    }

    const relativePath = absolutePath.slice(rootDir.length + 1).replaceAll('\\', '/');
    return relativePath === 'file-index.json' ? [] : [relativePath];
  });
}

for (const [sourceName, destName] of entries) {
  const source = join(repoRoot, sourceName);
  const destination = join(publicCatalogRoot, destName);

  if (!existsSync(source)) {
    throw new Error(`Missing catalog source: ${source}`);
  }

  cpSync(source, destination, { recursive: true });
}

const themesRoot = join(publicCatalogRoot, 'themes');
for (const entry of readdirSync(themesRoot, { withFileTypes: true })) {
  if (!entry.isDirectory()) {
    continue;
  }

  const themeRoot = join(themesRoot, entry.name);
  const fileIndex = {
    files: collectRelativeFiles(themeRoot),
  };

  writeFileSync(join(themeRoot, 'file-index.json'), `${JSON.stringify(fileIndex, null, 2)}\n`);
}

console.log('Synced SwitchU theme catalog into site/public/catalog');
