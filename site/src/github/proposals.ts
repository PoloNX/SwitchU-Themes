import JSZip from 'jszip';
import { toBlob } from 'html-to-image';
import {
  DEFAULT_SFX_NAMES,
  buildManifestFromDraft,
  type DefaultSfxName,
  type StudioAsset,
  type StudioDraft,
} from '../theme/draft';

export interface ProposalResult {
  pullRequestUrl: string;
  branchName: string;
}

function themeRoot(id: string): string {
  return `themes/${id}`;
}

function buildProposalPayload(draft: StudioDraft) {
  const manifest = buildManifestFromDraft(draft);
  const id = manifest.id;

  return {
    id,
    name: manifest.name,
    manifest,
    catalogEntry: {
      id,
      name: manifest.name,
      author: manifest.author,
      version: manifest.version,
      path: themeRoot(id),
      manifest: `${themeRoot(id)}/theme.json`,
      cover: `${themeRoot(id)}/media/screenshots/00.png`,
    },
    prTitle: draft.summary.trim() || `Add theme ${manifest.name}`,
    prBody: [
      `Theme proposal submitted from SwitchU Themes Studio.`,
      '',
      `Theme: ${manifest.name}`,
      `Author: ${manifest.author}`,
      draft.contributor ? `Contributor: ${draft.contributor}` : '',
      draft.notes.trim() ? '' : '',
      draft.notes.trim(),
    ].filter(Boolean).join('\n'),
    files: {
      previewScreenshot: 'media/screenshots/00.png',
      backgroundImage: draft.background.image?.proposalReady ? draft.background.image.relativePath : undefined,
      regularFont: draft.fonts.regular?.proposalReady ? draft.fonts.regular.relativePath : undefined,
      smallFont: draft.fonts.small?.proposalReady ? draft.fonts.small.relativePath : undefined,
      music: draft.audio.music?.proposalReady ? draft.audio.music.relativePath : undefined,
      sfx: Object.fromEntries(
        DEFAULT_SFX_NAMES.flatMap((name) => {
          const asset = draft.audio.sfx[name];
          return asset?.proposalReady ? [[name, asset.relativePath]] : [];
        }),
      ) as Partial<Record<DefaultSfxName, string>>,
    },
  };
}

function buildArchiveManifest(draft: StudioDraft) {
  const manifest = buildManifestFromDraft(draft);

  if (draft.background.image) {
    manifest.theme ??= {};
    manifest.theme.background ??= {};
    manifest.theme.background.image = {
      path: draft.background.image.relativePath,
      opacity: draft.background.imageOpacity,
      fit: draft.background.imageFit,
    };
  }

  const regularFont = draft.fonts.regular?.relativePath;
  const smallFont = draft.fonts.small?.relativePath;
  if (regularFont || smallFont) {
    manifest.theme ??= {};
    manifest.theme.fonts = {
      regular: regularFont,
      small: smallFont ?? regularFont,
    };
  }

  return manifest;
}

async function capturePreviewBlob(previewNode: HTMLElement): Promise<Blob> {
  const previewBlob = await toBlob(previewNode, {
    cacheBust: true,
    pixelRatio: 2,
    backgroundColor: '#0a121c',
  });

  if (!previewBlob) {
    throw new Error('Failed to capture the current preview.');
  }

  return previewBlob;
}

async function readAssetBinary(asset: StudioAsset): Promise<ArrayBuffer> {
  if (asset.file) {
    return asset.file.arrayBuffer();
  }

  const response = await fetch(asset.url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Failed to load ${asset.relativePath}: ${response.status}`);
  }

  return response.arrayBuffer();
}

function collectArchiveAssets(draft: StudioDraft): Map<string, StudioAsset> {
  const assets = new Map<string, StudioAsset>();
  const addAsset = (asset: StudioAsset | undefined) => {
    if (asset) {
      assets.set(asset.relativePath, asset);
    }
  };

  addAsset(draft.background.image);
  addAsset(draft.fonts.regular);
  addAsset(draft.fonts.small);
  addAsset(draft.audio.music);
  DEFAULT_SFX_NAMES.forEach((name) => addAsset(draft.audio.sfx[name]));

  return assets;
}

function triggerBrowserDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();

  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1_000);
}

export async function downloadDraftArchive(draft: StudioDraft, previewNode: HTMLElement): Promise<void> {
  const manifest = buildArchiveManifest(draft);
  const previewBlob = await capturePreviewBlob(previewNode);
  const zip = new JSZip();
  const root = zip.folder(manifest.id) ?? zip;

  root.file('theme.json', `${JSON.stringify(manifest, null, 2)}\n`);
  root.file('media/screenshots/00.png', previewBlob);

  await Promise.all(
    Array.from(collectArchiveAssets(draft).entries()).map(async ([relativePath, asset]) => {
      const binary = await readAssetBinary(asset);
      root.file(relativePath, binary);
    }),
  );

  const archive = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  triggerBrowserDownload(archive, `${manifest.id}-${manifest.version}.zip`);
}

export async function submitThemeProposal(draft: StudioDraft, previewNode: HTMLElement): Promise<ProposalResult> {
  const apiBase = import.meta.env.VITE_PR_PROXY_URL?.trim();
  if (!apiBase) {
    throw new Error('Missing VITE_PR_PROXY_URL. Configure the PR proxy before submitting a theme.');
  }

  const previewBlob = await capturePreviewBlob(previewNode);

  const payload = buildProposalPayload(draft);
  const formData = new FormData();
  formData.set('proposal', JSON.stringify(payload));
  formData.set('previewScreenshot', new File([previewBlob], '00.png', { type: 'image/png' }));

  if (draft.background.image?.proposalReady && draft.background.image.file) {
    formData.set('backgroundImage', draft.background.image.file);
  }
  if (draft.fonts.regular?.proposalReady && draft.fonts.regular.file) {
    formData.set('regularFont', draft.fonts.regular.file);
  }
  if (draft.fonts.small?.proposalReady && draft.fonts.small.file) {
    formData.set('smallFont', draft.fonts.small.file);
  }
  if (draft.audio.music?.proposalReady && draft.audio.music.file) {
    formData.set('music', draft.audio.music.file);
  }

  DEFAULT_SFX_NAMES.forEach((name) => {
    const asset = draft.audio.sfx[name];
    if (asset?.proposalReady && asset.file) {
      formData.set(`sfx:${name}`, asset.file);
    }
  });

  const response = await fetch(`${apiBase.replace(/\/$/, '')}/api/proposals`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Proposal submission failed with status ${response.status}`);
  }

  return response.json() as Promise<ProposalResult>;
}
