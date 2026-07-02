const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');

let _shellCommand = null;
function detectShell() {
  if (_shellCommand) return _shellCommand;
  try {
    execSync('bash --version', { stdio: 'ignore', timeout: 2000 });
    _shellCommand = 'bash';
  } catch {
    _shellCommand = 'sh';
  }
  return _shellCommand;
}

const fsp = fs.promises;

const {
  MAX_FILE_LINES,
} = require('../config');

function t(lang, es, en) {
  return lang === 'es' ? es : en;
}
const {
  buildApiHeaders,
  buildCloneUrl,
  getApiBaseUrl,
  listGitSecrets,
  normalizeProfileName,
  removeGitSecret,
  resolveGitProfile,
  upsertGitSecret,
} = require('../utils/secretStorage');
const { resolveInputPath } = require('../utils/pathUtils');
const { getGmailAuthStatus, gmailApiRequest } = require('../utils/gmailAuth');
const { loadSkill, listSkills } = require('../core/skills');
const {
  formatLineRange,
  shortText,
  truncateText,
} = require('../utils/text');

const TOOL_DEFINITIONS = [
  { name: 'list_dir', usage: '{ path? }' },
  { name: 'read_file', usage: '{ path, startLine?, endLine?, offset?, limit? }' },
  { name: 'search_text', usage: '{ pattern, path?, glob? }' },
  { name: 'glob_files', usage: '{ pattern, path? }' },
  { name: 'file_info', usage: '{ path }' },
  { name: 'run_command', usage: '{ command, timeoutMs? }' },
  { name: 'make_dir', usage: '{ path }' },
  { name: 'write_file', usage: '{ path, content }' },
  { name: 'append_file', usage: '{ path, content }' },
  { name: 'replace_in_file', usage: '{ path, search, replace, all? }' },
  { name: 'fetch_url', usage: '{ url, selector?, attribute?, limit?, headers? }' },
  { name: 'fetch', usage: '{ url, method?, headers?, query?, json?, data?, form?, files?, timeoutMs? }' },
  { name: 'fetch_http', usage: '{ url, method?, headers?, query?, json?, data?, form?, files?, timeoutMs? }' },
  { name: 'webfetch', usage: '{ url, headers?, timeoutMs? }' },
  { name: 'scrape_site', usage: '{ url, selectors, limit?, headers? }' },
  { name: 'web_search', usage: '{ query, lang?, limit? }' },
  { name: 'web_read', usage: '{ url }' },
  { name: 'upload_file', usage: '{ path, field?, name?, type? }' },
  { name: 'gmail', usage: '{ action, query?, maxResults?, id?, to?, subject?, body? }' },
  { name: 'create_canvas_image', usage: '{ width, height, background?, elements?, format?, outputPath? }' },
  { name: 'git', usage: '{ provider, action, method?, path?, body?, headers?, name?, repoUrl?, destination?, branch?, timeoutMs? }' },
  { name: 'load_skill', usage: '{ name }' },
  { name: 'memory', usage: '{ action, key?, value?, query? }' },
  { name: 'ask_user', usage: '{ question, options }' },
];
const REGISTERED_TOOLS = new Set(TOOL_DEFINITIONS.map(tool => tool.name));

function getToolPromptText() {
  return [
    '## Lectura y navegacion',
    '',
    'list_dir { path? }',
    '  Lista archivos y carpetas ordenados. Sin path usa directorio actual.',
    '',
    'read_file { path, startLine?, endLine?, offset?, limit? }',
    '  Lee contenido con numeros de linea. Max 10000 lineas por llamada.',
    '  startLine/endLine: lineas 1-indexadas. offset/limit: 0-indexados.',
    '  Ej: {"offset":0,"limit":50} lee primeras 50 lineas.',
    '',
    'search_text { pattern, path?, glob? }',
    '  Busca patron regex en archivos (ripgrep). path: directorio base.',
    '  glob: filtro de archivos (ej: "**/*.js"). Ejemplo completo:',
    '  {"type":"tool","tool":"search_text","args":{"pattern":"TODO|FIXME","path":"src","glob":"**/*.js"}}',
    '',
    'glob_files { pattern, path? }',
    '  Busca archivos por patron glob. Ejemplo:',
    '  {"type":"tool","tool":"glob_files","args":{"pattern":"**/*.test.js","path":"src"}}',
    '',
    'file_info { path }',
    '  Metadata: tamano, tipo, fechas de creacion y modificacion.',
    '',
    '## Escritura y edicion',
    '',
    'write_file { path, content }',
    '  Crea o sobrescribe archivo. Crea directorios padres automaticamente.',
    '',
    'append_file { path, content }',
    '  Agrega contenido al final de un archivo existente.',
    '',
    'replace_in_file { path, search, replace, all? }',
    '  Reemplaza texto literal (NO regex) en archivo.',
    '  search debe coincidir EXACTAMENTE incluyendo espacios y saltos de linea.',
    '  all=true reemplaza todas las coincidencias (default: solo primera).',
    '',
    'make_dir { path }',
    '  Crea directorio y padres necesarios.',
    '',
    '## Ejecucion',
    '',
    'run_command { command, timeoutMs }',
    '  Ejecuta comando en bash. timeoutMs es OBLIGATORIO.',
    '  Timeout recomendados: 5000 (rapido), 30000 (normal), 60000 (largo), 120000 (muy largo).',
    '  Para servidores usa timeoutMs: 10000 y verifica si quedo vivo con otro comando.',
    '  Retorna exit code, stdout y stderr.',
    '  Usa flags no-interactivos: -y, --yes, --no-pager, DEBIAN_FRONTEND=noninteractive.',
    '  Ejemplo: {"type":"tool","tool":"run_command","args":{"command":"ls -la","timeoutMs":5000}}',
    '  Ejemplo servidor: {"type":"tool","tool":"run_command","args":{"command":"node server.js &","timeoutMs":10000}}',
    '',
    '## Web',
    '',
    'fetch_url { url, selector?, attribute?, limit? }',
    '  Sin selector: retorna HTML completo de la pagina.',
    '  Con selector CSS (ej: "h1", ".price"): extrae texto de elementos.',
    '  Con selector + attribute (ej: "href", "src"): extrae atributo.',
    '  limit: max elementos a extraer (default: 20, max: 50).',
    '  Ejemplo (extraer titulos): {"type":"tool","tool":"fetch_url","args":{"url":"https://news.ycombinator.com","selector":".titleline > a"}}',
    '  Ejemplo (extraer links de imagenes): {"type":"tool","tool":"fetch_url","args":{"url":"https://example.com","selector":"img","attribute":"src","limit":10}}',
    '',
    'fetch_http { url, method?, headers?, query?, json?, data?, form?, files?, timeoutMs? }',
    '  Cliente HTTP avanzado: soporta headers custom, query params, body JSON/texto, form-data y adjuntar archivos.',
    '  Ejemplo GET: {"type":"tool","tool":"fetch_http","args":{"url":"https://api.github.com/users/octocat","method":"GET"}}',
    '  Ejemplo POST JSON: {"type":"tool","tool":"fetch_http","args":{"url":"https://api.example.com/items","method":"POST","json":true,"data":{"name":"test","value":42},"headers":{"Authorization":"Bearer token123"}}}',
    '  Ejemplo con query params: {"type":"tool","tool":"fetch_http","args":{"url":"https://api.example.com/search","query":{"q":"hello","page":1}}}',
    '',
    'fetch { url, method?, headers?, query?, json?, data?, form?, files?, timeoutMs? }',
    '  Alias profesional recomendado para solicitudes HTTP avanzadas.',
    '',
    'webfetch { url, headers?, timeoutMs? }',
    '  Descarga una pagina web y la convierte a Markdown estructurado (enlaces, botones, imagenes, texto).',
    '',
    'scrape_site { url, selectors, limit?, headers? }',
    '  Scraping avanzado con multiples selectores en una sola llamada.',
    '  selectors: objeto con nombres y selectores CSS. Ejemplo:',
    '  {"type":"tool","tool":"scrape_site","args":{"url":"https://news.ycombinator.com","selectors":{"titulos":".titleline > a","urls":".titleline > a","scores":".score"},"limit":10}}',
    '',
    'web_search { query, lang?, limit? }',
    '  Busca en la web via DuckDuckGo. Retorna titulo, URL y snippet de los primeros resultados.',
    '  Si el usuario pide investigar algo, realiza la busqueda en lugar de explicar como hacerlo.',
    '  Ejemplo: {"type":"tool","tool":"web_search","args":{"query":"como usar puppeteer node"}}',
    '',
    'web_read { url }',
    '  Descarga una pagina web y la convierte a texto legible (sin HTML).',
    '  Ideal para leer articulos, documentacion o contenido de paginas.',
    '  Ejemplo: {"type":"tool","tool":"web_read","args":{"url":"https://docs.example.com/guide"}}',
    '',
    'upload_file { path, field?, name?, type? }',
    '  Sube un archivo local a https://cdn.soymaycol.icu/upload por POST multipart/form-data y devuelve el link directo.',
    '  Limite estricto: maximo 5 MB. field por defecto: "file". name/type son opcionales.',
    '  Usa esta tool cuando necesites entregar un archivo como enlace directo al agente o al usuario.',
    '  Ejemplo: {"type":"tool","tool":"upload_file","args":{"path":"dist/116.zip"}}',
    '',
    'gmail { action, query?, maxResults?, id?, to?, subject?, body? }',
    '  Usa Gmail conectado con /gmail connect. Acciones: status, list, read, send.',
    '  list: query usa la sintaxis de busqueda de Gmail; maxResults default 10, max 20.',
    '  read: requiere id de mensaje. send: requiere to, subject y body; pide confirmacion antes de enviar.',
    '  Ejemplo listar: {"type":"tool","tool":"gmail","args":{"action":"list","query":"is:unread newer_than:7d","maxResults":5}}',
    '  Ejemplo leer: {"type":"tool","tool":"gmail","args":{"action":"read","id":"MESSAGE_ID"}}',
    '',
    '## Imagen profesional con Jimp',
    '',
    'create_canvas_image { width, height, background?, elements?, format?, outputPath? }',
    '  Crea imagenes desde cero usando Jimp con composicion por elementos.',
    '  width/height son obligatorios. background puede ser color HEX (#RRGGBB o #RRGGBBAA).',
    '  elements permite combinar rect, circle/ellipse, line, text e image.',
    '  Para tutoriales y plantillas, carga la skill: jimp-advanced',
    '',
    '  Tipos de elementos soportados:',
    '    rect: { type:"rect", x, y, w, h, fill?, radius?, stroke? }',
    '    circle/ellipse: { type:"circle", x, y, r } o { type:"ellipse", x, y, rx, ry, fill }',
    '    line: { type:"line", x1, y1, x2, y2, stroke }',
    '    image: { type:"image", src, x, y, w?, h? }',
    '    text: { type:"text", x, y, text, fontSize?, maxWidth? }',
    '',
    '## Git - Control total de API',
    '',
    'git { provider, action, method?, path?, body?, headers?, name?, repoUrl?, destination?, branch?, timeoutMs? }',
    '  Unica herramienta Git. Control total sobre la API del proveedor.',
    '  provider: "github", "gitlab" o "custom". name: identificador para perfil custom.',
    '  action: "api" | "clone"',
    '',
    '  action="api" — cualquier operacion HTTP sobre la API del proveedor:',
    '    method: GET, POST, PATCH, PUT, DELETE. path: ruta de la API sin / inicial.',
    '    body: objeto JSON para POST/PATCH/PUT. headers: headers adicionales opcionales.',
    '    Ejemplo: {"type":"tool","tool":"git","args":{"provider":"github","action":"api","method":"POST","path":"user/repos","body":{"name":"mi-proyecto","private":true}}}',
    '    Ejemplo: {"type":"tool","tool":"git","args":{"provider":"github","action":"api","method":"GET","path":"repos/owner/repo/issues?state=open"}}',
    '    Ejemplo: {"type":"tool","tool":"git","args":{"provider":"custom","name":"empresa","action":"api","method":"POST","path":"projects","body":{"name":"nuevo"}}}',
    '',
    '  action="clone" — clonar repositorio con credenciales configuradas:',
    '    repoUrl: URL del repositorio. destination: carpeta destino. branch: rama especifica.',
    '    Ejemplo: {"type":"tool","tool":"git","args":{"provider":"github","action":"clone","repoUrl":"https://github.com/user/repo","destination":"./repo"}}',
    '',
    '  Control total: repos, issues, PRs, releases, webhooks, users, etc. Segun permisos del token.',
    '  No hay acciones fijas. Elige method y path libremente.',
    '',
    '## Preguntar al usuario',
    '',
    'ask_user { question, options }',
    '  Muestra una pregunta al usuario con opciones predefinidas para escoger.',
    '  question: string con la pregunta.',
    '  options: array de strings con las opciones que el usuario puede escoger.',
    '  El usuario tambien puede escribir una respuesta personalizada.',
    '  Retorna la respuesta seleccionada o escrita por el usuario.',
    '  Ejemplo: {"type":"tool","tool":"ask_user","args":{"question":"Que lenguaje prefieres?","options":["JavaScript","Python","Go","Rust"]}}',
    '',
    '## Skills (carga bajo demanda)',
    '',
    'load_skill { name }',
    '  Carga el contenido completo de una skill listada en "## Available Skills" del system prompt.',
    '  Las skills viven en data/skills/<name>/SKILL.md. Solo el INDEX (nombre + descripcion) esta',
    '  siempre disponible; el cuerpo completo se carga on-demand cuando lo necesitas.',
    '  Llama load_skill ANTES de aplicar las reglas de una skill a la tarea actual.',
    '  Si name esta vacio, la herramienta devuelve la lista completa de skills disponibles.',
    '  Ejemplo: {"type":"tool","tool":"load_skill","args":{"name":"testing"}}',
    '  Ejemplo (listar): {"type":"tool","tool":"load_skill","args":{"name":""}}',
    '',
    '## Memoria persistente',
    '',
    'memory { action, key?, value?, query? }',
    '  Memoria persistente entre sesiones. Guarda y recuerda informacion importante.',
    '  actions: save, get, list, delete, clear',
    '  save: guarda un par clave-valor. get: recupera un valor por clave.',
    '  list: lista todas las claves. delete: elimina una clave. clear: limpia toda la memoria.',
    '  Ejemplo save: {"type":"tool","tool":"memory","args":{"action":"save","key":"proyecto","value":"Usamos React + TypeScript"}}',
    '  Ejemplo get: {"type":"tool","tool":"memory","args":{"action":"get","key":"proyecto"}}',
    '  Ejemplo list: {"type":"tool","tool":"memory","args":{"action":"list"}}',
    '',
  ].join('\n');
}

function printTools(lang) {
  console.log(t(lang, 'Herramientas disponibles:', 'Available tools:'));
  for (const tool of TOOL_DEFINITIONS) {
    console.log(`  ${tool.name} ${tool.usage}`);
  }
}

function describeToolCall(call, lang) {
  switch (call.tool) {
    case 'list_dir':
      return t(lang, `Listando ${call.args.path ?? '.'}`, `Listing ${call.args.path ?? '.'}`);
    case 'read_file':
      return t(lang, `Leyendo ${call.args.path}`, `Reading ${call.args.path}`);
    case 'search_text':
      return t(lang, `Buscando "${shortText(call.args.pattern, 40)}" en ${call.args.path ?? '.'}`, `Searching "${shortText(call.args.pattern, 40)}" in ${call.args.path ?? '.'}`);
    case 'glob_files':
      return t(lang, `Patron ${shortText(call.args.pattern, 50)} en ${call.args.path ?? '.'}`, `Pattern ${shortText(call.args.pattern, 50)} in ${call.args.path ?? '.'}`);
    case 'file_info':
      return t(lang, `Inspeccionando ${call.args.path}`, `Inspecting ${call.args.path}`);
    case 'run_command':
      return t(lang, `Comando ${shortText(call.args.command, 70)}`, `Command ${shortText(call.args.command, 70)}`);
    case 'make_dir':
      return t(lang, `Creando carpeta ${call.args.path}`, `Creating folder ${call.args.path}`);
    case 'write_file':
      return t(lang, `Escribiendo ${call.args.path}`, `Writing ${call.args.path}`);
    case 'append_file':
      return t(lang, `Anexando ${call.args.path}`, `Appending ${call.args.path}`);
    case 'replace_in_file':
      return t(lang, `Editando ${call.args.path}`, `Editing ${call.args.path}`);
    case 'fetch_url': {
      const cleanedUrl = cleanUrl(call.args.url || '');
      const sel = call.args.selector ? ` → ${shortText(call.args.selector, 30)}` : '';
      return `Fetch ${shortText(cleanedUrl, 50)}${sel}`;
    }
    case 'fetch_http':
      return `HTTP ${String(call.args.method || 'GET').toUpperCase()} ${shortText(cleanUrl(call.args.url || ''), 50)}`;
    case 'fetch':
      return `Fetch ${String(call.args.method || 'GET').toUpperCase()} ${shortText(cleanUrl(call.args.url || ''), 50)}`;
    case 'webfetch':
      return `WebFetch ${shortText(cleanUrl(call.args.url || ''), 50)}`;
    case 'scrape_site':
      return `Scraping ${shortText(cleanUrl(call.args.url || ''), 50)}`;
    case 'web_search':
      return t(lang, `Buscando "${shortText(call.args.query || '', 50)}"`, `Searching "${shortText(call.args.query || '', 50)}"`);
    case 'web_read': {
      const readUrl = cleanUrl(call.args.url || '');
      return t(lang, `Leyendo ${shortText(readUrl, 60)}`, `Reading ${shortText(readUrl, 60)}`);
    }
    case 'upload_file':
      return t(lang, `Subiendo ${call.args.path}`, `Uploading ${call.args.path}`);
    case 'gmail':
      return `Gmail ${call.args.action || 'status'}`;
    case 'create_canvas_image':
      return t(lang, `Creando imagen ${call.args.width || '?'}x${call.args.height || '?'}`, `Creating image ${call.args.width || '?'}x${call.args.height || '?'}`);
    case 'git':
      return `Git ${call.args.action || '?'} ${call.args.provider || '?'}`;
    case 'load_skill':
      return t(lang, `Cargando skill "${call.args.name || '?'}"`, `Loading skill "${call.args.name || '?'}"`);
    default:
      return call.tool;
  }
}

function globToRegExp(pattern) {
  let source = pattern.replace(/\\/g, '/');
  source = source.replace(/\*\*/g, '::DOUBLE_STAR::');
  source = source.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  source = source.replace(/\*/g, '[^/]*');
  source = source.replace(/\?/g, '[^/]');
  source = source.replace(/::DOUBLE_STAR::/g, '.*');
  return new RegExp(`^${source}$`);
}

async function walkEntries(rootPath, limit = 5000) {
  const results = [];
  const queue = [rootPath];

  while (queue.length > 0 && results.length < limit) {
    const currentPath = queue.shift();
    const entries = await fsp.readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const absolutePath = path.join(currentPath, entry.name);
      const relativePath = path.relative(rootPath, absolutePath).replace(/\\/g, '/');
      results.push({
        absolutePath,
        relativePath,
        dirent: entry,
      });

      if (entry.isDirectory() && results.length < limit) {
        queue.push(absolutePath);
      }
    }
  }

  return results;
}

async function runProcess(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      shell: false,
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let aborted = false;

    const timer = options.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          child.kill('SIGTERM');
        }, options.timeoutMs)
      : null;

    const onAbort = () => {
      if (aborted) return;
      aborted = true;
      try { child.kill('SIGKILL'); } catch {}
    };

    if (options.signal) {
      if (options.signal.aborted) onAbort();
      else options.signal.addEventListener('abort', onAbort, { once: true });
    }

    child.stdout.on('data', chunk => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', chunk => {
      stderr += chunk.toString();
    });

    child.on('error', err => {
      if (options.signal) options.signal.removeEventListener('abort', onAbort);
      if (timer) clearTimeout(timer);
      reject(err);
    });
    child.on('close', code => {
      if (timer) {
        clearTimeout(timer);
      }
      if (options.signal) options.signal.removeEventListener('abort', onAbort);

      if (aborted) {
        const err = new Error('Process aborted by user');
        err.code = 'ABORT_ERR';
        reject(err);
        return;
      }

      resolve({
        code,
        stdout,
        stderr,
        timedOut,
      });
    });
  });
}

async function askConfirmation(rl, title, detail, paint, state) {
  if (state?.autoApprove) {
    if (!state?.tuiConfirm) {
      console.error(`  ${paint('\u21AA', 'green')} ${paint(title, 'dim')}`);
    }
    return true;
  }

  if (state?.tuiConfirm) {
    const answer = await state.tuiConfirm(title, detail || '');
    if (typeof answer === 'boolean') return answer;
    return answer === 's' || answer === 'si' || answer === 'y' || answer === 'yes';
  }

  if (!rl) {
    return false;
  }

  console.error('');
  console.error(`  ${paint('?', 'yellow')} ${title}`);
  if (detail) {
    for (const line of detail.split('\n')) {
      if (line.trim()) console.error(`    ${paint(line, 'dim')}`);
    }
  }
  console.error('');

  const answer = (await rl.question(`  ${paint('s/N', 'yellow')} ${paint('\u276F', 'yellow')} `))
    .trim()
    .toLowerCase();
  return answer === 's' || answer === 'si' || answer === 'y' || answer === 'yes';
}

function isIpHost(hostname = '') {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname)
    || /^\[[0-9a-f:]+\]$/i.test(hostname)
    || /^[0-9a-f:]+$/i.test(hostname);
}

async function requireIpConsent(urlValue, state, paint) {
  let parsed;
  try {
    parsed = new URL(urlValue);
  } catch {
    return true;
  }
  if (!isIpHost(parsed.hostname)) return true;

  if (state?.tuiConfirm) {
    const answer = await state.tuiConfirm('Permiso obligatorio para IP', `Destino IP detectado: ${urlValue}\nConfirma acceso de red explícitamente.`);
    if (typeof answer === 'boolean') return answer;
    return answer === 's' || answer === 'si' || answer === 'y' || answer === 'yes';
  }
  if (!state?.rl) return false;
  console.error('');
  console.error(`  ${paint('!', 'yellow')} Permiso obligatorio para IP`);
  console.error(`    ${paint(`Destino IP detectado: ${urlValue}`, 'dim')}`);
  const answer = (await state.rl.question(`  ${paint('s/N', 'yellow')} ${paint('\u276F', 'yellow')} `))
    .trim()
    .toLowerCase();
  return answer === 's' || answer === 'si' || answer === 'y' || answer === 'yes';
}

async function askUserTool(args, state, paint, ctx) {
  const lang = state?.language || 'es';
  const question = String(args.question || '').trim();
  const options = Array.isArray(args.options) ? args.options.map(String) : [];

  if (!question) {
    throw new Error(t(lang, 'ask_user requiere question', 'ask_user requires question'));
  }
  if (options.length === 0) {
    throw new Error(t(lang, 'ask_user requiere al menos 1 opcion en options', 'ask_user requires at least 1 option in options'));
  }

  const customLabel = lang === 'es' ? 'Respuesta personalizada...' : 'Custom answer...';
  const allItems = [...options, customLabel];

  if (state?.tuiAskUser) {
    return await state.tuiAskUser(question, allItems, customLabel);
  }

  if (!state?.rl) {
    throw new Error(t(lang, 'ask_user requiere interfaz interactiva', 'ask_user requires interactive interface'));
  }

  console.error('');
  console.error(`  ${paint('\u270e', 'yellow')} ${question}`);
  console.error('');
  for (let i = 0; i < options.length; i++) {
    console.error(`    ${paint(`${i + 1}.`, 'yellow')} ${options[i]}`);
  }
  console.error(`    ${paint(`${options.length + 1}.`, 'yellow')} ${customLabel}`);
  console.error('');

  const answer = await state.rl.question(`  ${paint('>', 'yellow')} `);
  const num = parseInt(answer, 10);
  if (num >= 1 && num <= options.length) {
    return options[num - 1];
  }
  return answer.trim() || options[0];
}

async function listDirTool(args, state) {
  const targetPath = resolveInputPath(args.path ?? '.', state.cwd);
  const entries = await fsp.readdir(targetPath, { withFileTypes: true });

  const formatted = entries
    .sort((left, right) => {
      if (left.isDirectory() && !right.isDirectory()) {
        return -1;
      }
      if (!left.isDirectory() && right.isDirectory()) {
        return 1;
      }
      return left.name.localeCompare(right.name);
    })
    .slice(0, 250)
    .map(entry => `${entry.isDirectory() ? 'dir ' : 'file'} ${entry.name}`)
    .join('\n');

  return `Ruta: ${targetPath}\n${formatted || '[vacio]'}`;
}

async function loadSkillTool(args, state) {
  const lang = state?.language || 'es';
  const name = String(args?.name || '').trim();
  if (!name) {
    const all = listSkills();
    const list = all.map(s => `- \`${s.name}\` — ${s.description || s.title || ''}`).join('\n');
    throw new Error(t(lang, `load_skill requiere name. Skills disponibles:\n${list}`, `load_skill requires name. Available skills:\n${list}`));
  }
  const skill = loadSkill(name);
  if (!skill) {
    const all = listSkills();
    const list = all.map(s => `- \`${s.name}\` — ${s.description || s.title || ''}`).join('\n');
    throw new Error(t(lang, `Skill "${name}" no encontrada. Skills disponibles:\n${list}`, `Skill "${name}" not found. Available skills:\n${list}`));
  }
  const maxChars = 12000;
  const body = skill.body.length > maxChars
    ? `${skill.body.slice(0, maxChars)}\n\n[...contenido truncado, total ${skill.body.length} caracteres]`
    : skill.body;
  return `Skill: ${skill.name}\nTitle: ${skill.title}\nDescription: ${skill.description}\n\n${body}`;
}

async function memoryTool(args, state) {
  const lang = state?.language || 'es';
  const action = String(args?.action || 'list').trim().toLowerCase();
  if (!state.sessionMemory || typeof state.sessionMemory !== 'object') {
    state.sessionMemory = {};
  }
  const mem = state.sessionMemory;

  if (action === 'save') {
    const key = String(args?.key || '').trim();
    const value = String(args?.value || '').trim();
    if (!key) throw new Error(t(lang, 'memory save requiere key', 'memory save requires key'));
    if (!value) throw new Error(t(lang, 'memory save requiere value', 'memory save requires value'));
    mem[key] = value;
    const count = Object.keys(mem).length;
    return t(lang, `Guardado "${key}". Memoria: ${count} entradas.`, `Saved "${key}". Memory: ${count} entries.`);
  }

  if (action === 'get') {
    const key = String(args?.key || '').trim();
    if (!key) throw new Error(t(lang, 'memory get requiere key', 'memory get requires key'));
    const value = mem[key];
    if (value === undefined) {
      return t(lang, `No hay valor para "${key}".`, `No value for "${key}".`);
    }
    return `${key}: ${value}`;
  }

  if (action === 'list') {
    const entries = Object.entries(mem);
    if (entries.length === 0) {
      return t(lang, 'Memoria vacia.', 'Memory empty.');
    }
    return entries.map(([k, v]) => `${k}: ${v}`).join('\n');
  }

  if (action === 'delete') {
    const key = String(args?.key || '').trim();
    if (!key) throw new Error(t(lang, 'memory delete requiere key', 'memory delete requires key'));
    if (!(key in mem)) {
      return t(lang, `No hay valor para "${key}".`, `No value for "${key}".`);
    }
    delete mem[key];
    return t(lang, `Eliminado "${key}".`, `Deleted "${key}".`);
  }

  if (action === 'clear') {
    const count = Object.keys(mem).length;
    for (const key of Object.keys(mem)) delete mem[key];
    return t(lang, `Memoria limpiada (${count} entradas eliminadas).`, `Memory cleared (${count} entries removed).`);
  }

  throw new Error(t(lang, `memory action "${action}" no valido. Usa: save, get, list, delete, clear`, `memory action "${action}" invalid. Use: save, get, list, delete, clear`));
}

async function readFileTool(args, state) {
  const targetPath = resolveInputPath(args.path, state.cwd);
  const content = await fsp.readFile(targetPath, 'utf8');
  const lines = content.split('\n');

  const offset = args.offset != null ? Math.max(Number(args.offset), 0) : (args.startLine != null ? Number(args.startLine) - 1 : 0);
  const limit = args.limit != null ? Math.max(Number(args.limit), 1) : MAX_FILE_LINES;

  const startLine = Math.min(Math.max(offset + 1, 1), lines.length);
  const endLine = Math.min(startLine + limit - 1, lines.length);
  const body = formatLineRange(lines, startLine, endLine);

  return truncateText(
    `Archivo: ${targetPath}\nLineas ${startLine}-${endLine} de ${lines.length}\n\n${body}`,
  );
}

async function searchTextTool(args, state, ctx) {
  if (!args.pattern || typeof args.pattern !== 'string') {
    throw new Error(t(state?.language, 'search_text requiere pattern', 'search_text requires pattern'));
  }

  const targetPath = resolveInputPath(args.path ?? '.', state.cwd);
  const rgArgs = ['--line-number', '--no-heading', '--color', 'never'];

  if (args.glob && typeof args.glob === 'string') {
    rgArgs.push('--glob', args.glob);
  }

  rgArgs.push(args.pattern, targetPath);

  const result = await runProcess('rg', rgArgs, {
    cwd: state.cwd,
    timeoutMs: 20000,
    signal: ctx?.signal,
  });

  if (result.code === 1) {
    return `Sin coincidencias en ${targetPath}`;
  }

  if (result.code !== 0) {
    throw new Error(result.stderr.trim() || t(state?.language, `rg fallo con codigo ${result.code}`, `rg failed with code ${result.code}`));
  }

  return truncateText(result.stdout.trim() || `Sin coincidencias en ${targetPath}`);
}

async function globFilesTool(args, state) {
  if (!args.pattern || typeof args.pattern !== 'string') {
    throw new Error(t(state?.language, 'glob_files requiere pattern', 'glob_files requires pattern'));
  }

  const targetPath = resolveInputPath(args.path ?? '.', state.cwd);
  const regex = globToRegExp(args.pattern);
  const entries = await walkEntries(targetPath);
  const matches = entries
    .map(entry => entry.relativePath)
    .filter(relativePath => regex.test(relativePath))
    .slice(0, 300);

  return matches.length > 0
    ? `Base: ${targetPath}\n${matches.join('\n')}`
    : `Sin coincidencias para ${args.pattern} en ${targetPath}`;
}

async function fileInfoTool(args, state) {
  if (!args.path || typeof args.path !== 'string') {
    throw new Error(t(state?.language, 'file_info requiere path', 'file_info requires path'));
  }

  const targetPath = resolveInputPath(args.path, state.cwd);
  const stats = await fsp.stat(targetPath);
  return [
    `Ruta: ${targetPath}`,
    `Tipo: ${stats.isDirectory() ? 'directorio' : 'archivo'}`,
    `Tamano: ${stats.size} bytes`,
    `Creado: ${stats.birthtime.toISOString()}`,
    `Modificado: ${stats.mtime.toISOString()}`,
  ].join('\n');
}

async function runCommandTool(args, state, paint, ctx) {
  if (!args.command || typeof args.command !== 'string') {
    throw new Error(t(state?.language, 'run_command requiere command', 'run_command requires command'));
  }

  const command = cleanCommand(args.command);

  const allowed = await askConfirmation(
    state.rl,
    'Ejecutar comando',
    `${command}\n\nDirectorio: ${state.cwd}`,
    paint,
    state,
  );

  if (!allowed) {
    return 'Comando cancelado por el usuario.';
  }


  const timeoutMs = Number(args.timeoutMs ?? 120000);
  const shell = detectShell();
  const result = await runProcess(shell, ['-lc', command], {
    cwd: state.cwd,
    timeoutMs,
    signal: ctx?.signal,
  });

  const parts = [`Exit code: ${result.code ?? 'desconocido'}`];

  if (result.timedOut) {
    parts.push('Timeout: el comando fue detenido por tiempo.');
  }

  if (result.stdout.trim()) {
    parts.push(`STDOUT:\n${result.stdout.trim()}`);
  }

  if (result.stderr.trim()) {
    parts.push(`STDERR:\n${result.stderr.trim()}`);
  }

  return truncateText(parts.join('\n\n'));
}

async function makeDirTool(args, state, paint) {
  if (!args.path || typeof args.path !== 'string') {
    throw new Error(t(state?.language, 'make_dir requiere path', 'make_dir requires path'));
  }

  const targetPath = resolveInputPath(args.path, state.cwd);
  const allowed = await askConfirmation(
    state.rl,
    'Crear carpeta',
    targetPath,
    paint,
    state,
  );

  if (!allowed) {
    return 'Creacion cancelada por el usuario.';
  }

  await fsp.mkdir(targetPath, { recursive: true });
  return `Carpeta lista: ${targetPath}`;
}

async function writeFileTool(args, state, paint) {
  if (!args.path || typeof args.path !== 'string') {
    throw new Error(t(state?.language, 'write_file requiere path', 'write_file requires path'));
  }

  if (typeof args.content !== 'string') {
    throw new Error(t(state?.language, 'write_file requiere content', 'write_file requires content'));
  }

  const targetPath = resolveInputPath(args.path, state.cwd);
  const exists = fs.existsSync(targetPath);
  const preview = truncateText(args.content, 600);
  const allowed = await askConfirmation(
    state.rl,
    exists ? 'Sobrescribir archivo' : 'Crear archivo',
    `${targetPath}\n\nContenido propuesto:\n${preview}`,
    paint,
    state,
  );

  if (!allowed) {
    return 'Edicion cancelada por el usuario.';
  }

  await fsp.mkdir(path.dirname(targetPath), { recursive: true });
  await fsp.writeFile(targetPath, args.content, 'utf8');
  return `${exists ? 'Archivo actualizado' : 'Archivo creado'}: ${targetPath}`;
}

async function appendFileTool(args, state, paint) {
  if (!args.path || typeof args.path !== 'string') {
    throw new Error(t(state?.language, 'append_file requiere path', 'append_file requires path'));
  }

  if (typeof args.content !== 'string') {
    throw new Error(t(state?.language, 'append_file requiere content', 'append_file requires content'));
  }

  const targetPath = resolveInputPath(args.path, state.cwd);
  const preview = truncateText(args.content, 600);
  const allowed = await askConfirmation(
    state.rl,
    'Anexar archivo',
    `${targetPath}\n\nBloque a agregar:\n${preview}`,
    paint,
    state,
  );

  if (!allowed) {
    return 'Edicion cancelada por el usuario.';
  }

  await fsp.mkdir(path.dirname(targetPath), { recursive: true });
  await fsp.appendFile(targetPath, args.content, 'utf8');
  return `Contenido anexado: ${targetPath}`;
}

async function replaceInFileTool(args, state, paint) {
  if (!args.path || typeof args.path !== 'string') {
    throw new Error(t(state?.language, 'replace_in_file requiere path', 'replace_in_file requires path'));
  }

  if (typeof args.search !== 'string' || typeof args.replace !== 'string') {
    throw new Error(t(state?.language, 'replace_in_file requiere search y replace', 'replace_in_file requires search and replace'));
  }

  const targetPath = resolveInputPath(args.path, state.cwd);
  const content = await fsp.readFile(targetPath, 'utf8');
  const matches = content.split(args.search).length - 1;

  if (matches === 0) {
    throw new Error(t(state?.language, 'No encontre el texto a reemplazar', 'Text to replace not found'));
  }

  const nextContent = args.all
    ? content.split(args.search).join(args.replace)
    : content.replace(args.search, args.replace);

  if (nextContent === content) {
    throw new Error(t(state?.language, 'El reemplazo no produjo cambios', 'Replacement produced no changes'));
  }

  const allowed = await askConfirmation(
    state.rl,
    'Editar archivo',
    [
      targetPath,
      '',
      `Coincidencias encontradas: ${matches}`,
      `Modo: ${args.all ? 'todas' : 'primera coincidencia'}`,
    ].join('\n'),
    paint,
    state,
  );

  if (!allowed) {
    return 'Edicion cancelada por el usuario.';
  }

  await fsp.writeFile(targetPath, nextContent, 'utf8');
  return `Archivo editado: ${targetPath}`;
}

function cleanUrl(raw) {
  let url = raw.trim();
  const mdLink = url.match(/\[([^\]]*)\]\(([^)]+)\)/);
  if (mdLink) {
    const text = mdLink[1].trim();
    const href = mdLink[2].trim();
    url = /^https?:\/\//.test(text) ? text : href;
  }
  url = url.replace(/^[`<"']+|[`>"']+$/g, '');
  return url;
}

function stripHtmlToText(html) {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
    .replace(/<(br|hr)\s*\/?\s*>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function cleanCommand(raw) {
  let cmd = raw.trim();
  if (/^`[^`]+`$/.test(cmd)) {
    cmd = cmd.slice(1, -1).trim();
  }
  if (cmd.startsWith('```')) {
    cmd = cmd.replace(/^```\w*\n?/, '').replace(/\n?```$/, '').trim();
  }
  cmd = cmd.replace(/\[([^\]]*)\]\((https?:\/\/[^)]+)\)/g, (_, text, href) => {
    const trimText = text.trim();
    return /^https?:\/\//.test(trimText) ? trimText : href;
  });
  return cmd;
}

async function fetchUrlTool(args, state, paint) {
  if (!args.url || typeof args.url !== 'string') {
    throw new Error(t(state?.language, 'fetch_url requiere url', 'fetch_url requires url'));
  }

  const url = cleanUrl(args.url);

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(t(state?.language, `URL invalida: ${url}`, `Invalid URL: ${url}`));
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(t(state?.language, 'Solo se permite http y https', 'Only http and https allowed'));
  }

  const detail = args.selector
    ? `GET ${url}\nSelector: ${args.selector}`
    : `GET ${url}`;

  const allowed = await askConfirmation(
    state.rl,
    'Fetch URL',
    detail,
    paint,
    state,
  );

  if (!allowed) {
    return 'Fetch cancelado por el usuario.';
  }
  if (!(await requireIpConsent(url, state, paint))) {
    return 'Fetch a IP cancelado por falta de consentimiento explícito.';
  }

  const axios = require('axios');
  let response;
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      response = await axios({
        url,
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
          ...(args.headers || {}),
        },
        timeout: 15000,
        maxContentLength: 512000,
        maxRedirects: 5,
        responseType: 'text',
        validateStatus: () => true,
      });
      break;
    } catch (err) {
      lastErr = err;
      if (attempt === 0) continue;
    }
  }
  if (!response) throw lastErr || new Error('fetch_url fallo');

  const body = typeof response.data === 'string'
    ? response.data
    : JSON.stringify(response.data, null, 2);

  const parts = [
    `Status: ${response.status}`,
    `Content-Type: ${response.headers['content-type'] || 'desconocido'}`,
  ];

  if (args.selector && typeof args.selector === 'string') {
    try {
      const cheerio = require('cheerio');
      const $ = cheerio.load(body);
      const elements = $(args.selector);
      const limit = Math.min(Number(args.limit) || 20, 50);
      const results = [];

      elements.each((i, el) => {
        if (i >= limit) return false;
        if (args.attribute && typeof args.attribute === 'string') {
          const val = $(el).attr(args.attribute);
          if (val) results.push(val);
        } else {
          const text = $(el).text().trim();
          if (text) results.push(text);
        }
      });

      parts.push(`Selector: ${args.selector}`);
      parts.push(`Coincidencias: ${elements.length} (mostrando ${results.length})`);
      parts.push('');
      parts.push(results.length > 0 ? results.join('\n') : '[sin coincidencias]');
    } catch (err) {
      parts.push(`Error en selector: ${err.message}`);
      parts.push('');
      parts.push(body);
    }
  } else {
    parts.push('');
    parts.push(body);
  }

  return truncateText(parts.join('\n'));
}

async function fetchHttpTool(args, state, paint) {
  if (!args.url || typeof args.url !== 'string') throw new Error(t(state?.language, 'fetch_http requiere url', 'fetch_http requires url'));
  const method = String(args.method || 'GET').toUpperCase();
  const url = cleanUrl(args.url);
  const detail = `${method} ${url}`;
  const allowed = await askConfirmation(state.rl, 'HTTP avanzado', detail, paint, state);
  if (!allowed) return 'Solicitud cancelada.';
  if (!(await requireIpConsent(url, state, paint))) {
    return 'Solicitud a IP cancelada por falta de consentimiento explícito.';
  }

  const headers = { ...(args.headers || {}) };
  let body;
  const isCatbox = /catbox\.moe/i.test(url);
  if (args.json && typeof args.json === 'object') {
    body = JSON.stringify(args.json);
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
  } else if (args.data !== undefined) {
    body = String(args.data);
  } else if (args.form && typeof args.form === 'object') {
    const formPayload = { ...args.form };
    if (isCatbox && !formPayload.reqtype) formPayload.reqtype = 'fileupload';
    const form = new FormData();
    for (const [k, v] of Object.entries(formPayload)) form.append(k, String(v));
    if (Array.isArray(args.files)) {
      for (const file of args.files) {
        if (!file || !file.path || !file.field) continue;
        const filePath = resolveInputPath(file.path, state.cwd);
        const buffer = await fs.promises.readFile(filePath);
        const blob = new Blob([buffer], { type: file.type || 'application/octet-stream' });
        const fieldName = isCatbox ? 'fileToUpload' : String(file.field);
        form.append(fieldName, blob, file.name || path.basename(file.path));
      }
    }
    body = form;
  } else if (Array.isArray(args.files) && args.files.length > 0) {
    const form = new FormData();
    if (isCatbox) form.append('reqtype', 'fileupload');
    for (const file of args.files) {
      if (!file || !file.path) continue;
      const filePath = resolveInputPath(file.path, state.cwd);
      const buffer = await fs.promises.readFile(filePath);
      const blob = new Blob([buffer], { type: file.type || 'application/octet-stream' });
      const fieldName = isCatbox ? 'fileToUpload' : String(file.field || 'file');
      form.append(fieldName, blob, file.name || path.basename(file.path));
    }
    body = form;
  }
  if (body instanceof FormData) {
    delete headers['Content-Type'];
    delete headers['content-type'];
  }
  const finalUrl = new URL(url);
  if (args.query && typeof args.query === 'object') {
    for (const [k, v] of Object.entries(args.query)) finalUrl.searchParams.set(k, String(v));
  }
  let res;
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.max(1000, Number(args.timeoutMs || 20000)));
    try {
      res = await fetch(finalUrl.toString(), { method, headers, body, signal: controller.signal });
      clearTimeout(timeout);
      break;
    } catch (err) {
      clearTimeout(timeout);
      lastErr = err;
      if (attempt === 0) continue;
    }
  }
  if (!res) throw lastErr || new Error('fetch fallo');
  const text = await res.text();
  return truncateText(`Status: ${res.status}\nContent-Type: ${res.headers.get('content-type') || '-'}\n\n${text}`);
}


function guessContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const types = {
    '.zip': 'application/zip',
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.json': 'application/json',
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.csv': 'text/csv',
  };
  return types[ext] || 'application/octet-stream';
}

async function uploadFileTool(args, state, paint) {
  if (!args.path || typeof args.path !== 'string') throw new Error(t(state?.language, 'upload_file requiere path', 'upload_file requires path'));
  const filePath = resolveInputPath(args.path, state.cwd);
  const stats = await fsp.stat(filePath).catch(() => null);
  if (!stats?.isFile()) throw new Error(t(state?.language, `Archivo no encontrado: ${filePath}`, `File not found: ${filePath}`));

  const maxBytes = 5 * 1024 * 1024;
  if (stats.size > maxBytes) {
    throw new Error(t(state?.language, `El archivo supera el limite de 5 MB (${stats.size} bytes)`, `File exceeds 5 MB limit (${stats.size} bytes)`));
  }

  const endpoint = 'https://cdn.soymaycol.icu/upload';
  const displayName = args.name || path.basename(filePath);
  const allowed = await askConfirmation(state.rl, 'Subir archivo a CDN', `${displayName} (${stats.size} bytes) -> ${endpoint}`, paint, state);
  if (!allowed) return 'Subida cancelada.';

  const buffer = await fsp.readFile(filePath);
  const type = args.type || guessContentType(filePath);
  const form = new FormData();
  form.append(String(args.field || 'file'), new Blob([buffer], { type }), displayName);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);
  let res;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      body: form,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  const text = await res.text();
  let payload = null;
  try { payload = JSON.parse(text); } catch {}
  if (!res.ok) {
    throw new Error(t(state?.language, `Upload fallo (${res.status}): ${shortText(text, 500)}`, `Upload failed (${res.status}): ${shortText(text, 500)}`));
  }
  if (!payload || typeof payload.link !== 'string' || !payload.link.trim()) {
    throw new Error(t(state?.language, `Respuesta de upload invalida: ${shortText(text, 500)}`, `Invalid upload response: ${shortText(text, 500)}`));
  }

  return [
    'Archivo subido correctamente.',
    `Nombre: ${payload.name || displayName}`,
    `Tamano: ${payload.size ?? stats.size}`,
    `Tipo: ${payload.type || type}`,
    `Link directo: ${payload.link}`,
    '',
    JSON.stringify(payload, null, 2),
  ].join('\n');
}


function decodeBase64UrlText(value = '') {
  if (!value) return '';
  const normalized = String(value).replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, 'base64').toString('utf8');
}

function encodeBase64UrlText(value = '') {
  return Buffer.from(String(value), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function getHeader(headers = [], name) {
  const found = headers.find(header => String(header.name || '').toLowerCase() === String(name).toLowerCase());
  return found?.value || '';
}

function collectMessageText(payload, out = []) {
  if (!payload) return out;
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    out.push(decodeBase64UrlText(payload.body.data));
  }
  for (const part of payload.parts || []) collectMessageText(part, out);
  if (out.length === 0 && payload.body?.data) out.push(decodeBase64UrlText(payload.body.data));
  return out;
}

function formatMessageSummary(message) {
  const headers = message.payload?.headers || [];
  return [
    `ID: ${message.id}`,
    `From: ${getHeader(headers, 'From') || '-'}`,
    `To: ${getHeader(headers, 'To') || '-'}`,
    `Subject: ${getHeader(headers, 'Subject') || '-'}`,
    `Date: ${getHeader(headers, 'Date') || '-'}`,
    `Snippet: ${message.snippet || '-'}`,
  ].join('\n');
}

function encodeSubject(subject) {
  const text = String(subject || '');
  return /^[\x00-\x7F]*$/.test(text)
    ? text
    : `=?UTF-8?B?${Buffer.from(text, 'utf8').toString('base64')}?=`;
}

function buildRawEmail({ to, subject, body }) {
  return encodeBase64UrlText([
    `To: ${String(to || '').trim()}`,
    `Subject: ${encodeSubject(subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
    '',
    String(body || ''),
  ].join('\r\n'));
}

async function gmailTool(args = {}, state, paint) {
  const action = String(args.action || 'status').toLowerCase().trim();

  if (action === 'status') {
    const status = await getGmailAuthStatus();
    if (!status.connected) return 'Gmail no conectado. Usa /gmail connect para iniciar sesion.';
    return [
      'Gmail conectado.',
      `Cuenta: ${status.email || 'desconocida'}`,
      `Scopes: ${status.scopes.join(', ') || '-'}`,
      `Expira: ${status.expiryDate ? new Date(status.expiryDate).toISOString() : '-'}`,
    ].join('\n');
  }

  if (action === 'list') {
    const maxResults = Math.max(1, Math.min(20, Number(args.maxResults || 10)));
    const data = await gmailApiRequest('GET', '/users/me/messages', {
      query: {
        q: args.query || '',
        maxResults,
      },
    });
    const messages = Array.isArray(data.messages) ? data.messages : [];
    if (messages.length === 0) return 'No se encontraron correos.';
    const details = [];
    for (const message of messages) {
      const full = await gmailApiRequest('GET', `/users/me/messages/${encodeURIComponent(message.id)}`, {
        query: { format: 'metadata' },
      });
      details.push(formatMessageSummary(full));
    }
    return [`Correos encontrados: ${details.length}`, '', details.join('\n\n---\n\n')].join('\n');
  }

  if (action === 'read') {
    if (!args.id || typeof args.id !== 'string') throw new Error(t(state?.language, 'gmail read requiere id', 'gmail read requires id'));
    const message = await gmailApiRequest('GET', `/users/me/messages/${encodeURIComponent(args.id)}`, {
      query: { format: 'full' },
    });
    const text = collectMessageText(message.payload).join('\n').trim();
    return [
      formatMessageSummary(message),
      '',
      'Contenido:',
      truncateText(text || message.snippet || '(sin texto legible)', 8000),
    ].join('\n');
  }

  if (action === 'send') {
    if (!args.to || !args.subject || !args.body) throw new Error(t(state?.language, 'gmail send requiere to, subject y body', 'gmail send requires to, subject and body'));
    const allowed = await askConfirmation(
      state.rl,
      'Enviar correo por Gmail',
      `Para: ${args.to}\nAsunto: ${args.subject}\n${shortText(String(args.body), 300)}`,
      paint,
      state,
    );
    if (!allowed) return 'Envio de Gmail cancelado.';
    const data = await gmailApiRequest('POST', '/users/me/messages/send', {
      body: { raw: buildRawEmail(args) },
    });
    return [`Correo enviado.`, `ID: ${data.id || '-'}`, `Thread: ${data.threadId || '-'}`].join('\n');
  }

  throw new Error(t(state?.language, 'gmail action invalida. Usa status, list, read o send.', 'Invalid gmail action. Use status, list, read or send.'));
}

async function scrapeSiteTool(args, state, paint) {
  if (!args.url || typeof args.url !== 'string') throw new Error(t(state?.language, 'scrape_site requiere url', 'scrape_site requires url'));
  if (!args.selectors || typeof args.selectors !== 'object') throw new Error(t(state?.language, 'scrape_site requiere selectors objeto', 'scrape_site requires selectors object'));
  const url = cleanUrl(args.url);
  const allowed = await askConfirmation(state.rl, 'Scrape site', `GET ${url}`, paint, state);
  if (!allowed) return 'Scraping cancelado.';
  if (!(await requireIpConsent(url, state, paint))) return 'Scraping a IP cancelado por falta de consentimiento explícito.';
  const axios = require('axios');
  const res = await axios({
    url,
    method: 'GET',
    headers: { 'User-Agent': 'Mozilla/5.0', ...(args.headers || {}) },
    timeout: 15000,
    responseType: 'text',
    validateStatus: () => true,
  });
  const body = typeof res.data === 'string' ? res.data : String(res.data || '');
  const cheerio = require('cheerio');
  const $ = cheerio.load(body);
  const limit = Math.min(Number(args.limit) || 20, 100);
  const out = {};
  for (const [key, spec] of Object.entries(args.selectors)) {
    const selector = typeof spec === 'string' ? spec : spec?.selector;
    const attr = typeof spec === 'object' ? spec.attribute : null;
    if (!selector) continue;
    const arr = [];
    $(selector).each((i, el) => {
      if (i >= limit) return false;
      const node = $(el);
      const tag = String(el.tagName || '').toLowerCase();
      let value = '';
      if (attr) {
        value = node.attr(attr) || '';
      } else if (tag === 'meta') {
        value = node.attr('content') || '';
      } else if (tag === 'title') {
        value = node.text().trim();
      } else {
        value = node.text().trim();
      }
      if (value) arr.push(value);
    });
    out[key] = arr;
  }
  return truncateText(JSON.stringify(out, null, 2));
}

function htmlToMarkdown(html) {
  const cheerio = require('cheerio');
  const $ = cheerio.load(html);
  $('script,style,noscript').remove();
  const lines = [];
  const root = $('body').length ? $('body') : $.root();
  root.find('h1,h2,h3,h4,h5,h6,p,li,pre,code,blockquote,a,img,button').each((_, el) => {
    const tag = (el.tagName || '').toLowerCase();
    const node = $(el);
    const text = node.text().trim().replace(/\s+/g, ' ');
    if (!text && !['img', 'a'].includes(tag)) return;
    if (tag.startsWith('h')) lines.push(`${'#'.repeat(Number(tag[1]) || 1)} ${text}`);
    else if (tag === 'li') lines.push(`- ${text}`);
    else if (tag === 'a') lines.push(`[${text || 'link'}](${node.attr('href') || ''})`);
    else if (tag === 'img') lines.push(`![${node.attr('alt') || 'image'}](${node.attr('src') || ''})`);
    else if (tag === 'button') lines.push(`**[Button]** ${text}`);
    else if (tag === 'blockquote') lines.push(`> ${text}`);
    else if (tag === 'pre' || tag === 'code') lines.push(`\`\`\`\n${node.text()}\n\`\`\``);
    else lines.push(text);
  });
  return lines.join('\n\n').trim();
}

async function webfetchTool(args, state, paint) {
  const rawUrl = String(args.url || '').trim();
  if (!rawUrl) throw new Error(t(state?.language, 'webfetch requiere url', 'webfetch requires url'));
  const url = cleanUrl(rawUrl);
  const allowed = await askConfirmation(state.rl, 'WebFetch HTML → Markdown', `GET ${url}`, paint, state);
  if (!allowed) return 'WebFetch cancelado por el usuario.';
  if (!(await requireIpConsent(url, state, paint))) {
    return 'WebFetch a IP cancelado por falta de consentimiento explícito.';
  }
  const axios = require('axios');
  const res = await axios({
    url,
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Accept': 'text/html,application/xhtml+xml',
      ...(args.headers || {}),
    },
    timeout: Math.max(1000, Number(args.timeoutMs || 20000)),
    responseType: 'text',
    validateStatus: () => true,
  });
  const ct = String(res.headers['content-type'] || '').toLowerCase();
  if (!ct.includes('text/html')) {
    throw new Error(t(state?.language, `webfetch solo permite HTML. Content-Type recibido: ${ct || 'desconocido'}`, `webfetch only allows HTML. Content-Type received: ${ct || 'unknown'}`));
  }
  const html = typeof res.data === 'string' ? res.data : String(res.data || '');
  const markdown = htmlToMarkdown(html);
  return truncateText(markdown || '[sin contenido markdown]');
}

async function webSearchTool(args, state, paint) {
  const query = (args.query || '').trim();
  if (!query) throw new Error(t(state?.language, 'web_search requiere query', 'web_search requires query'));

  const allowed = await askConfirmation(
    state.rl, 'Buscar en la web', query, paint, state,
  );
  if (!allowed) return 'Busqueda cancelada.';

  const cheerio = require('cheerio');
  const lang = String(args.lang || (state.language === 'es' ? 'es-es' : 'us-en')).toLowerCase();
  const limit = Math.max(1, Math.min(Number(args.limit) || 5, 20));
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=${encodeURIComponent(lang)}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Accept-Language': lang.startsWith('es') ? 'es-ES,es;q=0.9,en;q=0.7' : 'en-US,en;q=0.9',
    },
  });
  const html = await res.text();
  const $ = cheerio.load(html);
  const results = [];
  $('.result').each((_, el) => {
    if (results.length >= limit) return false;
    const titleEl = $(el).find('.result__a').first();
    const snippetEl = $(el).find('.result__snippet').first();
    let href = titleEl.attr('href') || '';
    const match = href.match(/uddg=([^&]+)/);
    if (match) href = decodeURIComponent(match[1]);
    const title = titleEl.text().trim();
    const snippet = snippetEl.text().trim();
    if (title && href) results.push(`${results.length + 1}. ${title}\n   ${href}\n   ${snippet}`);
  });
  return results.length
    ? `Resultados para: ${query}\nIdioma: ${lang}\n\n${results.join('\n\n')}`
    : 'Sin resultados para esa búsqueda.';
}

async function webReadTool(args, state, paint) {
  const rawUrl = (args.url || '').trim();
  if (!rawUrl) throw new Error(t(state?.language, 'web_read requiere url', 'web_read requires url'));

  const url = cleanUrl(rawUrl);
  let parsed;
  try { parsed = new URL(url); } catch { throw new Error(t(state?.language, `URL invalida: ${url}`, `Invalid URL: ${url}`)); }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(t(state?.language, 'Solo se permite http y https', 'Only http and https allowed'));
  }

  const allowed = await askConfirmation(
    state.rl, 'Leer pagina web', url, paint, state,
  );
  if (!allowed) return 'Lectura cancelada.';
  if (!(await requireIpConsent(url, state, paint))) {
    return 'Lectura a IP cancelada por falta de consentimiento explícito.';
  }

  const axios = require('axios');
  const res = await axios({
    url,
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
    },
    timeout: 15000,
    maxContentLength: 1024000,
    maxRedirects: 5,
    responseType: 'text',
    validateStatus: () => true,
  });

  const body = typeof res.data === 'string'
    ? res.data
    : JSON.stringify(res.data, null, 2);
  const ct = res.headers['content-type'] || '';

  let text;
  if (ct.includes('application/json')) {
    text = body;
  } else if (ct.includes('text/html') || ct.includes('text/xml')) {
    text = stripHtmlToText(body);
  } else {
    text = body;
  }

  return truncateText(`URL: ${url}\nStatus: ${res.status}\n\n${text}`);
}

async function executeToolCall(call, state, ui, options = {}) {
  if (!call || typeof call.tool !== 'string' || !REGISTERED_TOOLS.has(call.tool)) {
    throw new Error(t(state?.language, `Herramienta no registrada: ${call?.tool || 'desconocida'}`, `Unknown tool: ${call?.tool || 'unknown'}`));
  }
  const toolDesc = describeToolCall(call, state?.language);
  ui.logEvent(state, 'tool', `Preparando ${toolDesc}`);

  const startTime = Date.now();
  let result;

  const ctx = { ...options, state, ui };

  try {
    switch (call.tool) {
      case 'list_dir':
        result = await listDirTool(call.args, state, ctx);
        break;
      case 'read_file':
        result = await readFileTool(call.args, state, ctx);
        break;
      case 'search_text':
        result = await searchTextTool(call.args, state, ctx);
        break;
      case 'glob_files':
        result = await globFilesTool(call.args, state, ctx);
        break;
      case 'file_info':
        result = await fileInfoTool(call.args, state, ctx);
        break;
      case 'run_command':
        result = await runCommandTool(call.args, state, ui.paint, ctx);
        break;
      case 'make_dir':
        result = await makeDirTool(call.args, state, ui.paint, ctx);
        break;
      case 'write_file':
        result = await writeFileTool(call.args, state, ui.paint, ctx);
        break;
      case 'append_file':
        result = await appendFileTool(call.args, state, ui.paint, ctx);
        break;
      case 'replace_in_file':
        result = await replaceInFileTool(call.args, state, ui.paint, ctx);
        break;
      case 'fetch_url':
        result = await fetchUrlTool(call.args, state, ui.paint, ctx);
        break;
      case 'fetch_http':
        result = await fetchHttpTool(call.args, state, ui.paint, ctx);
        break;
      case 'fetch':
        result = await fetchHttpTool(call.args, state, ui.paint, ctx);
        break;
      case 'webfetch':
        result = await webfetchTool(call.args, state, ui.paint, ctx);
        break;
      case 'scrape_site':
        result = await scrapeSiteTool(call.args, state, ui.paint, ctx);
        break;
      case 'web_search':
        result = await webSearchTool(call.args, state, ui.paint, ctx);
        break;
      case 'web_read':
        result = await webReadTool(call.args, state, ui.paint, ctx);
        break;
      case 'upload_file':
        result = await uploadFileTool(call.args, state, ui.paint, ctx);
        break;
      case 'gmail':
        result = await gmailTool(call.args, state, ui.paint, ctx);
        break;
      case 'create_canvas_image':
        result = await createCanvasImageTool(call.args, state, ui.paint, ctx);
        break;
      case 'git':
        result = await gitUnifiedTool(call.args, state, ui.paint, ctx);
        break;
      case 'load_skill':
        result = await loadSkillTool(call.args, state);
        break;
      case 'memory':
        result = await memoryTool(call.args, state);
        break;
      case 'ask_user':
        result = await askUserTool(call.args, state, ui.paint, ctx);
        break;
      default:
        throw new Error(t(state?.language, `Herramienta no soportada: ${call.tool}`, `Unsupported tool: ${call.tool}`));
    }
  } catch (err) {
    if (options.signal?.aborted || err?.code === 'ABORT_ERR') {
      ui.logEvent(state, 'warn', 'Tool aborted', call.tool);
      throw new Error('aborted');
    }
    throw err;
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const completionDesc = describeToolCall(call, state?.language);
  ui.logEvent(state, 'ok', `Completado ${completionDesc}`, shortText(result, 100));
  return result;
}

function parseDirectAction(input) {
  const text = input.trim();
  if (/^(git|npm|node|pnpm|yarn)\s+/.test(text)) {
    return { tool: 'run_command', args: { command: text } };
  }

  const runMatch = text.match(/^(?:ejecuta|corre)\s+(?:el\s+)?comando\s+([\s\S]+)$/i);
  if (runMatch) {
    return {
      tool: 'run_command',
      args: { command: runMatch[1].trim() },
    };
  }

  const createRepoMatch = text.match(/^(?:crea|crear|create)\s+(?:un\s+)?(?:repo|repositorio)\s+(?:en\s+)?github\s+([a-z0-9._-]+)$/i);
  if (createRepoMatch) {
    return {
      tool: 'git_api_request',
      args: {
        provider: 'github',
        method: 'POST',
        path: '/user/repos',
        body: { name: createRepoMatch[1] },
      },
    };
  }

  const mkdirMatch = text.match(/^(?:crea|crear|haz)\s+(?:la\s+)?(?:carpeta|directorio)\s+([^\s]+)$/i);
  if (mkdirMatch) {
    return {
      tool: 'make_dir',
      args: { path: mkdirMatch[1].trim() },
    };
  }

  const appendMatch = text.match(
    /^(?:anexa|agrega)\s+(?:al\s+)?archivo\s+([^\s]+)\s+el\s+contenido\s+([\s\S]+)$/i,
  );
  if (appendMatch) {
    return {
      tool: 'append_file',
      args: {
        path: appendMatch[1].trim(),
        content: appendMatch[2],
      },
    };
  }

  const writeMatch = text.match(
    /^(?:crea|crear)\s+(?:el\s+)?archivo\s+([^\s]+)\s+con\s+(?:el\s+)?contenido\s+([\s\S]+)$/i,
  );
  if (writeMatch) {
    return {
      tool: 'write_file',
      args: {
        path: writeMatch[1].trim(),
        content: writeMatch[2],
      },
    };
  }

  const replaceMatch = text.match(
    /^(?:reemplaza|cambia)\s+["']([\s\S]+?)["']\s+por\s+["']([\s\S]+?)["']\s+en\s+([^\s]+)$/i,
  );
  if (replaceMatch) {
    return {
      tool: 'replace_in_file',
      args: {
        search: replaceMatch[1],
        replace: replaceMatch[2],
        path: replaceMatch[3].trim(),
      },
    };
  }

  const globMatch = text.match(/^(?:busca|encuentra)\s+archivos\s+con\s+patron\s+([^\s]+)(?:\s+en\s+([^\s]+))?$/i);
  if (globMatch) {
    return {
      tool: 'glob_files',
      args: {
        pattern: globMatch[1].trim(),
        path: globMatch[2]?.trim() ?? '.',
      },
    };
  }

  const infoMatch = text.match(/^(?:info|informacion)\s+de\s+([^\s]+)$/i);
  if (infoMatch) {
    return {
      tool: 'file_info',
      args: {
        path: infoMatch[1].trim(),
      },
    };
  }

  const readMatch = text.match(
    /^(?:lee|mira|abre)\s+(?:el\s+)?archivo\s+([^\s]+)(?:[\s,]+([\s\S]+))?$/i,
  );
  if (readMatch) {
    return {
      tool: 'read_file',
      args: {
        path: readMatch[1].trim(),
      },
    };
  }

  const readLooseMatch = text.match(/^(?:lee|mira|abre)\s+([/~.\w-][^\s]*)(?:[\s,]+([\s\S]+))?$/i);
  if (readLooseMatch) {
    const candidate = readLooseMatch[1].trim();
    if (/[/\\.]/.test(candidate) || candidate.startsWith('~')) {
      return {
        tool: 'read_file',
        args: {
          path: candidate,
        },
      };
    }
  }

  const listMatch = text.match(
    /^(?:lista|muestra)\s+(?:el\s+)?(?:contenido|directorio|carpeta)(?:\s+([^\s]+))?$/i,
  );
  if (listMatch) {
    return {
      tool: 'list_dir',
      args: {
        path: listMatch[1]?.trim() ?? '.',
      },
    };
  }

  const searchMatch = text.match(
    /^(?:busca|buscar)\s+["']?([\s\S]+?)["']?\s+en\s+([^\s]+)$/i,
  );
  if (searchMatch) {
    return {
      tool: 'search_text',
      args: {
        pattern: searchMatch[1].trim(),
        path: searchMatch[2].trim(),
      },
    };
  }

  const fetchMatch = text.match(
    /^(?:abre|visita|carga|fetch)\s+(?:la\s+)?(?:url|pagina|web)?\s*(https?:\/\/[^\s]+)$/i,
  );
  if (fetchMatch) {
    return {
      tool: 'fetch_url',
      args: { url: fetchMatch[1].trim() },
    };
  }

  const listLooseMatch = text.match(
    /^(?:ls|dir|lista)\s+([/~.\w-][^\s]*)$/i,
  );
  if (listLooseMatch) {
    return {
      tool: 'list_dir',
      args: { path: listLooseMatch[1].trim() },
    };
  }

  const catMatch = text.match(
    /^(?:cat|type|muestra)\s+([/~.\w-][^\s]*)$/i,
  );
  if (catMatch) {
    const candidate = catMatch[1].trim();
    if (/[/\\.]/.test(candidate)) {
      return {
        tool: 'read_file',
        args: { path: candidate },
      };
    }
  }

  return null;
}



module.exports = {
  TOOL_DEFINITIONS,
  cleanCommand,
  cleanUrl,
  describeToolCall,
  executeToolCall,
  getToolPromptText,
  parseDirectAction,
  printTools,
};


function getGitSecretLabel(provider, name = '') {
  const key = normalizeProfileName(provider);
  if (key === 'custom') return name ? `custom:${name}` : 'custom';
  return key;
}

function parseColor(value, fallback = 0x000000ff) {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  const raw = value.trim().replace('#', '');
  if (/^[0-9a-f]{6}$/i.test(raw)) return Number.parseInt(`${raw}ff`, 16) >>> 0;
  if (/^[0-9a-f]{8}$/i.test(raw)) return Number.parseInt(raw, 16) >>> 0;
  return fallback;
}

function drawRect(image, x, y, w, h, color) {
  const left = Math.max(0, Math.floor(Number(x) || 0));
  const top = Math.max(0, Math.floor(Number(y) || 0));
  const width = Math.max(1, Math.floor(Number(w) || 0));
  const height = Math.max(1, Math.floor(Number(h) || 0));
  image.scan(left, top, width, height, function (px, py, idx) {
    this.bitmap.data.writeUInt32BE(color >>> 0, idx);
  });
}

function drawRoundRect(image, x, y, w, h, radius, color) {
  const left = Math.max(0, Math.floor(Number(x) || 0));
  const top = Math.max(0, Math.floor(Number(y) || 0));
  const width = Math.max(1, Math.floor(Number(w) || 0));
  const height = Math.max(1, Math.floor(Number(h) || 0));
  const r = Math.max(0, Math.min(Number(radius) || 0, Math.floor(width / 2), Math.floor(height / 2)));
  if (r <= 0) return drawRect(image, left, top, width, height, color);

  image.scan(left, top, width, height, function (px, py, idx) {
    const cx = px < left + r ? left + r : px >= left + width - r ? left + width - r - 1 : px;
    const cy = py < top + r ? top + r : py >= top + height - r ? top + height - r - 1 : py;
    const dx = px - cx;
    const dy = py - cy;
    if ((dx * dx) + (dy * dy) <= r * r) {
      this.bitmap.data.writeUInt32BE(color >>> 0, idx);
    }
  });
}

function drawLine(image, x1, y1, x2, y2, color) {
  const sx = Number(x1 || 0);
  const sy = Number(y1 || 0);
  const tx = Number(x2 || 0);
  const ty = Number(y2 || 0);
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(tx - sx), Math.abs(ty - sy))));
  for (let i = 0; i <= steps; i++) {
    const x = Math.round(sx + ((tx - sx) * i / steps));
    const y = Math.round(sy + ((ty - sy) * i / steps));
    if (x >= 0 && y >= 0 && x < image.bitmap.width && y < image.bitmap.height) {
      image.setPixelColor(color, x, y);
    }
  }
}

async function createCanvasImageTool(args, state, paint) {
  let Jimp, loadFont;
  try {
    ({ Jimp, loadFont } = require('jimp'));
  } catch {
    throw new Error(t(state?.language,
      'create_canvas_image requiere jimp instalado. Instala con: npm install jimp@0.16.1',
      'create_canvas_image requires jimp. Install with: npm install jimp@0.16.1'));
  }
  let fonts;
  try {
    const pluginPrintMain = require.resolve('@jimp/plugin-print');
    const fontsPath = path.join(path.dirname(pluginPrintMain), 'fonts.js');
    fonts = require(fontsPath);
  } catch {
    fonts = {};
  }
  const width = Math.max(1, Number(args.width || 0));
  const height = Math.max(1, Number(args.height || 0));
  if (!width || !height) {
    throw new Error(t(state?.language, 'create_canvas_image requiere width y height', 'create_canvas_image requires width and height'));
  }

  const format = String(args.format || 'png').toLowerCase();
  const safeFormat = ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif', 'tiff'].includes(format) ? format : 'png';
  const fileExt = safeFormat === 'jpeg' ? 'jpg' : safeFormat;
  const outputPath = resolveInputPath(args.outputPath || path.join('generated', `image-${Date.now()}.${fileExt}`), state.cwd);

  const allowed = await askConfirmation(state.rl, 'Crear imagen', `${width}x${height}\nFormato: ${safeFormat}\nSalida: ${outputPath}`, paint, state);
  if (!allowed) return 'Creacion de imagen cancelada por el usuario.';

  const bg = args.background && typeof args.background === 'object'
    ? args.background.color || args.background.fill || '#ffffff'
    : args.background || '#ffffff';
  const image = new Jimp({ width, height, color: parseColor(bg, 0xffffffff) });
  const elements = Array.isArray(args.elements) ? args.elements.filter(Boolean) : [];

  for (const element of elements) {
    if (!element || typeof element !== 'object') continue;
    const type = String(element.type || 'text').toLowerCase();
    if (type === 'rect') {
      const color = parseColor(element.fill || element.color || '#000000', 0x000000ff);
      if (element.radius) drawRoundRect(image, element.x || 0, element.y || 0, element.w || element.width || 0, element.h || element.height || 0, element.radius || 0, color);
      else drawRect(image, element.x || 0, element.y || 0, element.w || element.width || 0, element.h || element.height || 0, color);
      continue;
    }
    if (type === 'line') {
      drawLine(image, element.x1 || 0, element.y1 || 0, element.x2 || 0, element.y2 || 0, parseColor(element.stroke || '#000000', 0x000000ff));
      continue;
    }
    if (type === 'circle' || type === 'ellipse') {
      const color = parseColor(element.fill || element.color || '#000000', 0x000000ff);
      const cx = Number(element.x || 0);
      const cy = Number(element.y || 0);
      const rx = Math.max(1, Number(element.rx || element.r || element.radius || element.width || 0));
      const ry = Math.max(1, Number(element.ry || element.r || element.radius || element.height || rx));
      image.scan(0, 0, image.bitmap.width, image.bitmap.height, function (px, py, idx) {
        const dx = (px - cx) / rx;
        const dy = (py - cy) / ry;
        if ((dx * dx) + (dy * dy) <= 1) {
          this.bitmap.data.writeUInt32BE(color >>> 0, idx);
        }
      });
      continue;
    }
    if (type === 'image') {
      const src = element.src || element.url || element.path;
      if (!src) continue;
      const loaded = await Jimp.read(src.startsWith('http') || src.startsWith('data:') ? src : resolveInputPath(src, state.cwd));
      const x = Number(element.x || 0);
      const y = Number(element.y || 0);
      const w = Math.max(1, Number(element.w || element.width || loaded.bitmap.width));
      const h = Math.max(1, Number(element.h || element.height || loaded.bitmap.height));
      const clone = loaded.clone().resize({ w, h });
      image.composite(clone, x, y);
      continue;
    }

    const text = String(element.text || '');
    if (!text) continue;
    const size = Math.max(8, Math.min(64, Number(element.fontSize || 32)));
    const font = await loadFont(
      size <= 8 ? fonts.SANS_8_BLACK :
      size <= 16 ? fonts.SANS_16_BLACK :
      size <= 32 ? fonts.SANS_32_BLACK :
      fonts.SANS_64_BLACK,
    );
    image.print({ font, x: Number(element.x || 0), y: Number(element.y || 0), maxWidth: element.maxWidth ? Number(element.maxWidth) : undefined }, text);
  }

  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
  await image.write(outputPath);
  return [`Imagen creada: ${outputPath}`, `Formato: ${safeFormat}`, `Tamano: ${width}x${height}`, `Elementos: ${elements.length}`].join('\n');
}


async function gitUnifiedTool(args, state, paint, ctx) {
  const action = String(args.action || '').trim().toLowerCase();
  const provider = normalizeProfileName(args.provider || '');
  const name = String(args.name || '').trim();

  if (!action) throw new Error(t(state?.language, 'git requiere action: "api" | "clone"', 'git requires action: "api" | "clone"'));

  if (action === 'clone') {
    const repoUrl = String(args.repoUrl || '').trim();
    if (!repoUrl) throw new Error(t(state?.language, 'git action="clone" requiere repoUrl', 'git action="clone" requires repoUrl'));
    if (!provider) throw new Error(t(state?.language, 'git action="clone" requiere provider', 'git action="clone" requires provider'));
    const profile = resolveGitProfile(provider, name);
    const finalUrl = buildCloneUrl(repoUrl, profile || {});
    const destination = args.destination ? resolveInputPath(args.destination, state.cwd) : '';
    const timeoutMs = Math.max(1000, Number.isFinite(Number(args.timeoutMs)) ? Number(args.timeoutMs) : 10 * 60 * 1000);
    const allowed = await askConfirmation(state.rl, 'Clonar repositorio', [
      repoUrl,
      profile ? `Provider: ${provider}${name ? ` (${name})` : ''}` : 'Provider: direct',
      destination ? `Destino: ${destination}` : null,
      `Timeout: ${timeoutMs}ms`,
    ].filter(Boolean).join('\n'), paint, state);
    if (!allowed) return 'Clonado cancelado por el usuario.';
    const result = await runProcess('git', ['clone', ...(args.branch ? ['--branch', String(args.branch)] : []), finalUrl, ...(destination ? [destination] : [])], { cwd: state.cwd, timeoutMs, signal: ctx?.signal });
    const lines = [`Exit code: ${result.code}`];
    if (result.timedOut) lines.push('Timeout: el clon fue detenido por tiempo.');
    if (result.stdout.trim()) lines.push(`STDOUT:\n${result.stdout.trim()}`);
    if (result.stderr.trim()) lines.push(`STDERR:\n${result.stderr.trim()}`);
    return lines.join('\n\n');
  }

  if (action === 'api') {
    if (!provider) throw new Error(t(state?.language, 'git action="api" requiere provider', 'git action="api" requires provider'));
    const pathValue = String(args.path || '').trim();
    if (!pathValue) throw new Error(t(state?.language, 'git action="api" requiere path', 'git action="api" requires path'));
    const profile = resolveGitProfile(provider, name);
    if (!profile) throw new Error(t(state?.language, `Proveedor ${provider}${provider === 'custom' && name ? `:${name}` : ''} no configurado.`, `Provider ${provider}${provider === 'custom' && name ? `:${name}` : ''} not configured.`));
    const baseUrl = getApiBaseUrl(provider, profile);
    if (!baseUrl) throw new Error(t(state?.language, `apiBaseUrl no configurada para ${provider}.`, `apiBaseUrl not configured for ${provider}.`));
    const url = `${baseUrl.replace(/\/+$/, '')}/${pathValue.replace(/^\/+/, '')}`;
    const timeoutMs = Math.max(1000, Number.isFinite(Number(args.timeoutMs)) ? Number(args.timeoutMs) : 30000);
    const method = String(args.method || 'GET').toUpperCase();
    const headers = buildApiHeaders(provider, profile, args.headers && typeof args.headers === 'object' ? args.headers : {});
    const bodyPreview = args.body && typeof args.body === 'object' ? JSON.stringify(args.body).slice(0, 200) : '';
    const allowed = await askConfirmation(state.rl, `Git API ${method}`, `${url}${bodyPreview ? `\nBody: ${bodyPreview}` : ''}\nTimeout: ${timeoutMs}ms`, paint, state);
    if (!allowed) return 'Request cancelado por el usuario.';
    const axios = require('axios');
    const response = await axios({
      url,
      method,
      headers: {
        'User-Agent': 'Zyn/1.0',
        Accept: 'application/json, text/plain, */*',
        ...headers,
      },
      data: args.body && typeof args.body === 'object' ? args.body : args.body,
      timeout: timeoutMs,
      responseType: 'text',
      validateStatus: () => true,
    });
    const text = typeof response.data === 'string' ? response.data : JSON.stringify(response.data, null, 2);
    return `Status: ${response.status}\n\n${text}`;
  }

  throw new Error(t(state?.language, `git action "${action}" no reconocida. Usa: "api" | "clone"`, `git action "${action}" not recognized. Use: "api" | "clone"`));
}
