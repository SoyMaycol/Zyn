const express = require('express');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const store = require('./store');
const githubApi = require('./githubApi');
const { runWebAgent } = require('./webAgent');
const { MODELS, DEFAULT_MODEL_KEY, GEMINI_MODEL_WARNING, listProvidersFromModels, DEFAULT_LANGUAGE, USER_WEB_ROOT } = require('../config');

const app = express();
const HOST = process.env.HOST || process.env.ZYN_WEB_HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || process.env.ZYN_WEB_PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, 'public');
const WEB_UI_FILE = path.join(PUBLIC_DIR, 'index.html');

// Evitar crashes silenciosos
process.on('uncaughtException', (err) => {
  console.error('[FATAL]', err.message, err.stack);
});
process.on('unhandledRejection', (err) => {
  console.error('[UNHANDLED]', err);
});

app.use(express.json({ limit: '5mb' }));
// No cache para HTML
app.use((req, res, next) => {
  if (req.path === '/' || req.path.endsWith('.html')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
  }
  next();
});
app.get('/', (req, res) => {
  res.sendFile(WEB_UI_FILE);
});
app.use('/assets', express.static(PUBLIC_DIR, { index: false }));
app.use(express.static(PUBLIC_DIR, { index: false }));
// Persistir secreto de sesion en disco
const SECRET_FILE = path.join(USER_WEB_ROOT, '.session-secret');
let sessionSecret;
try {
  sessionSecret = fs.readFileSync(SECRET_FILE, 'utf8').trim();
} catch {
  sessionSecret = crypto.randomBytes(32).toString('hex');
  fs.mkdirSync(path.dirname(SECRET_FILE), { recursive: true });
  fs.writeFileSync(SECRET_FILE, sessionSecret);
}

// Asegurar que el directorio de sesiones existe
const SESSION_DIR = path.join(USER_WEB_ROOT, 'sessions');
fs.mkdirSync(SESSION_DIR, { recursive: true });

app.use(session({
  store: new FileStore({
    path: SESSION_DIR,
    ttl: 30 * 24 * 60 * 60,
    retries: 0,
    logFn: () => {},
  }),
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 30 * 24 * 60 * 60 * 1000, httpOnly: true },
}));

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

// ─── Auth ────────────────────────────────────────────

app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    if (username.length < 3 || password.length < 4) {
      return res.status(400).json({ error: 'Minimum 3 chars username, 4 chars password' });
    }
    if (store.getUser(username)) {
      return res.status(409).json({ error: 'User already exists' });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    store.createUser({ username, passwordHash });
    req.session.userId = username;
    res.json({ success: true, username });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = store.getUser(username);
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    req.session.userId = username;
    res.json({ success: true, username });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  const user = store.getUser(req.session.userId);
  res.json({
    username: user.username,
    hasGithub: !!user.githubToken,
    githubEmail: user.githubEmail || '',
    githubUsername: user.githubUsername || '',
  });
});

// ─── Settings ────────────────────────────────────────

app.put('/api/settings', requireAuth, async (req, res) => {
  try {
    const { githubToken, githubEmail } = req.body;
    const updates = {};

    if (githubToken) {
      const profile = await githubApi.validateToken(githubToken);
      if (!profile) {
        return res.status(400).json({ error: 'Invalid or expired GitHub token' });
      }
      updates.githubToken = githubToken;
      updates.githubUsername = profile.login || '';
      updates.githubName = profile.name || profile.login || '';
      updates.githubEmail = githubEmail || profile.email || '';
    } else if (githubEmail !== undefined) {
      updates.githubEmail = githubEmail;
    }

    store.updateUser(req.session.userId, updates);
    res.json({ success: true, githubUsername: updates.githubUsername || '' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


app.get('/api/providers', requireAuth, (req, res) => {
  const providers = listProvidersFromModels(MODELS).map(provider => ({
    key: provider.key,
    label: provider.label,
    models: provider.models.map(model => ({
      key: model.key,
      label: model.label,
      provider: model.provider,
    })),
  }));
  res.json({ providers });
});

// ─── Models ──────────────────────────────────────────

app.get('/api/models', requireAuth, (req, res) => {
  const models = Object.entries(MODELS).map(([key, val]) => ({
    key,
    label: val.label,
    provider: val.provider,
  }));
  res.json({ models, default: DEFAULT_MODEL_KEY });
});

// ─── GitHub ──────────────────────────────────────────

app.get('/api/repos', requireAuth, async (req, res) => {
  try {
    const user = store.getUser(req.session.userId);
    if (!user.githubToken) {
      return res.status(400).json({ error: 'Set your GitHub token first' });
    }
    const repos = await githubApi.listRepos(user.githubToken);
    res.json(repos);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/repos/:owner/:repo/tree', requireAuth, async (req, res) => {
  try {
    const user = store.getUser(req.session.userId);
    const tree = await githubApi.getTree(
      user.githubToken, req.params.owner, req.params.repo,
    );
    res.json(tree);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Chats ───────────────────────────────────────────

app.get('/api/chats', requireAuth, (req, res) => {
  res.json(store.getUserChats(req.session.userId));
});

app.post('/api/chats', requireAuth, (req, res) => {
  const { repoOwner, repoName } = req.body;
  if (!repoOwner || !repoName) {
    return res.status(400).json({ error: 'Repository required' });
  }
  const chat = store.createChat(req.session.userId, repoOwner, repoName);
  res.json(chat);
});

app.get('/api/chats/:id', requireAuth, (req, res) => {
  const chat = store.getChat(req.params.id);
  if (!chat || chat.userId !== req.session.userId) {
    return res.status(404).json({ error: 'Chat not found' });
  }
  res.json(chat);
});

app.put('/api/chats/:id/settings', requireAuth, (req, res) => {
  const chat = store.getChat(req.params.id);
  if (!chat || chat.userId !== req.session.userId) {
    return res.status(404).json({ error: 'Chat not found' });
  }
  const { activeModel, concuerdo, language } = req.body;
  let warning = '';
  if (activeModel !== undefined) {
    if (!MODELS[activeModel]) {
      return res.status(400).json({ error: 'Invalid model' });
    }
    chat.activeModel = activeModel;
    if (MODELS[activeModel]?.provider === 'gemini') warning = GEMINI_MODEL_WARNING;
  }
  if (concuerdo !== undefined) chat.concuerdo = Boolean(concuerdo);
  if (language !== undefined) chat.language = String(language || DEFAULT_LANGUAGE).toLowerCase().startsWith('es') ? 'es' : 'en';
  store.saveChat(chat);
  res.json({ success: true, activeModel: chat.activeModel, concuerdo: chat.concuerdo, language: chat.language || DEFAULT_LANGUAGE, warning });
});

app.delete('/api/chats/:id', requireAuth, (req, res) => {
  const chat = store.getChat(req.params.id);
  if (!chat || chat.userId !== req.session.userId) {
    return res.status(404).json({ error: 'Chat not found' });
  }
  store.deleteChat(req.params.id);
  res.json({ success: true });
});

// ─── Chat Send (SSE streaming) ──────────────────────

app.post('/api/chats/:id/undo', requireAuth, (req, res) => {
  const chat = store.getChat(req.params.id);
  if (!chat || chat.userId !== req.session.userId) return res.status(404).json({ error: 'Chat not found' });
  const next = store.undoChatMessage(req.params.id);
  if (!next) return res.status(400).json({ error: 'Nothing to undo' });
  res.json({ success: true, chat: next });
});

app.post('/api/chats/:id/redo', requireAuth, (req, res) => {
  const chat = store.getChat(req.params.id);
  if (!chat || chat.userId !== req.session.userId) return res.status(404).json({ error: 'Chat not found' });
  const next = store.redoChatMessage(req.params.id);
  if (!next) return res.status(400).json({ error: 'Nothing to redo' });
  res.json({ success: true, chat: next });
});

app.post('/api/chats/:id/send', requireAuth, async (req, res) => {
  const chat = store.getChat(req.params.id);
  if (!chat || chat.userId !== req.session.userId) {
    return res.status(404).json({ error: 'Chat not found' });
  }

  const user = store.getUser(req.session.userId);
  if (!user.githubToken) {
    return res.status(400).json({ error: 'Set your GitHub token' });
  }

  const { message } = req.body;
  if (!message?.trim()) {
    return res.status(400).json({ error: 'Empty message' });
  }
  const trimmedMessage = message.trim();

  if (trimmedMessage.startsWith('/')) {
    const command = trimmedMessage.toLowerCase();
    if (command === '/undo') {
      const next = store.undoChatMessage(req.params.id);
      return res.json({ success: true, command: 'undo', chat: next || chat });
    }
    if (command === '/redo') {
      const next = store.redoChatMessage(req.params.id);
      return res.json({ success: true, command: 'redo', chat: next || chat });
    }
    if (command === '/models') {
      return res.json({
        success: true,
        command: 'models',
        output: Object.entries(MODELS).map(([key, val]) => `${key}: ${val.label} (${val.provider})`).join('\n'),
      });
    }
    if (command === '/providers') {
      return res.json({
        success: true,
        command: 'providers',
        output: listProvidersFromModels(MODELS)
          .map(provider => `${provider.key}: ${provider.models.map(model => model.key).join(', ')}`)
          .join('\n'),
      });
    }
    if (command === '/skills') {
      const { listSkills } = require('../core/skills');
      return res.json({
        success: true,
        command: 'skills',
        output: listSkills().map(skill => `${skill.name} - ${skill.title}`).join('\n'),
      });
    }
  }

  chat.messages.push({ role: 'user', content: trimmedMessage, ts: Date.now() });
  store.saveChat(chat);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  let aborted = false;
  req.on('close', () => { aborted = true; });

  try {
    await runWebAgent({
      chatData: chat,
      user,
      onEvent: (event) => {
        if (!aborted) res.write(`data: ${JSON.stringify(event)}\n\n`);
      },
      isAborted: () => aborted,
    });
  } catch (err) {
    console.error(`[Agent Error] ${err.message}`);
    if (!aborted) {
      res.write(`data: ${JSON.stringify({ type: 'error', content: err.message })}\n\n`);
    }
  }

  if (!aborted) {
    res.write('data: [DONE]\n\n');
    res.end();
  }
});

// ─── SPA fallback ────────────────────────────────────

app.get('/{*splat}', (req, res) => {
  res.sendFile(WEB_UI_FILE);
});

app.listen(PORT, HOST, () => {
  console.log(`\n  \u25cf Zyn Web \u2192 http://${HOST}:${PORT}\n`);
});
