#!/usr/bin/env node
/**
 * Validates SwitchU theme/icon catalog assets before publish.
 * Checks: index integrity, manifest path existence, magic bytes, opacity range,
 * and icon-pack glyph lists.
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

const errors = [];
const seenBinaries = new Set();
const warnings = [];

function fail(message) {
  errors.push(message);
}

function warn(message) {
  warnings.push(message);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function listDirs(path) {
  if (!existsSync(path)) return [];
  return readdirSync(path, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

function collectFiles(rootDir, currentDir = rootDir) {
  if (!existsSync(currentDir)) return [];
  return readdirSync(currentDir, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = join(currentDir, entry.name);
    if (entry.isDirectory()) return collectFiles(rootDir, absolutePath);
    return [relative(rootDir, absolutePath).replaceAll('\\', '/')];
  });
}

function startsWith(bytes, signature) {
  if (bytes.length < signature.length) return false;
  return signature.every((value, index) => bytes[index] === value);
}

function isPng(bytes) {
  return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
}

function isJpeg(bytes) {
  return startsWith(bytes, [0xff, 0xd8, 0xff]);
}

function isWebp(bytes) {
  return startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && bytes.length >= 12
    && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
}

function isWav(bytes) {
  return startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && bytes.length >= 12
    && bytes[8] === 0x57 && bytes[9] === 0x41 && bytes[10] === 0x56 && bytes[11] === 0x45;
}

function isMp3(bytes) {
  if (startsWith(bytes, [0x49, 0x44, 0x33])) return true; // ID3
  // MPEG frame sync
  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return true;
  return false;
}

function isTtf(bytes) {
  return startsWith(bytes, [0x00, 0x01, 0x00, 0x00]) || startsWith(bytes, [0x4f, 0x54, 0x54, 0x4f]);
}

function isOtf(bytes) {
  return startsWith(bytes, [0x4f, 0x54, 0x54, 0x4f]);
}

function validateBinary(relPath) {
  if (seenBinaries.has(relPath)) return;
  seenBinaries.add(relPath);
  const absolute = join(repoRoot, relPath);
  if (!existsSync(absolute)) {
    fail(`Missing file: ${relPath}`);
    return;
  }

  const bytes = readFileSync(absolute);
  if (bytes.length === 0) {
    fail(`Empty file: ${relPath}`);
    return;
  }

  // Git LFS pointer
  const head = bytes.subarray(0, Math.min(bytes.length, 120)).toString('utf8');
  if (head.startsWith('version https://git-lfs.github.com/spec/v1')) {
    fail(`Git LFS pointer instead of real asset: ${relPath}`);
    return;
  }

  const lower = relPath.toLowerCase();
  if (lower.endsWith('.png') && !isPng(bytes)) fail(`Not a PNG: ${relPath}`);
  else if ((lower.endsWith('.jpg') || lower.endsWith('.jpeg')) && !isJpeg(bytes)) fail(`Not a JPEG: ${relPath}`);
  else if (lower.endsWith('.webp') && !isWebp(bytes)) fail(`Not a WebP: ${relPath}`);
  else if (lower.endsWith('.mp3') && !isMp3(bytes)) fail(`Not an MP3: ${relPath}`);
  else if (lower.endsWith('.wav') && !isWav(bytes)) fail(`Not a WAV: ${relPath}`);
  else if (lower.endsWith('.ttf') && !isTtf(bytes) && !isOtf(bytes)) fail(`Not a TTF/OTF: ${relPath}`);
  else if (lower.endsWith('.otf') && !isOtf(bytes) && !isTtf(bytes)) fail(`Not an OTF/TTF: ${relPath}`);
}

function normalizeOpacity(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return null;
  if (value >= 0 && value <= 1) return value;
  if (value > 1 && value <= 100) return value / 100;
  return 1;
}

function themeHasMusic(manifest, themeRoot) {
  const music = manifest.audio?.music;
  if (typeof music === 'string' && music) return true;
  if (Array.isArray(music) && music.length > 0) return true;
  const musicDir = join(themeRoot, 'sounds', 'music');
  return collectFiles(musicDir).some((file) => file.toLowerCase().endsWith('.mp3'));
}

function themeHasSfx(manifest, themeRoot) {
  const sfx = manifest.audio?.sfx;
  if (sfx && typeof sfx === 'object' && Object.keys(sfx).length > 0) return true;
  const sfxDir = join(themeRoot, 'sounds', 'sfx');
  return collectFiles(sfxDir).some((file) => file.toLowerCase().endsWith('.wav'));
}

function themeHasIcons(manifest, themeRoot) {
  const icons = manifest.theme?.icons;
  if (!icons) return false;
  if (icons.path || icons.basePath || icons.base_path) {
    const base = icons.path || icons.basePath || icons.base_path;
    return existsSync(join(themeRoot, base));
  }
  if (Array.isArray(icons.files) && icons.files.length > 0) return true;
  return false;
}

function validateTheme(themeId) {
  const themeRoot = join(repoRoot, 'themes', themeId);
  const manifestPath = join(themeRoot, 'theme.json');
  if (!existsSync(manifestPath)) {
    fail(`Theme folder missing theme.json: themes/${themeId}`);
    return;
  }

  let manifest;
  try {
    manifest = readJson(manifestPath);
  } catch (error) {
    fail(`Invalid JSON themes/${themeId}/theme.json: ${error.message}`);
    return;
  }

  if (manifest.id && manifest.id !== themeId) {
    fail(`Theme id mismatch: folder themes/${themeId} vs manifest id ${manifest.id}`);
  }

  const declaredPaths = new Set();
  for (const shot of manifest.preview?.screenshots ?? []) {
    if (typeof shot === 'string') declaredPaths.add(shot);
  }

  const image = manifest.theme?.background?.image;
  if (typeof image === 'string') declaredPaths.add(image);
  else if (image && typeof image === 'object' && typeof image.path === 'string') {
    declaredPaths.add(image.path);
    if (typeof image.opacity === 'number' && (image.opacity < 0 || image.opacity > 1)) {
      fail(`themes/${themeId}: background.image.opacity ${image.opacity} must be 0..1 (console clamps; use ${normalizeOpacity(image.opacity)})`);
    }
  }

  for (const font of [manifest.theme?.fonts?.regular, manifest.theme?.fonts?.small, manifest.theme?.font]) {
    if (typeof font === 'string' && font) declaredPaths.add(font);
  }

  const icons = manifest.theme?.icons;
  if (icons) {
    const base = icons.path || icons.basePath || icons.base_path;
    if (typeof base === 'string' && base) {
      const abs = join(themeRoot, base);
      if (!existsSync(abs)) fail(`themes/${themeId}: missing icons path ${base}`);
    }
    for (const file of icons.files ?? []) {
      if (typeof file === 'string' && file) declaredPaths.add(file);
    }
  }

  if (typeof manifest.audio?.music === 'string') declaredPaths.add(manifest.audio.music);
  if (Array.isArray(manifest.audio?.music)) {
    for (const file of manifest.audio.music) {
      if (typeof file === 'string' && file) declaredPaths.add(file);
    }
  }
  if (manifest.audio?.sfx && typeof manifest.audio.sfx === 'object') {
    for (const file of Object.values(manifest.audio.sfx)) {
      if (typeof file === 'string' && file) declaredPaths.add(file);
    }
  }

  for (const rel of declaredPaths) {
    const abs = join(themeRoot, rel);
    if (!existsSync(abs)) fail(`themes/${themeId}: missing declared asset ${rel}`);
    else validateBinary(`themes/${themeId}/${rel}`);
  }

  // Scan shipped audio/image binaries even if not declared.
  for (const rel of collectFiles(themeRoot)) {
    const lower = rel.toLowerCase();
    if (lower.endsWith('.mp3') || lower.endsWith('.wav') || lower.endsWith('.png')
      || lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.webp')
      || lower.endsWith('.ttf') || lower.endsWith('.otf')) {
      validateBinary(`themes/${themeId}/${rel}`);
    }
  }

  if (manifest.audio?.bundled && !themeHasMusic(manifest, themeRoot) && !themeHasSfx(manifest, themeRoot)) {
    fail(`themes/${themeId}: audio.bundled is true but no music/sfx assets found`);
  }

  // Duplicate SFX warning (identical payloads under different names).
  const sfxDir = join(themeRoot, 'sounds', 'sfx');
  if (existsSync(sfxDir)) {
    const hashes = new Map();
    for (const rel of collectFiles(sfxDir)) {
      if (!rel.toLowerCase().endsWith('.wav')) continue;
      const digest = createHash('sha256').update(readFileSync(join(sfxDir, rel))).digest('hex');
      const prior = hashes.get(digest);
      if (prior) warn(`themes/${themeId}: identical SFX files ${prior} and ${rel}`);
      else hashes.set(digest, rel);
    }
  }
}

function validateIconPack(packId) {
  const packRoot = join(repoRoot, 'icons', packId);
  const manifestPath = join(packRoot, 'pack.json');
  if (!existsSync(manifestPath)) {
    fail(`Icon pack missing pack.json: icons/${packId}`);
    return;
  }

  let manifest;
  try {
    manifest = readJson(manifestPath);
  } catch (error) {
    fail(`Invalid JSON icons/${packId}/pack.json: ${error.message}`);
    return;
  }

  if (manifest.id && manifest.id !== packId) {
    fail(`Icon pack id mismatch: folder icons/${packId} vs pack id ${manifest.id}`);
  }

  const glyphs = Array.isArray(manifest.glyphs) ? manifest.glyphs : [];
  if (glyphs.length === 0) warn(`icons/${packId}: glyphs list is empty`);

  for (const glyph of glyphs) {
    if (glyph === 'preview.png') {
      warn(`icons/${packId}: preview.png listed as a glyph (preview is not a sidebar icon)`);
    }
    const abs = join(packRoot, glyph);
    if (!existsSync(abs)) fail(`icons/${packId}: missing glyph ${glyph}`);
    else validateBinary(`icons/${packId}/${glyph}`);
  }

  if (manifest.preview) {
    const previewPath = join(packRoot, manifest.preview);
    if (!existsSync(previewPath)) fail(`icons/${packId}: missing preview ${manifest.preview}`);
    else validateBinary(`icons/${packId}/${manifest.preview}`);
  }

  for (const rel of collectFiles(packRoot)) {
    const lower = rel.toLowerCase();
    if (lower.endsWith('.png') || lower.endsWith('.webp') || lower.endsWith('.jpg') || lower.endsWith('.jpeg')) {
      validateBinary(`icons/${packId}/${rel}`);
    }
  }
}

function main() {
  const indexPath = join(repoRoot, 'index.json');
  if (!existsSync(indexPath)) {
    fail('Missing index.json');
  } else {
    const index = readJson(indexPath);
    if (!Array.isArray(index.themes)) fail('index.json: themes must be an array');
    if (!Array.isArray(index.icons)) fail('index.json: icons must be an array (publish icon packs for Theme Library → Icons)');

    const themeIds = new Set();
    for (const entry of index.themes ?? []) {
      if (!entry?.id) {
        fail('index.json: theme entry missing id');
        continue;
      }
      if (themeIds.has(entry.id)) fail(`index.json: duplicate theme id ${entry.id}`);
      themeIds.add(entry.id);
      if (!existsSync(join(repoRoot, entry.manifest ?? `themes/${entry.id}/theme.json`))) {
        fail(`index.json: missing manifest for ${entry.id}`);
      }
      if (entry.cover && !existsSync(join(repoRoot, entry.cover))) {
        fail(`index.json: missing cover for ${entry.id}: ${entry.cover}`);
      }
      validateTheme(entry.id);
    }

    for (const folder of listDirs(join(repoRoot, 'themes'))) {
      if (folder.startsWith('.')) continue;
      if (!themeIds.has(folder)) warn(`themes/${folder} exists on disk but is not listed in index.json`);
    }

    const iconIds = new Set();
    for (const entry of index.icons ?? []) {
      if (!entry?.id) {
        fail('index.json: icon entry missing id');
        continue;
      }
      if (iconIds.has(entry.id)) fail(`index.json: duplicate icon id ${entry.id}`);
      iconIds.add(entry.id);
      if (!existsSync(join(repoRoot, entry.manifest ?? `icons/${entry.id}/pack.json`))) {
        fail(`index.json: missing icon manifest for ${entry.id}`);
      }
      validateIconPack(entry.id);
    }

    for (const folder of listDirs(join(repoRoot, 'icons'))) {
      if (!iconIds.has(folder)) warn(`icons/${folder} exists on disk but is not listed in index.json`);
    }
  }

  if (warnings.length) {
    console.log(`Warnings (${warnings.length}):`);
    for (const message of warnings) console.log(`  - ${message}`);
  }

  if (errors.length) {
    console.error(`\nCatalog validation failed (${errors.length}):`);
    for (const message of errors) console.error(`  - ${message}`);
    process.exit(1);
  }

  console.log(`Catalog validation passed${warnings.length ? ` with ${warnings.length} warning(s)` : ''}.`);
}

main();
