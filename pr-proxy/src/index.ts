import { importPKCS8, jwtVerify, SignJWT } from 'jose';

interface Env {
  GITHUB_APP_ID: string;
  GITHUB_INSTALLATION_ID: string;
  GITHUB_PRIVATE_KEY: string;
  GITHUB_REPO_OWNER: string;
  GITHUB_REPO_NAME: string;
  GITHUB_DEFAULT_BRANCH?: string;
  ALLOWED_ORIGIN?: string;
  EDITOR_TOKEN?: string;
  ICON_PACK_REPO_OWNER?: string;
  ICON_PACK_REPO_NAME?: string;
  GITHUB_OAUTH_CLIENT_ID?: string;
  GITHUB_OAUTH_CLIENT_SECRET?: string;
  SESSION_SECRET?: string;
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
  editCodeHash?: string;
  editCodeCreatedAt?: string;
  authorLogin?: string;
}

interface SessionUser {
  login: string;
  name: string;
  avatarUrl: string;
  accessToken: string;
}

interface ProposalLinks {
  previewUrl: string;
  editUrl: string;
}

interface GitHubPullResponse {
  number: number;
  title: string;
  html_url: string;
  created_at: string;
  updated_at: string;
  head: {
    ref: string;
  };
  user?: {
    login: string;
  };
}

interface GitHubPullFileResponse {
  filename: string;
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
    'access-control-allow-headers': 'Content-Type, Authorization, X-Editor-Token',
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

function normalizeLogin(value: string): string {
  return value.trim().toLowerCase();
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

function sessionSecretKey(env: Env): Uint8Array {
  const secret = env.SESSION_SECRET?.trim() || env.GITHUB_PRIVATE_KEY?.trim();
  if (!secret) {
    throw new Error('Missing SESSION_SECRET (or GITHUB_PRIVATE_KEY) to sign sessions.');
  }
  return new TextEncoder().encode(secret);
}

async function createSessionToken(env: Env, user: SessionUser): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    login: user.login,
    name: user.name,
    avatarUrl: user.avatarUrl,
    token: user.accessToken,
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(user.login)
    .setIssuedAt(now - 30)
    .setExpirationTime(now + 7 * 24 * 60 * 60)
    .sign(sessionSecretKey(env));
}

async function verifySessionToken(env: Env, token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, sessionSecretKey(env), { algorithms: ['HS256'] });
    const login = typeof payload.sub === 'string' ? payload.sub : '';
    if (!login || typeof payload.token !== 'string') {
      return null;
    }
    return {
      login,
      name: typeof payload.name === 'string' ? payload.name : login,
      avatarUrl: typeof payload.avatarUrl === 'string' ? payload.avatarUrl : '',
      accessToken: payload.token,
    };
  } catch {
    return null;
  }
}

async function readSession(request: Request, env: Env): Promise<SessionUser | null> {
  const header = request.headers.get('Authorization')?.trim();
  if (!header?.startsWith('Bearer ')) {
    return null;
  }
  return verifySessionToken(env, header.slice('Bearer '.length).trim());
}

async function exchangeOAuthCode(env: Env, code: string): Promise<string> {
  if (!env.GITHUB_OAUTH_CLIENT_ID?.trim() || !env.GITHUB_OAUTH_CLIENT_SECRET?.trim()) {
    throw new Error('GitHub OAuth is not configured.');
  }

  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'switchu-themes-pr-proxy',
    },
    body: JSON.stringify({
      client_id: env.GITHUB_OAUTH_CLIENT_ID.trim(),
      client_secret: env.GITHUB_OAUTH_CLIENT_SECRET.trim(),
      code,
    }),
  });

  const payload = await response.json() as { access_token?: string; error?: string };
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error || `OAuth token exchange failed (${response.status})`);
  }
  return payload.access_token;
}

async function fetchGitHubUser(accessToken: string): Promise<SessionUser> {
  const response = await fetch('https://api.github.com/user', {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${accessToken}`,
      'User-Agent': 'switchu-themes-pr-proxy',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub user fetch failed (${response.status}): ${text}`);
  }

  const payload = await response.json() as { login: string; name?: string | null; avatar_url?: string };
  if (!payload.login) {
    throw new Error('GitHub user response is missing a login.');
  }

  return {
    login: payload.login,
    name: payload.name || payload.login,
    avatarUrl: payload.avatar_url || '',
    accessToken,
  };
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

async function getDefaultBranch(
  env: Env,
  token: string,
  targetRepoPath: string = repoPath(env),
): Promise<string> {
  // Always ask GitHub for the target repo's default branch. Blindly trusting
  // GITHUB_DEFAULT_BRANCH=main breaks when ICON_PACK_REPO points at PoloNX/SwitchU
  // (default branch is `master`) — studio submissions 404 on git/ref/heads/main.
  try {
    const repo = await githubFetch<GitHubRepoResponse>(env, token, targetRepoPath);
    if (repo.default_branch?.trim()) {
      return repo.default_branch.trim();
    }
  } catch (cause) {
    if (!env.GITHUB_DEFAULT_BRANCH?.trim()) {
      throw cause;
    }
  }

  if (env.GITHUB_DEFAULT_BRANCH?.trim()) {
    return env.GITHUB_DEFAULT_BRANCH.trim();
  }

  throw new Error(`Could not resolve default branch for ${targetRepoPath}`);
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

// Best-effort cleanup so a failed submission does not leave an orphan branch.
async function deleteBranch(env: Env, token: string, branch: string): Promise<void> {
  await githubRequest(env, token, `${repoPath(env)}/git/refs/heads/${branch}`, { method: 'DELETE' });
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
): Promise<void> {
  const repoFilePath = `${root}/${sanitizeRelativePath(relativePath)}`;
  const contentBase64 = arrayBufferToBase64(await file.arrayBuffer());
  // Always resolve the existing blob sha first: a path can legitimately be
  // written twice in one submission (e.g. the same font used as both the
  // regular and small font), and GitHub rejects a second create with
  // "sha wasn't supplied".
  await putFileEnsuringSha(env, token, branch, repoFilePath, message, contentBase64);
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

interface IconCatalogEntry {
  id: string;
  name: string;
  author: string;
  version: string;
  description: string;
  path: string;
  manifest: string;
  cover: string;
  builtin: boolean;
  colour: boolean;
}

function upsertIconCatalogEntry(
  current: unknown,
  entry: IconCatalogEntry,
): { schemaVersion: number; themes: unknown[]; icons: IconCatalogEntry[] } {
  const catalog = current && typeof current === 'object'
    ? current as { schemaVersion?: number; themes?: unknown[]; icons?: IconCatalogEntry[] }
    : {};

  const icons = Array.isArray(catalog.icons)
    ? catalog.icons.filter((item) => item.id !== entry.id)
    : [];
  icons.push(entry);
  icons.sort((left, right) => {
    if (left.builtin !== right.builtin) {
      return left.builtin ? -1 : 1;
    }
    return left.name.localeCompare(right.name);
  });

  return {
    schemaVersion: typeof catalog.schemaVersion === 'number' ? catalog.schemaVersion : 1,
    themes: Array.isArray(catalog.themes) ? catalog.themes : [],
    icons,
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

function buildPullRequestBody(
  baseBody: string,
  links: ProposalLinks | undefined,
  previewImage?: { owner: string; repo: string; branch: string; path: string; alt: string },
): string {
  const sections = [baseBody.trim()];

  if (previewImage?.path) {
    const rawUrl =
      `https://raw.githubusercontent.com/${previewImage.owner}/${previewImage.repo}/` +
      `${previewImage.branch}/${previewImage.path.replace(/^\/+/, '')}`;
    sections.push(
      '',
      '### Preview',
      '',
      `![${previewImage.alt || 'Theme preview'}](${rawUrl})`,
      '',
      `<sub>Source: \`${previewImage.path}\` on branch \`${previewImage.branch}\`</sub>`,
    );
  }

  if (links) {
    sections.push(
      '',
      'Preview this proposal in the studio:',
      links.previewUrl,
      '',
      'Edit this proposal:',
      links.editUrl,
      '',
      'The edit link lets the submitter update the proposal after signing in with GitHub.',
    );
  }

  return sections.filter(Boolean).join('\n');
}

async function writeProposalDraftMetadata(
  env: Env,
  token: string,
  branch: string,
  proposal: ProposalPayload,
  options: { authorLogin?: string; editCodeHash?: string } = {},
): Promise<void> {
  const metadata: StoredProposalDraft = {
    schemaVersion: 3,
    branchName: branch,
    draftSnapshot: proposal.draftSnapshot,
    authorLogin: options.authorLogin,
    editCodeHash: options.editCodeHash,
    editCodeCreatedAt: options.editCodeHash ? new Date().toISOString() : undefined,
  };

  const path = proposalMetadataPath(proposal.id);
  const contentBase64 = textToBase64(`${JSON.stringify(metadata, null, 2)}\n`);
  await putFileEnsuringSha(env, token, branch, path, `Store editable draft snapshot for ${proposal.id}`, contentBase64);
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

async function hasEditorAccess(
  request: Request,
  env: Env,
  metadata: StoredProposalDraft,
): Promise<boolean> {
  // Admin override for maintainers.
  const editorToken = request.headers.get('X-Editor-Token')?.trim();
  if (env.EDITOR_TOKEN?.trim() && editorToken && editorToken === env.EDITOR_TOKEN.trim()) {
    return true;
  }

  // Session-based authorization: the authenticated GitHub user must be the
  // proposal author. Legacy proposals fall back to the recorded contributor.
  const session = await readSession(request, env);
  if (!session) {
    return false;
  }

  if (metadata.authorLogin) {
    return normalizeLogin(session.login) === normalizeLogin(metadata.authorLogin);
  }

  const contributor = metadata.draftSnapshot.contributor?.trim();
  return Boolean(contributor) && normalizeLogin(session.login) === normalizeLogin(contributor);
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
  const session = await readSession(request, env);
  if (!session) {
    return jsonResponse({ error: 'Authentication required. Sign in with GitHub to submit a theme.' }, 401, corsHeaders(request, env));
  }

  const formData = await request.formData();
  const proposalRaw = formData.get('proposal');
  if (typeof proposalRaw !== 'string') {
    return jsonResponse({ error: 'Missing proposal payload' }, 400, corsHeaders(request, env));
  }

  const proposal = validateProposal(JSON.parse(proposalRaw));
  // Attribute the proposal to the authenticated GitHub user.
  proposal.draftSnapshot.contributor = session.login;
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
  try {
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
        );
      }
    }

    const manifestJson = JSON.stringify(proposal.manifest, null, 2) + '\n';
    await putFileEnsuringSha(
      env,
      token,
      branch,
      `${root}/theme.json`,
      `${commitPrefix}: ${commitVerb} theme manifest`,
      textToBase64(manifestJson),
    );

    await writeProposalDraftMetadata(env, token, branch, proposal, { authorLogin: session.login });

    await updateJsonFile(env, token, branch, 'index.json', `${commitPrefix}: ${isUpdate ? 'update' : 'register'} theme in catalog`, (current) => {
      return upsertCatalogEntry(current, proposal.catalogEntry);
    });

    const proposalLinks = buildProposalLinks(proposal.siteBaseUrl, proposal.id, branch);
    const screenshotPath = `${root}/${sanitizeRelativePath(proposal.files.previewScreenshot)}`;
    const pullRequestUrl = await openPullRequest(
      env,
      token,
      defaultBranch,
      branch,
      proposal.prTitle,
      buildPullRequestBody(proposal.prBody, proposalLinks, {
        owner: env.GITHUB_REPO_OWNER,
        repo: env.GITHUB_REPO_NAME,
        branch,
        path: screenshotPath,
        alt: proposal.name,
      }),
    );
    return jsonResponse({ pullRequestUrl, branchName: branch, ...proposalLinks }, 200, corsHeaders(request, env));
  } catch (cause) {
    if (!isUpdate) {
      await deleteBranch(env, token, branch).catch(() => undefined);
    }
    throw cause;
  }
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
      authorLogin: metadata.authorLogin || metadata.draftSnapshot.contributor || '',
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

function metadataThemeIdFromPath(path: string): string | undefined {
  const match = /^themes\/([^/]+)\/\.switchu-studio\.json$/.exec(path);
  return match?.[1];
}

function buildProposalAssetUrl(request: Request, branchName: string, proposalId: string, relativePath: string): string {
  const url = new URL('/api/proposals/asset', request.url);
  url.searchParams.set('branch', branchName);
  url.searchParams.set('id', proposalId);
  url.searchParams.set('path', relativePath);
  return url.toString();
}

async function handleListProposals(request: Request, env: Env, url: URL): Promise<Response> {
  const token = await getInstallationToken(env);
  const defaultBranch = await getDefaultBranch(env, token);
  const siteBaseUrl = sanitizeSiteBaseUrl(url.searchParams.get('siteBaseUrl') ?? undefined);
  const pulls = await githubFetch<GitHubPullResponse[]>(
    env,
    token,
    `${repoPath(env)}/pulls?state=open&base=${encodeURIComponent(defaultBranch)}&per_page=100`,
  );

  const proposals = await Promise.all(
    pulls
      .filter((pull) => pull.head.ref.startsWith('theme-studio/'))
      .map(async (pull) => {
        const files = await githubFetch<GitHubPullFileResponse[]>(
          env,
          token,
          `${repoPath(env)}/pulls/${pull.number}/files?per_page=100`,
        );
        const metadataFile = files.find((file) => metadataThemeIdFromPath(file.filename));
        const proposalId = metadataFile ? metadataThemeIdFromPath(metadataFile.filename) : undefined;
        if (!proposalId) {
          return undefined;
        }

        const metadata = await readProposalDraftMetadata(env, token, pull.head.ref, proposalId);
        const links = buildProposalLinks(siteBaseUrl, metadata.draftSnapshot.id, pull.head.ref);
        return {
          number: pull.number,
          title: pull.title,
          pullRequestUrl: pull.html_url,
          branchName: pull.head.ref,
          proposalId: metadata.draftSnapshot.id,
          name: metadata.draftSnapshot.name,
          author: metadata.draftSnapshot.author,
          version: metadata.draftSnapshot.version,
          mode: metadata.draftSnapshot.mode,
          proposalMode: metadata.draftSnapshot.proposalMode ?? 'create',
          contributor: metadata.draftSnapshot.contributor || pull.user?.login || '',
          authorLogin: metadata.authorLogin || metadata.draftSnapshot.contributor || pull.user?.login || '',
          createdAt: pull.created_at,
          updatedAt: pull.updated_at,
          coverUrl: buildProposalAssetUrl(request, pull.head.ref, metadata.draftSnapshot.id, 'media/screenshots/00.png'),
          ...links,
        };
      }),
        );

  return jsonResponse(
    { proposals: proposals.filter(Boolean) },
    200,
    corsHeaders(request, env),
  );
}

async function handleUpdateProposal(request: Request, env: Env, url: URL): Promise<Response> {
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
  const currentMetadata = await readProposalDraftMetadata(env, token, branch, proposal.id);
  if (!await hasEditorAccess(request, env, currentMetadata)) {
    return jsonResponse({ error: 'Forbidden: you are not the author of this proposal.' }, 403, corsHeaders(request, env));
  }

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
      );
    }
  }

  await writeProposalDraftMetadata(env, token, branch, proposal, { authorLogin: currentMetadata.authorLogin });
  await updateJsonFile(env, token, branch, 'index.json', `${commitPrefix}: update catalog entry`, (current) => {
    return upsertCatalogEntry(current, proposal.catalogEntry);
  });

  const proposalLinks = buildProposalLinks(proposal.siteBaseUrl, proposal.id, branch);
  return jsonResponse({ ok: true, branchName: branch, ...proposalLinks }, 200, corsHeaders(request, env));
}

const ICON_PACK_SLUG = /^[a-z0-9][a-z0-9-]*$/;
const ICON_PACK_GLYPH_FILE = /^[a-z0-9_.-]+\.png$/i;

async function handleCreateIconPack(request: Request, env: Env): Promise<Response> {
  const formData = await request.formData();
  const id = (formData.get('id') as string | null)?.trim() ?? '';
  const name = (formData.get('name') as string | null)?.trim() ?? id;
  const author = (formData.get('author') as string | null)?.trim() ?? '';

  if (!ICON_PACK_SLUG.test(id)) {
    return jsonResponse({ error: 'Pack ID must be lowercase letters, digits, and hyphens.' }, 400, corsHeaders(request, env));
  }

  let glyphFileNames: string[] = [];
  try {
    const raw = formData.get('glyphFiles');
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : [];
    glyphFileNames = Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return jsonResponse({ error: 'Invalid glyphFiles payload.' }, 400, corsHeaders(request, env));
  }

  const glyphs: Array<{ fileName: string; file: File }> = [];
  for (const fileName of glyphFileNames) {
    if (!ICON_PACK_GLYPH_FILE.test(fileName)) {
      return jsonResponse({ error: `Invalid glyph filename: ${fileName}` }, 400, corsHeaders(request, env));
    }
    const value = formData.get(`glyph:${fileName}`);
    if (!(value instanceof File)) {
      return jsonResponse({ error: `Missing glyph file: ${fileName}` }, 400, corsHeaders(request, env));
    }
    glyphs.push({ fileName, file: value });
  }

  if (glyphs.length === 0) {
    return jsonResponse({ error: 'No glyph files provided.' }, 400, corsHeaders(request, env));
  }

  // Icon packs live in this catalog repo (icons/<id>/), next to the themes, so
  // the console can list and download them like themes.
  const token = await getInstallationToken(env);
  const base = await getDefaultBranch(env, token);
  const branch = `icon-pack/${id}-${Date.now().toString(36)}`;
  await createBranch(env, token, branch, await getBranchSha(env, token, base));

  const glyphNames: string[] = [];
  for (const glyph of glyphs) {
    const contentBase64 = arrayBufferToBase64(await glyph.file.arrayBuffer());
    await putFile(env, token, branch, `icons/${id}/${glyph.fileName}`, `icon pack ${id}: add ${glyph.fileName}`, contentBase64);
    glyphNames.push(glyph.fileName);
  }

  const coverName = glyphNames.find((fileName) => fileName === 'preview.png')
    ?? glyphNames.find((fileName) => fileName === 'album.png')
    ?? glyphNames[0];
  const packManifest = {
    id,
    name,
    author: author || 'Community',
    version: '1.0.0',
    description: 'Community icon pack submitted from SwitchU Themes Studio.',
    colour: true,
    builtin: false,
    preview: coverName,
    glyphs: glyphNames,
  };
  const manifestBytes = new TextEncoder().encode(`${JSON.stringify(packManifest, null, 2)}\n`);
  await putFile(
    env,
    token,
    branch,
    `icons/${id}/pack.json`,
    `icon pack ${id}: add manifest`,
    arrayBufferToBase64(manifestBytes.buffer as ArrayBuffer),
  );

  await updateJsonFile(env, token, branch, 'index.json', `icon pack ${id}: update catalog`, (current) => {
    return upsertIconCatalogEntry(current, {
      id,
      name,
      author: packManifest.author,
      version: packManifest.version,
      description: packManifest.description,
      path: `icons/${id}`,
      manifest: `icons/${id}/pack.json`,
      cover: `icons/${id}/${coverName}`,
      builtin: false,
      colour: true,
    });
  });

  // Embed the mosaic (or fallback cover) from this PR branch so reviewers can
  // see the pack before merge without checking out locally.
  const previewRawUrl =
    `https://raw.githubusercontent.com/${env.GITHUB_REPO_OWNER}/${env.GITHUB_REPO_NAME}/${branch}/icons/${id}/${coverName}`;
  const prBody = [
    'Icon pack submitted from SwitchU Themes Studio.',
    '',
    `Pack: **${name}** (\`${id}\`)`,
    author ? `Author: ${author}` : '',
    '',
    '### Preview',
    '',
    `![${name} icon pack](${previewRawUrl})`,
    '',
    `<sub>Source: \`icons/${id}/${coverName}\` on branch \`${branch}\`</sub>`,
    '',
    `Published under \`icons/${id}/\` and listed in \`index.json\` so the console shop can install it.`,
  ].filter(Boolean).join('\n');

  const pullRequestUrl = await openPullRequest(env, token, base, branch, `Add icon pack ${id}`, prBody);

  return jsonResponse({ ok: true, branchName: branch, pullRequestUrl }, 200, corsHeaders(request, env));
}

function safeRedirectTarget(value: string | undefined): string {
  const target = value?.trim();
  if (!target) {
    return '';
  }

  try {
    const url = new URL(target);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return '';
    }
    return url.toString();
  } catch {
    return '';
  }
}

async function handleAuthToken(request: Request, env: Env): Promise<Response> {
  const body = await request.json().catch(() => ({})) as { code?: string };
  const code = body.code?.trim();
  if (!code) {
    return jsonResponse({ error: 'Missing OAuth code.' }, 400, corsHeaders(request, env));
  }

  const accessToken = await exchangeOAuthCode(env, code);
  const user = await fetchGitHubUser(accessToken);
  const session = await createSessionToken(env, user);

  return jsonResponse(
    {
      session,
      user: { login: user.login, name: user.name, avatarUrl: user.avatarUrl },
    },
    200,
    corsHeaders(request, env),
  );
}

async function handleAuthCallback(request: Request, env: Env, url: URL): Promise<Response> {
  const code = url.searchParams.get('code')?.trim();
  const stateRaw = url.searchParams.get('state') ?? '';
  const state = stateRaw ? JSON.parse(decodeURIComponent(stateRaw)) : {};
  const site = safeRedirectTarget(typeof state === 'object' && state !== null ? (state as { site?: string }).site : undefined);

  if (!code) {
    return jsonResponse({ error: 'Missing OAuth code.' }, 400, corsHeaders(request, env));
  }

  try {
    const accessToken = await exchangeOAuthCode(env, code);
    const user = await fetchGitHubUser(accessToken);
    const session = await createSessionToken(env, user);

    if (!site) {
      return jsonResponse({ session, user: { login: user.login, name: user.name, avatarUrl: user.avatarUrl } }, 200, corsHeaders(request, env));
    }

    const redirect = new URL(site);
    redirect.searchParams.set('session', session);
    return Response.redirect(redirect.toString(), 302);
  } catch (cause) {
    if (site) {
      const redirect = new URL(site);
      redirect.searchParams.set('auth_error', encodeURIComponent(cause instanceof Error ? cause.message : 'OAuth failed'));
      return Response.redirect(redirect.toString(), 302);
    }
    return jsonResponse({ error: cause instanceof Error ? cause.message : 'OAuth failed' }, 500, corsHeaders(request, env));
  }
}

async function handleAuthSession(request: Request, env: Env): Promise<Response> {
  const session = await readSession(request, env);
  if (!session) {
    return jsonResponse({ error: 'Not authenticated.' }, 401, corsHeaders(request, env));
  }

  return jsonResponse(
    { user: { login: session.login, name: session.name, avatarUrl: session.avatarUrl } },
    200,
    corsHeaders(request, env),
  );
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

      if (request.method === 'GET' && url.pathname === '/api/auth') {
        return jsonResponse({ clientId: env.GITHUB_OAUTH_CLIENT_ID?.trim() || '' }, 200, corsHeaders(request, env));
      }

      if (request.method === 'GET' && url.pathname === '/api/auth/callback') {
        return await handleAuthCallback(request, env, url);
      }

      if (request.method === 'POST' && url.pathname === '/api/auth/token') {
        return await handleAuthToken(request, env);
      }

      if (request.method === 'GET' && url.pathname === '/api/auth/session') {
        return await handleAuthSession(request, env);
      }

      if (request.method === 'GET' && url.pathname === '/api/proposals/draft') {
        return await handleGetProposalDraft(request, env, url);
      }

      if (request.method === 'GET' && url.pathname === '/api/proposals/asset') {
        return await handleGetProposalAsset(request, env, url);
      }

      if (request.method === 'GET' && url.pathname === '/api/proposals') {
        return await handleListProposals(request, env, url);
      }

      if (request.method === 'POST' && url.pathname === '/api/proposals') {
        return await handleCreateProposal(request, env);
      }

      if (request.method === 'POST' && url.pathname === '/api/proposals/update') {
        return await handleUpdateProposal(request, env, url);
      }

      if (request.method === 'POST' && url.pathname === '/api/icon-packs') {
        return await handleCreateIconPack(request, env);
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
