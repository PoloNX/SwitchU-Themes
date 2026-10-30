/** Magic-byte checks for theme/icon assets before they enter a download zip. */

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  if (bytes.length < signature.length) return false;
  return signature.every((value, index) => bytes[index] === value);
}

function looksLikeGitLfsPointer(bytes: Uint8Array): boolean {
  const head = new TextDecoder().decode(bytes.subarray(0, Math.min(bytes.length, 120)));
  return head.startsWith('version https://git-lfs.github.com/spec/v1');
}

export function assertLegitAsset(relativePath: string, buffer: ArrayBuffer): void {
  const bytes = new Uint8Array(buffer);
  if (bytes.length === 0) {
    throw new Error(`Empty asset in package: ${relativePath}`);
  }
  if (looksLikeGitLfsPointer(bytes)) {
    throw new Error(`Git LFS pointer instead of real asset: ${relativePath}`);
  }

  const lower = relativePath.toLowerCase();
  if (lower.endsWith('.png')) {
    if (!startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
      throw new Error(`Invalid PNG: ${relativePath}`);
    }
    return;
  }
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) {
    if (!startsWith(bytes, [0xff, 0xd8, 0xff])) {
      throw new Error(`Invalid JPEG: ${relativePath}`);
    }
    return;
  }
  if (lower.endsWith('.webp')) {
    if (!(startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && bytes.length >= 12
      && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50)) {
      throw new Error(`Invalid WebP: ${relativePath}`);
    }
    return;
  }
  if (lower.endsWith('.mp3')) {
    const id3 = startsWith(bytes, [0x49, 0x44, 0x33]);
    const frame = bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
    if (!id3 && !frame) {
      throw new Error(`Invalid MP3: ${relativePath}`);
    }
    return;
  }
  if (lower.endsWith('.wav')) {
    if (!(startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && bytes.length >= 12
      && bytes[8] === 0x57 && bytes[9] === 0x41 && bytes[10] === 0x56 && bytes[11] === 0x45)) {
      throw new Error(`Invalid WAV: ${relativePath}`);
    }
    return;
  }
  if (lower.endsWith('.ttf') || lower.endsWith('.otf')) {
    const ttf = startsWith(bytes, [0x00, 0x01, 0x00, 0x00]);
    const otf = startsWith(bytes, [0x4f, 0x54, 0x54, 0x4f]);
    if (!ttf && !otf) {
      throw new Error(`Invalid font: ${relativePath}`);
    }
  }
}
