import JSZip from 'jszip';
import { toBlob } from 'html-to-image';
import {
  DEFAULT_SFX_NAMES,
  buildManifestFromDraft,
  draftFromSnapshot,
  draftSnapshotFromDraft,
  type DefaultSfxName,
  type StudioAsset,
  type StudioDraft,
  type StudioDraftSnapshot,
} from '../theme/draft';

export interface ProposalResult {
  pullRequestUrl: string;
  branchName: string;
  previewUrl?: string;
  editUrl?: string;
}

export type ProposalMode = 'preview' | 'edit';

export interface ProposalRouteState {
  proposalId: string;
  branchName: string;
  proposalMode: ProposalMode;
}

interface ProposalDraftResponse {
  proposalId: string;
  branchName: string;
  draftSnapshot: StudioDraftSnapshot;
}

export interface ProposalDraftLoadResult {
  proposalId: string;
  branchName: string;
  draft: StudioDraft;
}

export interface ProposalUpdateResult {
  ok: boolean;
  branchName: string;
  previewUrl?: string;
  editUrl?: string;
}

function themeRoot(id: string): string {
  return `themes/${id}`;
}

function proxyBaseUrl(): string {
  const apiBase = import.meta.env.VITE_PR_PROXY_URL?.trim();
  if (!apiBase) {
    throw new Error('Missing VITE_PR_PROXY_URL. Configure the PR proxy before submitting a theme.');
  }

  return apiBase.replace(/\/$/, '');
}

function currentSiteBaseUrl(): string {
  const url = new URL(import.meta.env.BASE_URL, window.location.href);
  url.search = '';
  url.hash = '';
  return url.toString();
}

function buildProposalAssetUrl(branchName: string, proposalId: string, relativePath: string): string {
  const url = new URL(`${proxyBaseUrl()}/api/proposals/asset`);
  url.searchParams.set('branch', branchName);
  url.searchParams.set('id', proposalId);
  url.searchParams.set('path', relativePath);
  return url.toString();
}

function buildProposalPayload(draft: StudioDraft) {
  const manifest = buildManifestFromDraft(draft);
  const id = manifest.id;

  return {
    id,
    name: manifest.name,
    siteBaseUrl: currentSiteBaseUrl(),
    draftSnapshot: draftSnapshotFromDraft(draft),
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

function readProposalResponseError(response: Response, fallbackMessage: string): Promise<never> {
  return response.text().then((text) => {
    throw new Error(text || fallbackMessage);
  });
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

async function buildProposalFormData(draft: StudioDraft, previewNode: HTMLElement): Promise<FormData> {
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

  return formData;
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
  const response = await fetch(`${proxyBaseUrl()}/api/proposals`, {
    method: 'POST',
    body: await buildProposalFormData(draft, previewNode),
  });

  if (!response.ok) {
    return readProposalResponseError(response, `Proposal submission failed with status ${response.status}`);
  }

  return response.json() as Promise<ProposalResult>;
}

export function readProposalRouteState(locationLike: Pick<Location, 'search'> = window.location): ProposalRouteState | null {
  const params = new URLSearchParams(locationLike.search);
  const proposalId = params.get('proposalId')?.trim();
  const branchName = params.get('proposalBranch')?.trim();
  const rawMode = params.get('proposalMode')?.trim();

  if (!proposalId || !branchName) {
    return null;
  }

  return {
    proposalId,
    branchName,
    proposalMode: rawMode === 'edit' ? 'edit' : 'preview',
  };
}

export async function loadProposalDraft(route: ProposalRouteState): Promise<ProposalDraftLoadResult> {
  const url = new URL(`${proxyBaseUrl()}/api/proposals/draft`);
  url.searchParams.set('branch', route.branchName);
  url.searchParams.set('id', route.proposalId);

  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    return readProposalResponseError(response, `Failed to load proposal draft (${response.status})`);
  }

  const payload = await response.json() as ProposalDraftResponse;
  return {
    proposalId: payload.proposalId,
    branchName: payload.branchName,
    draft: draftFromSnapshot(
      payload.draftSnapshot,
      (relativePath) => buildProposalAssetUrl(payload.branchName, payload.proposalId, relativePath),
      { proposalReadyAssets: true },
    ),
  };
}

export async function updateThemeProposal(
  draft: StudioDraft,
  previewNode: HTMLElement,
  branchName: string,
  editorToken: string,
): Promise<ProposalUpdateResult> {
  const url = new URL(`${proxyBaseUrl()}/api/proposals/update`);
  url.searchParams.set('branch', branchName);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'X-Editor-Token': editorToken,
    },
    body: await buildProposalFormData(draft, previewNode),
  });

  if (!response.ok) {
    return readProposalResponseError(response, `Proposal update failed with status ${response.status}`);
  }

  return response.json() as Promise<ProposalUpdateResult>;
}
