const BASE = 'https://api.github.com';

function encodePath(filePath) {
  return filePath.split('/').map(encodeURIComponent).join('/');
}

function splitLines(text) {
  if (!text) return [];
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
}

function lcsLength(a, b) {
  if (!a.length || !b.length) return 0;
  if (a.length < b.length) return lcsLength(b, a);

  let prev = new Array(b.length + 1).fill(0);
  let curr = new Array(b.length + 1).fill(0);

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      curr[j] = a[i - 1] === b[j - 1]
        ? prev[j - 1] + 1
        : Math.max(prev[j], curr[j - 1]);
    }
    [prev, curr] = [curr, prev];
    curr.fill(0);
  }

  return prev[b.length];
}

function getLineDiffStats(beforeContent = '', afterContent = '') {
  const before = splitLines(beforeContent);
  const after = splitLines(afterContent);

  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) {
    start++;
  }

  let beforeEnd = before.length - 1;
  let afterEnd = after.length - 1;
  while (beforeEnd >= start && afterEnd >= start && before[beforeEnd] === after[afterEnd]) {
    beforeEnd--;
    afterEnd--;
  }

  const beforeCore = before.slice(start, beforeEnd + 1);
  const afterCore = after.slice(start, afterEnd + 1);
  if (!beforeCore.length && !afterCore.length) {
    return { addedLines: 0, removedLines: 0 };
  }
  if (!beforeCore.length) {
    return { addedLines: afterCore.length, removedLines: 0 };
  }
  if (!afterCore.length) {
    return { addedLines: 0, removedLines: beforeCore.length };
  }

  const complexity = beforeCore.length * afterCore.length;
  if (complexity > 2_000_000) {
    return { addedLines: afterCore.length, removedLines: beforeCore.length };
  }

  const shared = lcsLength(beforeCore, afterCore);
  return {
    addedLines: afterCore.length - shared,
    removedLines: beforeCore.length - shared,
  };
}

async function ghFetch(urlPath, token, options = {}) {
  const { headers: extraHeaders, ...rest } = options;
  const res = await fetch(`${BASE}${urlPath}`, {
    ...rest,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'Adonix-Web',
      ...extraHeaders,
    },
  });
  if (!res.ok) {
    if (res.status === 401) {
      throw new Error('Token de GitHub inválido o expirado. Reconfigura en ajustes.');
    }
    const text = await res.text().catch(() => '');
    throw new Error(`GitHub ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

async function getViewer(token) {
  const user = await ghFetch('/user', token);
  return {
    login: user.login || '',
    name: user.name || user.login || '',
    email: user.email || '',
  };
}

async function validateToken(token) {
  try {
    return await getViewer(token);
  } catch {
    return null;
  }
}

async function listRepos(token) {
  const repos = await ghFetch('/user/repos?sort=pushed&per_page=50', token);
  return repos.map(r => ({
    name: r.name,
    owner: r.owner.login,
    fullName: r.full_name,
    description: r.description || '',
    language: r.language || '',
    private: r.private,
    updatedAt: r.updated_at,
    defaultBranch: r.default_branch,
  }));
}

async function getTree(token, owner, repo) {
  const repoData = await ghFetch(`/repos/${owner}/${repo}`, token);
  const branch = repoData.default_branch || 'main';
  const data = await ghFetch(
    `/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
    token,
  );
  return data.tree
    .filter(t => t.type === 'blob')
    .map(t => ({ path: t.path, size: t.size }));
}

async function readFile(token, owner, repo, filePath) {
  const data = await ghFetch(`/repos/${owner}/${repo}/contents/${encodePath(filePath)}`, token);
  return {
    content: Buffer.from(data.content, 'base64').toString('utf8'),
    sha: data.sha,
  };
}

async function writeFile(token, owner, repo, filePath, content, author = {}) {
  let sha;
  let previousContent = '';
  try {
    const existing = await ghFetch(
      `/repos/${owner}/${repo}/contents/${encodePath(filePath)}`,
      token,
    );
    sha = existing.sha;
    previousContent = Buffer.from(existing.content || '', 'base64').toString('utf8');
  } catch {}

  const filename = filePath.split('/').pop();
  const body = {
    message: `Update ${filename}`,
    content: Buffer.from(content).toString('base64'),
    committer: {
      name: author.name || 'Adonix',
      email: author.email || 'adonix@bot.local',
    },
  };
  if (sha) body.sha = sha;

  const result = await ghFetch(`/repos/${owner}/${repo}/contents/${encodePath(filePath)}`, token, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const diffStats = getLineDiffStats(previousContent, content);

  return {
    path: result.content?.path || filePath,
    addedLines: diffStats.addedLines,
    removedLines: diffStats.removedLines,
    commitMessage: result.commit?.message || body.message,
    commitSha: result.commit?.sha || '',
    commitUrl: result.commit?.html_url || '',
    authorName: result.commit?.committer?.name || body.committer.name,
    authorEmail: result.commit?.committer?.email || body.committer.email,
  };
}

module.exports = {
  listRepos,
  getTree,
  readFile,
  writeFile,
  validateToken,
  getViewer,
};
