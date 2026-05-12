import JSZip from 'jszip';
import { buildCatalogUrl } from './api';
import type { ThemeCatalogRecord } from '../theme/schema';

interface ThemeFileIndex {
  files: string[];
}

function archiveRootName(record: ThemeCatalogRecord): string {
  const folderName = record.entry.path.split('/').filter(Boolean).pop();
  return folderName ?? record.entry.id;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Failed to load ${url}: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

async function fetchBinary(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Failed to load ${url}: ${response.status}`);
  }

  return response.arrayBuffer();
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

export async function downloadThemeArchive(record: ThemeCatalogRecord): Promise<void> {
  const fileIndexUrl = buildCatalogUrl(`${record.entry.path}/file-index.json`);
  const fileIndex = await fetchJson<ThemeFileIndex>(fileIndexUrl);

  const zip = new JSZip();
  const rootName = archiveRootName(record);
  const root = zip.folder(rootName) ?? zip;

  await Promise.all(
    fileIndex.files.map(async (relativePath) => {
      const fileUrl = buildCatalogUrl(`${record.entry.path}/${relativePath}`);
      const binary = await fetchBinary(fileUrl);
      root.file(relativePath, binary);
    }),
  );

  const archive = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  triggerBrowserDownload(archive, `${rootName}-${record.entry.version}.zip`);
}