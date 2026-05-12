import { importPKCS8, SignJWT } from 'jose';

interface Env {
  GITHUB_APP_ID: string;
  GITHUB_INSTALLATION_ID: string;
  GITHUB_PRIVATE_KEY: string;
  GITHUB_REPO_OWNER: string;
  GITHUB_REPO_NAME: string;
  GITHUB_DEFAULT_BRANCH?: string;
  ALLOWED_ORIGIN?: string;
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
  name: string;
  manifest: unknown;
  catalogEntry: CatalogEntry;
  prTitle: string;
  prBody: string;
  files: {
    previewScreenshot: string;
    backgroundImage?: string;
    regularFont?: string;
    smallFont?: string;
    music?: string;
    sfx?: Record<string, string>;
  };
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
    'access-control-allow-headers': 'Content-Type',
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

function normalizePrivateKey(value: string): string {
  return value.replace(/\\n/g, '\n').trim();
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

async function githubFetch<T>(
  env: Env,
  token: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'User-Agent': 'switchu-themes-pr-proxy',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.headers ?? {}),
    },
  });

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
  await putFile(env, token, branch, repoFilePath, message, contentBase64);
}

function validateProposal(input: unknown): ProposalPayload {
  if (!input || typeof input !== 'object') {
    throw new Error('Invalid proposal payload');
  }

  const proposal = input as ProposalPayload;
  if (!proposal.catalogEntry || !proposal.files) {
    throw new Error('Incomplete proposal payload');
  }

  proposal.id = sanitizeThemeId(proposal.id);
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
  const defaultSha = await getBranchSha(env, token, defaultBranch);
  const branch = `theme-studio/${proposal.id}-${Date.now()}`;
  await createBranch(env, token, branch, defaultSha);

  const existingCatalog = await getContent(env, token, 'index.json', defaultBranch);
  const catalog = existingCatalog.content
    ? (JSON.parse(decodeContent(existingCatalog.content)) as { schemaVersion: number; themes: CatalogEntry[] })
    : { schemaVersion: 1, themes: [] };

  if (catalog.themes.some((entry) => entry.id === proposal.id)) {
    return jsonResponse({ error: `A theme with id '${proposal.id}' already exists.` }, 409, corsHeaders(request, env));
  }

  const root = `themes/${proposal.id}`;
  const commitPrefix = `[theme-studio] ${proposal.id}`;

  await uploadBinaryFile(
    env,
    token,
    branch,
    root,
    proposal.files.previewScreenshot,
    requireFile(formData, 'previewScreenshot'),
    `${commitPrefix}: add preview screenshot`,
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
      `${commitPrefix}: add background image`,
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
      `${commitPrefix}: add regular font`,
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
      `${commitPrefix}: add small font`,
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
      `${commitPrefix}: add background music`,
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
        `${commitPrefix}: add ${name} sfx`,
      );
    }
  }

  const manifestJson = JSON.stringify(proposal.manifest, null, 2) + '\n';
  await putFile(
    env,
    token,
    branch,
    `${root}/theme.json`,
    `${commitPrefix}: add theme manifest`,
    textToBase64(manifestJson),
  );

  await updateJsonFile(env, token, branch, 'index.json', `${commitPrefix}: register theme in catalog`, (current) => {
    const nextCatalog = current as { schemaVersion: number; themes: CatalogEntry[] };
    nextCatalog.themes = [...nextCatalog.themes, proposal.catalogEntry].sort((left, right) => left.name.localeCompare(right.name));
    return nextCatalog;
  });

  const pullRequestUrl = await openPullRequest(env, token, defaultBranch, branch, proposal.prTitle, proposal.prBody);
  return jsonResponse({ pullRequestUrl, branchName: branch }, 200, corsHeaders(request, env));
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

      if (request.method === 'POST' && url.pathname === '/api/proposals') {
        return await handleCreateProposal(request, env);
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