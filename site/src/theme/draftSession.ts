import {
  draftFromSnapshot,
  draftSnapshotFromDraft,
  type StudioAsset,
  type StudioDraft,
  type StudioDraftSnapshot,
  DEFAULT_SFX_NAMES,
} from './draft';

const DB_NAME = 'switchu-themes-studio';
const DB_VERSION = 1;
const STORE_NAME = 'sessions';
const SESSION_KEY = 'active-draft';
export const DRAFT_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export interface DraftSessionMeta {
  savedAt: number;
  draftId: string;
  draftName: string;
  expiresAt: number;
}

interface StoredAssetBlob {
  relativePath: string;
  name: string;
  mimeType: string;
  blob: Blob;
}

interface StoredDraftSession {
  savedAt: number;
  snapshot: StudioDraftSnapshot;
  assets: StoredAssetBlob[];
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error ?? new Error('Failed to open draft session storage.'));
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T | undefined> {
  const db = await openDb();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode);
      const store = tx.objectStore(STORE_NAME);
      const request = run(store);
      tx.oncomplete = () => resolve(request ? request.result : undefined);
      tx.onerror = () => reject(tx.error ?? new Error('Draft session transaction failed.'));
      if (request) {
        request.onerror = () => reject(request.error ?? new Error('Draft session request failed.'));
      }
    });
  } finally {
    db.close();
  }
}

function collectDraftAssets(draft: StudioDraft): StudioAsset[] {
  const assets: StudioAsset[] = [];
  if (draft.background.image) {
    assets.push(draft.background.image);
  }
  if (draft.fonts.regular) {
    assets.push(draft.fonts.regular);
  }
  if (draft.fonts.small) {
    assets.push(draft.fonts.small);
  }
  if (draft.audio.music) {
    assets.push(draft.audio.music);
  }
  for (const name of DEFAULT_SFX_NAMES) {
    const asset = draft.audio.sfx[name];
    if (asset) {
      assets.push(asset);
    }
  }
  for (const asset of draft.iconGlyphs ?? []) {
    assets.push(asset);
  }
  return assets;
}

async function readAssetBlob(asset: StudioAsset): Promise<Blob | null> {
  if (asset.file) {
    return asset.file;
  }

  // Persist blob: uploads and any in-memory object URLs. Skip remote catalog URLs
  // so restore can re-bind them from the live catalog when needed.
  if (!asset.url || (!asset.url.startsWith('blob:') && asset.source === 'catalog')) {
    return null;
  }

  try {
    const response = await fetch(asset.url, { cache: 'no-store' });
    if (!response.ok) {
      return null;
    }
    return await response.blob();
  } catch {
    return null;
  }
}

function guessMime(relativePath: string, fallback = 'application/octet-stream'): string {
  const lower = relativePath.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.mp3')) return 'audio/mpeg';
  if (lower.endsWith('.wav')) return 'audio/wav';
  if (lower.endsWith('.ttf')) return 'font/ttf';
  if (lower.endsWith('.otf')) return 'font/otf';
  if (lower.endsWith('.woff')) return 'font/woff';
  if (lower.endsWith('.woff2')) return 'font/woff2';
  return fallback;
}

export async function saveDraftSession(draft: StudioDraft): Promise<void> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return;
  }

  const assets: StoredAssetBlob[] = [];
  const seen = new Set<string>();

  for (const asset of collectDraftAssets(draft)) {
    if (seen.has(asset.relativePath)) {
      continue;
    }
    seen.add(asset.relativePath);

    const blob = await readAssetBlob(asset);
    if (!blob) {
      continue;
    }

    assets.push({
      relativePath: asset.relativePath,
      name: asset.name,
      mimeType: blob.type || guessMime(asset.relativePath),
      blob,
    });
  }

  const payload: StoredDraftSession = {
    savedAt: Date.now(),
    snapshot: draftSnapshotFromDraft(draft),
    assets,
  };

  await withStore('readwrite', (store) => store.put(payload, SESSION_KEY));
}

export async function clearDraftSession(): Promise<void> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return;
  }

  await withStore('readwrite', (store) => store.delete(SESSION_KEY));
}

export async function peekDraftSession(): Promise<DraftSessionMeta | null> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return null;
  }

  const stored = await withStore<StoredDraftSession>('readonly', (store) => store.get(SESSION_KEY));
  if (!stored?.snapshot || typeof stored.savedAt !== 'number') {
    return null;
  }

  const expiresAt = stored.savedAt + DRAFT_SESSION_TTL_MS;
  if (Date.now() > expiresAt) {
    await clearDraftSession();
    return null;
  }

  return {
    savedAt: stored.savedAt,
    draftId: stored.snapshot.id,
    draftName: stored.snapshot.name,
    expiresAt,
  };
}

export async function loadDraftSession(): Promise<StudioDraft | null> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return null;
  }

  const stored = await withStore<StoredDraftSession>('readonly', (store) => store.get(SESSION_KEY));
  if (!stored?.snapshot || typeof stored.savedAt !== 'number') {
    return null;
  }

  if (Date.now() > stored.savedAt + DRAFT_SESSION_TTL_MS) {
    await clearDraftSession();
    return null;
  }

  const blobByPath = new Map(stored.assets.map((asset) => [asset.relativePath, asset]));

  const resolveAssetUrl = (relativePath: string): string => {
    const asset = blobByPath.get(relativePath);
    if (!asset) {
      return '';
    }
    return URL.createObjectURL(asset.blob);
  };

  const draft = draftFromSnapshot(stored.snapshot, resolveAssetUrl, { proposalReadyAssets: true });

  const hydrateFile = (asset: StudioAsset | undefined): StudioAsset | undefined => {
    if (!asset) {
      return undefined;
    }
    const storedAsset = blobByPath.get(asset.relativePath);
    if (!storedAsset) {
      return asset.url ? asset : undefined;
    }

    const file = new File([storedAsset.blob], storedAsset.name || asset.name, {
      type: storedAsset.mimeType || guessMime(asset.relativePath),
    });

    return {
      ...asset,
      source: 'upload',
      proposalReady: true,
      file,
      url: asset.url || URL.createObjectURL(storedAsset.blob),
      name: storedAsset.name || asset.name,
    };
  };

  draft.background.image = hydrateFile(draft.background.image);
  draft.fonts.regular = hydrateFile(draft.fonts.regular);
  draft.fonts.small = hydrateFile(draft.fonts.small);
  draft.audio.music = hydrateFile(draft.audio.music);
  draft.audio.sfx = Object.fromEntries(
    DEFAULT_SFX_NAMES.flatMap((name) => {
      const asset = hydrateFile(draft.audio.sfx[name]);
      return asset ? [[name, asset]] : [];
    }),
  ) as StudioDraft['audio']['sfx'];

  return draft;
}
