import { importPKCS8, SignJWT } from 'jose';

interface Env {
  GITHUB_APP_ID: string;
  GITHUB_INSTALLATION_ID: string;
  GITHUB_PRIVATE_KEY: string;
  GITHUB_REPO_OWNER: string;
  GITHUB_REPO_NAME: string;
  GITHUB_DEFAULT_BRANCH?: string;
  ALLOWED_ORIGIN?: string;
  EDITOR_TOKEN?: string;
}

interface CatalogEntry {
  id: string;
  name: string;
  author: string;
  version: string;
  path: string;
  manifest: string;
  cover?: string;
}

interface ProposalPayload {
  id: string;
  proposalMode?: 'create' | 'update';
  name: string;
  manifest: unknown;
  catalogEntry: CatalogEntry;
  prTitle: string;
  prBody: string;
  siteBaseUrl?: string;
  draftSnapshot: ProposalDraftSnapshot;
  files: {
    previewScreenshot: string;
    backgroundImage?: string;
    regularFont?: string;
    smallFont?: string;
    music?: string;
    sfx?: Record<string, string>;
  };
}

interface ProposalAssetSnapshot {
  name: string;
  relativePath: string;
}

interface ProposalColorSnapshot {
  h: number;
  s: number;
  l: number;
}

interface ProposalDraftSnapshot {
  basedOnThemeId?: string;
  proposalMode?: 'create' | 'update';
  id: string;
  name: string;
  author: string;
  version: string;
  summary: string;
  notes: string;
  contributor: string;
  mode: 'dark' | 'light';
  colors: {
    cursor: ProposalColorSnapshot;
    accent: ProposalColorSnapshot;
    background: ProposalColorSnapshot;
    backgroundAccent: ProposalColorSnapshot;
    shapes: ProposalColorSnapshot;
  };
  background: {
    layout: 'floating' | 'grid';
    shape: 'mixed' | 'circle' | 'triangle' | 'square' | 'diamond' | 'hexagon';
    symmetry: 'none' | 'horizontal' | 'vertical' | 'quad';
    count: number;
    fixedOrientation: boolean;
    orientation: number;
    roundness: number;
    columns: number;
    rows: number;
    spacingX: number;
    spacingY: number;
    sizeMin: number;
    sizeMax: number;
    speedMin: number;
    speedMax: number;
    wobble: number;
    rotationSpeed: number;
    opacity: number;
    imageOpacity: number;
    imageFit: 'cover' | 'contain';
    image?: ProposalAssetSnapshot;
  };
  fonts: {
    regular?: ProposalAssetSnapshot;
    small?: ProposalAssetSnapshot;
  };
  audio: {
    bundled: boolean;
    music?: ProposalAssetSnapshot;
    sfx: Record<string, ProposalAssetSnapshot>;
  };
}

interface StoredProposalDraft {
  schemaVersion: number;
  branchName: string;
  draftSnapshot: ProposalDraftSnapshot;
}

interface ProposalLinks {
  previewUrl: string;
  editUrl: string;
}

interface GitHubRepoResponse {
  default_branch: string;
}

interface GitHubContentResponse {
  sha: string;
  content?: string;
}

function jsonResponse(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...headers,
    },
  });
}

function corsHeaders(request: Request, env: Env): HeadersInit {
  const origin = request.headers.get('Origin');
  const allowedOrigin = env.ALLOWED_ORIGIN?.trim() || '*';
  const finalOrigin = allowedOrigin === '*' ? '*' : origin && origin === allowedOrigin ? origin : allowedOrigin;

  return {
    'access-control-allow-origin': finalOrigin,
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'Content-Type, X-Editor-Token',
  };
}

function sanitizeThemeId(value: string): string {
  const id = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (!id) {
    throw new Error('Invalid theme id');
  }

  return id;
}

function sanitizeRelativePath(path: string): string {
  const normalized = path.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized || normalized.includes('..')) {
    throw new Error(`Unsafe path: ${path}`);
  }
  return normalized;
}

function sanitizeBranchName(value: string): string {
  const branch = value.trim();
  if (!branch || branch.startsWith('/') || branch.endsWith('/') || branch.includes('..') || !/^[A-Za-z0-9._/-]+$/.test(branch)) {
    throw new Error(`Invalid branch name: ${value}`);
  }
  return branch;
}

function sanitizeSiteBaseUrl(value: string | undefined): string | undefined {
  if (!value?.trim()) {
    return undefined;
  }

  const url = new URL(value.trim());
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Invalid site base URL');
  }

  url.search = '';
  url.hash = '';
  return url.toString();
}

function sanitizeAssetSnapshot(input: ProposalAssetSnapshot | undefined): ProposalAssetSnapshot | undefined {
  if (!input) {
    return undefined;
  }

  return {
    name: String(input.name ?? '').trim(),
    relativePath: sanitizeRelativePath(String(input.relativePath ?? '')),
  };
}

function sanitizeDraftSnapshot(input: ProposalDraftSnapshot): ProposalDraftSnapshot {
  return {
    ...input,
    basedOnThemeId: input.basedOnThemeId?.trim() || undefined,
    id: sanitizeThemeId(input.id),
    name: String(input.name ?? '').trim(),
    author: String(input.author ?? '').trim(),
    version: String(input.version ?? '').trim(),
    summary: String(input.summary ?? '').trim(),
    notes: String(input.notes ?? ''),
    contributor: String(input.contributor ?? '').trim(),
    background: {
      ...input.background,
      image: sanitizeAssetSnapshot(input.background.image),
    },
    fonts: {
      regular: sanitizeAssetSnapshot(input.fonts.regular),
      small: sanitizeAssetSnapshot(input.fonts.small),
    },
    audio: {
      bundled: Boolean(input.audio.bundled),
      music: sanitizeAssetSnapshot(input.audio.music),
      sfx: Object.fromEntries(
        Object.entries(input.audio.sfx ?? {}).flatMap(([key, asset]) => {
          const sanitized = sanitizeAssetSnapshot(asset);
          return sanitized ? [[key, sanitized]] : [];
        }),
      ),
    },
  };
}

function normalizePrivateKey(value: string): string {
  const normalized = value.replace(/\\n/g, '\n').trim();
  if (normalized.includes('BEGIN RSA PRIVATE KEY')) {
    return convertPkcs1PemToPkcs8(normalized);
  }
  return normalized;
}

function concatBytes(...chunks: Uint8Array[]): Uint8Array {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(totalLength);
  let offset = 0;

  chunks.forEach((chunk) => {
    output.set(chunk, offset);
    offset += chunk.length;
  });

  return output;
}

function encodeDerLength(length: number): Uint8Array {
  if (length < 0x80) {
    return Uint8Array.of(length);
  }

  const bytes: number[] = [];
  let value = length;
  while (value > 0) {
    bytes.unshift(value & 0xff);
    value >>= 8;
  }

  return Uint8Array.of(0x80 | bytes.length, ...bytes);
}

function encodeDerNode(tag: number, content: Uint8Array): Uint8Array {
  return concatBytes(Uint8Array.of(tag), encodeDerLength(content.length), content);
}

function pemBodyToBytes(pem: string): Uint8Array {
  const base64 = pem
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '');

  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

function bytesToPem(label: string, bytes: Uint8Array): string {
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
  const base64 = btoa(binary).replace(/(.{64})/g, '$1\n');
  return `-----BEGIN ${label}-----\n${base64.trim()}\n-----END ${label}-----`;
}

function convertPkcs1PemToPkcs8(pem: string): string {
  const rsaPrivateKey = pemBodyToBytes(pem);
  const version = Uint8Array.of(0x02, 0x01, 0x00);
  const rsaEncryptionOid = Uint8Array.of(0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01);
  const nullParameters = Uint8Array.of(0x05, 0x00);
  const algorithmIdentifier = encodeDerNode(0x30, concatBytes(rsaEncryptionOid, nullParameters));
  const privateKey = encodeDerNode(0x04, rsaPrivateKey);
  const privateKeyInfo = encodeDerNode(0x30, concatBytes(version, algorithmIdentifier, privateKey));

  return bytesToPem('PRIVATE KEY', privateKeyInfo);
}

function textToBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary);
}

function decodeContent(content: string): string {
  return atob(content.replace(/\n/g, ''));
}

async function createGitHubAppJwt(env: Env): Promise<string> {
  const privateKey = await importPKCS8(normalizePrivateKey(env.GITHUB_PRIVATE_KEY), 'RS256');
  const now = Math.floor(Date.now() / 1000);

  return new SignJWT({})
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuedAt(now - 30)
    .setExpirationTime(now + 9 * 60)
    .setIssuer(env.GITHUB_APP_ID)
    .sign(privateKey);
}

async function githubRequest(
  env: Env,
  token: string,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  return fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'User-Agent': 'switchu-themes-pr-proxy',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.headers ?? {}),
    },
  });
}

async function githubFetch<T>(
  env: Env,
  token: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await githubRequest(env, token, path, init);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub API ${path} failed (${response.status}): ${text}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

async function getInstallationToken(env: Env): Promise<string> {
  const appJwt = await createGitHubAppJwt(env);
  const payload = await githubFetch<{ token: string }>(
    env,
    appJwt,
    `/app/installations/${env.GITHUB_INSTALLATION_ID}/access_tokens`,
    { method: 'POST' },
  );
  return payload.token;
}

function repoPath(env: Env): string {
  return `/repos/${env.GITHUB_REPO_OWNER}/${env.GITHUB_REPO_NAME}`;
}

function themeRoot(themeId: string): string {
  return `themes/${sanitizeThemeId(themeId)}`;
}

function proposalMetadataPath(themeId: string): string {
  return `${themeRoot(themeId)}/.switchu-studio.json`;
}

async function getDefaultBranch(env: Env, token: string): Promise<string> {
  if (env.GITHUB_DEFAULT_BRANCH?.trim()) {
    return env.GITHUB_DEFAULT_BRANCH.trim();
  }

  const repo = await githubFetch<GitHubRepoResponse>(env, token, repoPath(env));
  return repo.default_branch;
}

async function getBranchSha(env: Env, token: string, branch: string): Promise<string> {
  const ref = await githubFetch<{ object: { sha: string } }>(
    env,
    token,
    `${repoPath(env)}/git/ref/heads/${branch}`,
  );
  return ref.object.sha;
}

async function createBranch(env: Env, token: string, branch: string, sha: string): Promise<void> {
  await githubFetch(
    env,
    token,
    `${repoPath(env)}/git/refs`,
    {
      method: 'POST',
      body: JSON.stringify({
        ref: `refs/heads/${branch}`,
        sha,
      }),
    },
  );
}

async function getContent(env: Env, token: string, path: string, branch: string): Promise<GitHubContentResponse> {
  return githubFetch<GitHubContentResponse>(
    env,
    token,
    `${repoPath(env)}/contents/${sanitizeRelativePath(path)}?ref=${encodeURIComponent(branch)}`,
  );
}

async function findContentSha(
  env: Env,
  token: string,
  branch: string,
  path: string,
): Promise<string | undefined> {
  const response = await githubRequest(
    env,
    token,
    `${repoPath(env)}/contents/${sanitizeRelativePath(path)}?ref=${encodeURIComponent(branch)}`,
  );

  if (response.status === 404) {
    return undefined;
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub API ${sanitizeRelativePath(path)} failed (${response.status}): ${text}`);
  }

  const content = await response.json() as GitHubContentResponse;
  return content.sha;
}

async function putFile(
  env: Env,
  token: string,
  branch: string,
  path: string,
  message: string,
  contentBase64: string,
  sha?: string,
): Promise<void> {
  await githubFetch(
    env,
    token,
    `${repoPath(env)}/contents/${sanitizeRelativePath(path)}`,
    {
      method: 'PUT',
      body: JSON.stringify({
        message,
        branch,
        content: contentBase64,
        sha,
      }),
    },
  );
}

async function putFileEnsuringSha(
  env: Env,
  token: string,
  branch: string,
  path: string,
  message: string,
  contentBase64: string,
): Promise<void> {
  const sha = await findContentSha(env, token, branch, path);
  await putFile(env, token, branch, path, message, contentBase64, sha);
}

async function updateJsonFile(
  env: Env,
  token: string,
  branch: string,
  path: string,
  message: string,
  updater: (current: unknown) => unknown,
): Promise<void> {
  const current = await getContent(env, token, path, branch);
  const decoded = current.content ? JSON.parse(decodeContent(current.content)) : {};
  const nextContent = JSON.stringify(updater(decoded), null, 2) + '\n';
  await putFile(env, token, branch, path, message, textToBase64(nextContent), current.sha);
}

async function openPullRequest(env: Env, token: string, base: string, head: string, title: string, body: string): Promise<string> {
  const response = await githubFetch<{ html_url: string }>(
    env,
    token,
    `${repoPath(env)}/pulls`,
    {
      method: 'POST',
      body: JSON.stringify({
        title,
        body,
        base,
        head,
      }),
    },
  );

  return response.html_url;
}

function requireFile(formData: FormData, name: string): File {
  const value = formData.get(name);
  if (!(value instanceof File)) {
    throw new Error(`Missing file field: ${name}`);
  }
  return value;
}

function optionalFile(formData: FormData, name: string): File | undefined {
  const value = formData.get(name);
  return value instanceof File ? value : undefined;
}

async function uploadBinaryFile(
  env: Env,
  token: string,
  branch: string,
  root: string,
  relativePath: string,
  file: File,
  message: string,
  options: { ensureSha?: boolean } = {},
): Promise<void> {
  const repoFilePath = `${root}/${sanitizeRelativePath(relativePath)}`;
  const contentBase64 = arrayBufferToBase64(await file.arrayBuffer());
  if (options.ensureSha) {
    await putFileEnsuringSha(env, token, branch, repoFilePath, message, contentBase64);
    return;
  }

  await putFile(env, token, branch, repoFilePath, message, contentBase64);
}

function upsertCatalogEntry(current: unknown, entry: CatalogEntry): { schemaVersion: number; themes: CatalogEntry[] } {
  const catalog = current && typeof current === 'object' && 'themes' in current
    ? current as { schemaVersion?: number; themes?: CatalogEntry[] }
    : {};

  const themes = Array.isArray(catalog.themes) ? catalog.themes.filter((item) => item.id !== entry.id) : [];
  themes.push(entry);
  themes.sort((left, right) => left.name.localeCompare(right.name));

  return {
    schemaVersion: typeof catalog.schemaVersion === 'number' ? catalog.schemaVersion : 1,
    themes,
  };
}

function buildProposalLinks(siteBaseUrl: string | undefined, themeId: string, branchName: string): ProposalLinks | undefined {
  if (!siteBaseUrl) {
    return undefined;
  }

  const build = (proposalMode: 'preview' | 'edit') => {
    const url = new URL(siteBaseUrl);
    url.searchParams.set('proposalId', themeId);
    url.searchParams.set('proposalBranch', branchName);
    url.searchParams.set('proposalMode', proposalMode);
    return url.toString();
  };

  return {
    previewUrl: build('preview'),
    editUrl: build('edit'),
  };
}

function buildPullRequestBody(baseBody: string, links: ProposalLinks | undefined): string {
  if (!links) {
    return baseBody;
  }

  return [
    baseBody.trim(),
    '',
    'Preview this proposal:',
    links.previewUrl,
    '',
    'Edit this proposal:',
    links.editUrl,
    '',
    'The edit link only saves changes when the private editor token is configured in the proxy and provided from the site.',
  ].filter(Boolean).join('\n');
}

async function writeProposalDraftMetadata(
  env: Env,
  token: string,
  branch: string,
  proposal: ProposalPayload,
  options: { ensureSha?: boolean } = {},
): Promise<void> {
  const metadata: StoredProposalDraft = {
    schemaVersion: 1,
    branchName: branch,
    draftSnapshot: proposal.draftSnapshot,
  };

  const path = proposalMetadataPath(proposal.id);
  const contentBase64 = textToBase64(`${JSON.stringify(metadata, null, 2)}\n`);
  if (options.ensureSha) {
    await putFileEnsuringSha(env, token, branch, path, `Store editable draft snapshot for ${proposal.id}`, contentBase64);
    return;
  }

  await putFile(env, token, branch, path, `Store editable draft snapshot for ${proposal.id}`, contentBase64);
}

async function readProposalDraftMetadata(
  env: Env,
  token: string,
  branch: string,
  themeId: string,
): Promise<StoredProposalDraft> {
  const content = await getContent(env, token, proposalMetadataPath(themeId), branch);
  if (!content.content) {
    throw new Error(`Missing editable draft snapshot for ${themeId}`);
  }

  return JSON.parse(decodeContent(content.content)) as StoredProposalDraft;
}

function guessContentType(path: string): string {
  const lowerPath = path.toLowerCase();
  if (lowerPath.endsWith('.png')) return 'image/png';
  if (lowerPath.endsWith('.jpg') || lowerPath.endsWith('.jpeg')) return 'image/jpeg';
  if (lowerPath.endsWith('.webp')) return 'image/webp';
  if (lowerPath.endsWith('.mp3')) return 'audio/mpeg';
  if (lowerPath.endsWith('.wav')) return 'audio/wav';
  if (lowerPath.endsWith('.ttf')) return 'font/ttf';
  if (lowerPath.endsWith('.otf')) return 'font/otf';
  if (lowerPath.endsWith('.woff')) return 'font/woff';
  if (lowerPath.endsWith('.woff2')) return 'font/woff2';
  if (lowerPath.endsWith('.json')) return 'application/json; charset=utf-8';
  return 'application/octet-stream';
}

function hasEditorAccess(request: Request, env: Env): boolean {
  const expected = env.EDITOR_TOKEN?.trim();
  if (!expected) {
    return false;
  }

  const provided = request.headers.get('X-Editor-Token')?.trim();
  return Boolean(provided) && provided === expected;
}

function validateProposal(input: unknown): ProposalPayload {
  if (!input || typeof input !== 'object') {
    throw new Error('Invalid proposal payload');
  }

  const proposal = input as ProposalPayload;
  if (!proposal.catalogEntry || !proposal.files || !proposal.draftSnapshot) {
    throw new Error('Incomplete proposal payload');
  }

  proposal.id = sanitizeThemeId(proposal.id);
  proposal.proposalMode = proposal.proposalMode === 'update' ? 'update' : 'create';
  proposal.siteBaseUrl = sanitizeSiteBaseUrl(proposal.siteBaseUrl);
  proposal.draftSnapshot = sanitizeDraftSnapshot(proposal.draftSnapshot);
  proposal.catalogEntry.id = sanitizeThemeId(proposal.catalogEntry.id);
  proposal.catalogEntry.path = sanitizeRelativePath(proposal.catalogEntry.path);
  proposal.catalogEntry.manifest = sanitizeRelativePath(proposal.catalogEntry.manifest);
  if (proposal.catalogEntry.cover) {
    proposal.catalogEntry.cover = sanitizeRelativePath(proposal.catalogEntry.cover);
  }
  proposal.files.previewScreenshot = sanitizeRelativePath(proposal.files.previewScreenshot);
  if (proposal.files.backgroundImage) proposal.files.backgroundImage = sanitizeRelativePath(proposal.files.backgroundImage);
  if (proposal.files.regularFont) proposal.files.regularFont = sanitizeRelativePath(proposal.files.regularFont);
  if (proposal.files.smallFont) proposal.files.smallFont = sanitizeRelativePath(proposal.files.smallFont);
  if (proposal.files.music) proposal.files.music = sanitizeRelativePath(proposal.files.music);
  if (proposal.files.sfx) {
    Object.keys(proposal.files.sfx).forEach((key) => {
      const value = proposal.files.sfx?.[key];
      if (value) {
        proposal.files.sfx![key] = sanitizeRelativePath(value);
      }
    });
  }

  if (proposal.draftSnapshot.id !== proposal.id) {
    throw new Error('Draft snapshot id must match proposal id');
  }

  if ((proposal.draftSnapshot.proposalMode ?? 'create') !== proposal.proposalMode) {
    throw new Error('Draft snapshot proposal mode must match proposal mode');
  }

  if (proposal.catalogEntry.id !== proposal.id) {
    throw new Error('Catalog entry id must match proposal id');
  }

  return proposal;
}

async function handleCreateProposal(request: Request, env: Env): Promise<Response> {
  const formData = await request.formData();
  const proposalRaw = formData.get('proposal');
  if (typeof proposalRaw !== 'string') {
    return jsonResponse({ error: 'Missing proposal payload' }, 400, corsHeaders(request, env));
  }

  const proposal = validateProposal(JSON.parse(proposalRaw));
  const token = await getInstallationToken(env);
  const defaultBranch = await getDefaultBranch(env, token);
  const existingCatalog = await getContent(env, token, 'index.json', defaultBranch);
  const catalog = existingCatalog.content
    ? (JSON.parse(decodeContent(existingCatalog.content)) as { schemaVersion: number; themes: CatalogEntry[] })
    : { schemaVersion: 1, themes: [] };
  const themeExists = catalog.themes.some((entry) => entry.id === proposal.id);

  if (proposal.proposalMode === 'create' && themeExists) {
    return jsonResponse({ error: `A theme with id '${proposal.id}' already exists.` }, 409, corsHeaders(request, env));
  }

  if (proposal.proposalMode === 'update' && !themeExists) {
    return jsonResponse({ error: `Cannot update missing theme '${proposal.id}'.` }, 404, corsHeaders(request, env));
  }

  const defaultSha = await getBranchSha(env, token, defaultBranch);
  const branch = `theme-studio/${proposal.proposalMode === 'update' ? 'update-' : ''}${proposal.id}-${Date.now()}`;
  await createBranch(env, token, branch, defaultSha);

  const isUpdate = proposal.proposalMode === 'update';
  const root = themeRoot(proposal.id);
  const commitPrefix = `[theme-studio] ${proposal.id}`;
  const commitVerb = isUpdate ? 'update' : 'add';

  await uploadBinaryFile(
    env,
    token,
    branch,
    root,
    proposal.files.previewScreenshot,
    requireFile(formData, 'previewScreenshot'),
    `${commitPrefix}: ${commitVerb} preview screenshot`,
    { ensureSha: isUpdate },
  );

  const backgroundImage = optionalFile(formData, 'backgroundImage');
  if (backgroundImage && proposal.files.backgroundImage) {
    await uploadBinaryFile(
      env,
      token,
      branch,
      root,
      proposal.files.backgroundImage,
      backgroundImage,
      `${commitPrefix}: ${commitVerb} background image`,
      { ensureSha: isUpdate },
    );
  }

  const regularFont = optionalFile(formData, 'regularFont');
  if (regularFont && proposal.files.regularFont) {
    await uploadBinaryFile(
      env,
      token,
      branch,
      root,
      proposal.files.regularFont,
      regularFont,
      `${commitPrefix}: ${commitVerb} regular font`,
      { ensureSha: isUpdate },
    );
  }

  const smallFont = optionalFile(formData, 'smallFont');
  if (smallFont && proposal.files.smallFont) {
    await uploadBinaryFile(
      env,
      token,
      branch,
      root,
      proposal.files.smallFont,
      smallFont,
      `${commitPrefix}: ${commitVerb} small font`,
      { ensureSha: isUpdate },
    );
  }

  const music = optionalFile(formData, 'music');
  if (music && proposal.files.music) {
    await uploadBinaryFile(
      env,
      token,
      branch,
      root,
      proposal.files.music,
      music,
      `${commitPrefix}: ${commitVerb} background music`,
      { ensureSha: isUpdate },
    );
  }

  if (proposal.files.sfx) {
    for (const [name, relativePath] of Object.entries(proposal.files.sfx)) {
      if (!relativePath) {
        continue;
      }

      const file = optionalFile(formData, `sfx:${name}`);
      if (!file) {
        continue;
      }

      await uploadBinaryFile(
        env,
        token,
        branch,
        root,
        relativePath,
        file,
        `${commitPrefix}: ${commitVerb} ${name} sfx`,
        { ensureSha: isUpdate },
      );
    }
  }

  const manifestJson = JSON.stringify(proposal.manifest, null, 2) + '\n';
  const existingManifestSha = isUpdate ? await findContentSha(env, token, branch, `${root}/theme.json`) : undefined;
  await putFile(
    env,
    token,
    branch,
    `${root}/theme.json`,
    `${commitPrefix}: ${commitVerb} theme manifest`,
    textToBase64(manifestJson),
    existingManifestSha,
  );

  await writeProposalDraftMetadata(env, token, branch, proposal, { ensureSha: isUpdate });

  await updateJsonFile(env, token, branch, 'index.json', `${commitPrefix}: ${isUpdate ? 'update' : 'register'} theme in catalog`, (current) => {
    return upsertCatalogEntry(current, proposal.catalogEntry);
  });

  const proposalLinks = buildProposalLinks(proposal.siteBaseUrl, proposal.id, branch);
  const pullRequestUrl = await openPullRequest(
    env,
    token,
    defaultBranch,
    branch,
    proposal.prTitle,
    buildPullRequestBody(proposal.prBody, proposalLinks),
  );
  return jsonResponse({ pullRequestUrl, branchName: branch, ...proposalLinks }, 200, corsHeaders(request, env));
}

async function handleGetProposalDraft(request: Request, env: Env, url: URL): Promise<Response> {
  const branch = sanitizeBranchName(url.searchParams.get('branch') ?? '');
  const proposalId = sanitizeThemeId(url.searchParams.get('id') ?? '');
  const token = await getInstallationToken(env);
  const metadata = await readProposalDraftMetadata(env, token, branch, proposalId);

  return jsonResponse(
    {
      proposalId,
      branchName: branch,
      draftSnapshot: metadata.draftSnapshot,
    },
    200,
    corsHeaders(request, env),
  );
}

async function handleGetProposalAsset(request: Request, env: Env, url: URL): Promise<Response> {
  const branch = sanitizeBranchName(url.searchParams.get('branch') ?? '');
  const proposalId = sanitizeThemeId(url.searchParams.get('id') ?? '');
  const relativePath = sanitizeRelativePath(url.searchParams.get('path') ?? '');
  const token = await getInstallationToken(env);
  const repoFilePath = sanitizeRelativePath(`${themeRoot(proposalId)}/${relativePath}`);
  const upstream = await githubRequest(
    env,
    token,
    `${repoPath(env)}/contents/${repoFilePath}?ref=${encodeURIComponent(branch)}`,
    {
      headers: {
        Accept: 'application/vnd.github.raw',
      },
    },
  );

  if (!upstream.ok) {
    const text = await upstream.text();
    return jsonResponse({ error: `GitHub asset fetch failed (${upstream.status}): ${text}` }, upstream.status, corsHeaders(request, env));
  }

  return new Response(await upstream.arrayBuffer(), {
    status: 200,
    headers: {
      ...corsHeaders(request, env),
      'cache-control': 'public, max-age=60',
      'content-type': upstream.headers.get('content-type') || guessContentType(relativePath),
    },
  });
}

async function handleUpdateProposal(request: Request, env: Env, url: URL): Promise<Response> {
  if (!env.EDITOR_TOKEN?.trim()) {
    return jsonResponse({ error: 'EDITOR_TOKEN is not configured on the proxy.' }, 503, corsHeaders(request, env));
  }

  if (!hasEditorAccess(request, env)) {
    return jsonResponse({ error: 'Forbidden: missing or invalid editor token.' }, 403, corsHeaders(request, env));
  }

  const branch = sanitizeBranchName(url.searchParams.get('branch') ?? '');
  if (!branch.startsWith('theme-studio/')) {
    return jsonResponse({ error: 'Only theme-studio proposal branches can be updated.' }, 400, corsHeaders(request, env));
  }

  const formData = await request.formData();
  const proposalRaw = formData.get('proposal');
  if (typeof proposalRaw !== 'string') {
    return jsonResponse({ error: 'Missing proposal payload' }, 400, corsHeaders(request, env));
  }

  const proposal = validateProposal(JSON.parse(proposalRaw));
  const token = await getInstallationToken(env);
  const root = themeRoot(proposal.id);
  const commitPrefix = `[theme-studio] ${proposal.id}`;
  const manifestJson = JSON.stringify(proposal.manifest, null, 2) + '\n';

  await putFile(
    env,
    token,
    branch,
    `${root}/theme.json`,
    `${commitPrefix}: update theme manifest`,
    textToBase64(manifestJson),
    await findContentSha(env, token, branch, `${root}/theme.json`),
  );

  await uploadBinaryFile(
    env,
    token,
    branch,
    root,
    proposal.files.previewScreenshot,
    requireFile(formData, 'previewScreenshot'),
    `${commitPrefix}: update preview screenshot`,
    { ensureSha: true },
  );

  const backgroundImage = optionalFile(formData, 'backgroundImage');
  if (backgroundImage && proposal.files.backgroundImage) {
    await uploadBinaryFile(
      env,
      token,
      branch,
      root,
      proposal.files.backgroundImage,
      backgroundImage,
      `${commitPrefix}: update background image`,
      { ensureSha: true },
    );
  }

  const regularFont = optionalFile(formData, 'regularFont');
  if (regularFont && proposal.files.regularFont) {
    await uploadBinaryFile(
      env,
      token,
      branch,
      root,
      proposal.files.regularFont,
      regularFont,
      `${commitPrefix}: update regular font`,
      { ensureSha: true },
    );
  }

  const smallFont = optionalFile(formData, 'smallFont');
  if (smallFont && proposal.files.smallFont) {
    await uploadBinaryFile(
      env,
      token,
      branch,
      root,
      proposal.files.smallFont,
      smallFont,
      `${commitPrefix}: update small font`,
      { ensureSha: true },
    );
  }

  const music = optionalFile(formData, 'music');
  if (music && proposal.files.music) {
    await uploadBinaryFile(
      env,
      token,
      branch,
      root,
      proposal.files.music,
      music,
      `${commitPrefix}: update background music`,
      { ensureSha: true },
    );
  }

  if (proposal.files.sfx) {
    for (const [name, relativePath] of Object.entries(proposal.files.sfx)) {
      if (!relativePath) {
        continue;
      }

      const file = optionalFile(formData, `sfx:${name}`);
      if (!file) {
        continue;
      }

      await uploadBinaryFile(
        env,
        token,
        branch,
        root,
        relativePath,
        file,
        `${commitPrefix}: update ${name} sfx`,
        { ensureSha: true },
      );
    }
  }

  await writeProposalDraftMetadata(env, token, branch, proposal, { ensureSha: true });
  await updateJsonFile(env, token, branch, 'index.json', `${commitPrefix}: update catalog entry`, (current) => {
    return upsertCatalogEntry(current, proposal.catalogEntry);
  });

  const proposalLinks = buildProposalLinks(proposal.siteBaseUrl, proposal.id, branch);
  return jsonResponse({ ok: true, branchName: branch, ...proposalLinks }, 200, corsHeaders(request, env));
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }

    try {
      if (request.method === 'GET' && url.pathname === '/api/health') {
        return jsonResponse({ ok: true, repo: `${env.GITHUB_REPO_OWNER}/${env.GITHUB_REPO_NAME}` }, 200, corsHeaders(request, env));
      }

      if (request.method === 'GET' && url.pathname === '/api/proposals/draft') {
        return await handleGetProposalDraft(request, env, url);
      }

      if (request.method === 'GET' && url.pathname === '/api/proposals/asset') {
        return await handleGetProposalAsset(request, env, url);
      }

      if (request.method === 'POST' && url.pathname === '/api/proposals') {
        return await handleCreateProposal(request, env);
      }

      if (request.method === 'POST' && url.pathname === '/api/proposals/update') {
        return await handleUpdateProposal(request, env, url);
      }

      return jsonResponse({ error: 'Not found' }, 404, corsHeaders(request, env));
    } catch (cause) {
      return jsonResponse(
        { error: cause instanceof Error ? cause.message : 'Unknown proxy error' },
        500,
        corsHeaders(request, env),
      );
    }
  },
} satisfies ExportedHandler<Env>;
