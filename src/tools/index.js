const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');

const fsp = fs.promises;

const {
  MAX_FILE_LINES,
} = require('../config');
const { resolveInputPath } = require('../utils/pathUtils');
const {
  formatLineRange,
  shortText,
  truncateText,
} = require('../utils/text');
const {
  clearTasks,
  completeTask,
  createTask,
  deleteTask,
  formatTask,
  listTasks,
  summarizeTasks,
  updateTask,
} = require('../utils/taskStorage');

const TOOL_DEFINITIONS = [
  { name: 'list_dir', usage: '{ path? }' },
  { name: 'read_file', usage: '{ path, startLine?, endLine? }' },
  { name: 'search_text', usage: '{ pattern, path?, glob? }' },
  { name: 'glob_files', usage: '{ pattern, path? }' },
  { name: 'file_info', usage: '{ path }' },
  { name: 'run_command', usage: '{ command, timeoutMs? }' },
  { name: 'make_dir', usage: '{ path }' },
  { name: 'write_file', usage: '{ path, content }' },
  { name: 'append_file', usage: '{ path, content }' },
  { name: 'replace_in_file', usage: '{ path, search, replace, all? }' },
  { name: 'fetch_url', usage: '{ url, method?, headers?, body?, selector?, attribute?, limit?, timeoutMs? }' },
  { name: 'task_create', usage: '{ title, description?, priority?, dueAt?, tags? }' },
  { name: 'task_list', usage: '{ status?, includeDone? }' },
  { name: 'task_update', usage: '{ id, title?, description?, status?, priority?, dueAt?, tags?, notes? }' },
  { name: 'task_complete', usage: '{ id, notes? }' },
  { name: 'task_delete', usage: '{ id }' },
  { name: 'task_clear', usage: '{ }' },
  { name: 'create_canvas_image', usage: '{ width, height, format?, outputPath?, background?, elements? }' },
  { name: 'web_search', usage: '{ query }' },
  { name: 'web_read', usage: '{ url }' },
];

function getToolPromptText() {
  return [
    '## Lectura y navegacion',
    '',
    'list_dir { path? }',
    '  Lista archivos y carpetas ordenados. Sin path usa directorio actual.',
    '',
    'read_file { path, startLine?, endLine? }',
    '  Lee contenido con numeros de linea. Max 500 lineas por llamada.',
    '  Para archivos grandes, usa startLine/endLine para leer por secciones.',
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
    'run_command { command, timeoutMs? }',
    '  Ejecuta comando en bash. Siempre usa timeoutMs. Si la tarea es corta, usa un tiempo corto; si es install/test/build, usa uno mayor.',
    '  timeoutMs se expresa en milisegundos. Nunca concluyas sin intentar una herramienta real cuando haga falta verificar.',
    '  Retorna exit code, stdout y stderr.',
    '  Ejecuta la accion directamente. No expliques pasos al usuario salvo que sea estrictamente necesario.',
    '  Usa flags no-interactivos: -y, --yes, --no-pager, DEBIAN_FRONTEND=noninteractive.',
    '',
    'fetch_url { url, method?, headers?, body?, selector?, attribute?, limit?, timeoutMs? }',
    '  Sin selector: retorna HTML o texto de la pagina.',
    '  method puede ser GET, POST u otro verbo soportado por la URL.',
    '  headers permite pasar cabeceras avanzadas como Authorization, Accept-Language o User-Agent.',
    '  body acepta string u objeto JSON para solicitudes avanzadas.',
    '  timeoutMs define el tiempo maximo de la peticion.',
    '',
    '## Web',
    '',
    'fetch_url { url, method?, headers?, body?, selector?, attribute?, limit?, timeoutMs? }',
    '  Sin selector: retorna HTML o texto completo de la pagina.',
    '  Con selector CSS (ej: "h1", ".price"): extrae texto de elementos.',
    '  Con selector + attribute (ej: "href", "src"): extrae atributo.',
    '  limit: max elementos a extraer (default: 20, max: 50).',
    '  headers permite cabeceras avanzadas y body permite solicitudes mas complejas.',
    '',
    'task_create { title, description?, priority?, dueAt?, tags? }',
    '  Crea una tarea persistente para que el agente no la olvide.',
    '',
    'task_list { status?, includeDone? }',
    '  Muestra tareas pendientes o completas.',
    '',
    'task_update { id, title?, description?, status?, priority?, dueAt?, tags?, notes? }',
    '  Actualiza una tarea existente.',
    '',
    'task_complete { id, notes? }',
    '  Marca una tarea como terminada.',
    '',
    'task_delete { id }',
    '  Elimina una tarea.',
    '',
    'task_clear { }',
    '  Elimina todas las tareas.',
    '',
    'create_canvas_image { width, height, format?, outputPath?, background?, elements? }',
    '  Crea una imagen real de produccion con node-canvas. Soporta PNG, JPG, WEBP, SVG y PDF segun el formato.',
    '  elements acepta formas, texto, imagenes, gradientes y lineas.',
    '',
    'web_search { query }',
    '  Busca en la web via DuckDuckGo. Retorna titulo, URL y snippet de los primeros resultados.',
    '  Si el usuario pide investigar algo, realiza la busqueda en lugar de explicar como hacerlo.',
    '  Ejemplo: {"type":"tool","tool":"web_search","args":{"query":"como usar puppeteer node"}}',
    '',
    'web_read { url }',
    '  Descarga una pagina web y la convierte a texto legible (sin HTML).',
    '  Ideal para leer articulos, documentacion o contenido de paginas.',
    '  Ejemplo: {"type":"tool","tool":"web_read","args":{"url":"https://docs.example.com/guide"}}',
  ].join('\n');
}

function printTools() {
  console.log('Herramientas disponibles:');
  for (const tool of TOOL_DEFINITIONS) {
    console.log(`  ${tool.name} ${tool.usage}`);
  }
}

function describeToolCall(call) {
  switch (call.tool) {
    case 'list_dir':
      return `Listando ${call.args.path ?? '.'}`;
    case 'read_file':
      return `Leyendo ${call.args.path}`;
    case 'search_text':
      return `Buscando "${shortText(call.args.pattern, 40)}" en ${call.args.path ?? '.'}`;
    case 'glob_files':
      return `Patron ${shortText(call.args.pattern, 50)} en ${call.args.path ?? '.'}`;
    case 'file_info':
      return `Inspeccionando ${call.args.path}`;
    case 'run_command':
      return `Comando ${shortText(call.args.command, 70)}`;
    case 'make_dir':
      return `Creando carpeta ${call.args.path}`;
    case 'task_create':
      return `Creando tarea ${shortText(call.args.title || call.args.description || '', 60)}`;
    case 'task_list':
      return 'Listando tareas';
    case 'task_update':
      return `Actualizando tarea ${call.args.id}`;
    case 'task_complete':
      return `Completando tarea ${call.args.id}`;
    case 'task_delete':
      return `Eliminando tarea ${call.args.id}`;
    case 'task_clear':
      return 'Limpiando tareas';
    case 'create_canvas_image':
      return `Creando imagen ${call.args.width || '?'}x${call.args.height || '?'}`;
    case 'write_file':
      return `Escribiendo ${call.args.path}`;
    case 'append_file':
      return `Anexando ${call.args.path}`;
    case 'replace_in_file':
      return `Editando ${call.args.path}`;
    case 'fetch_url': {
      const cleanedUrl = cleanUrl(call.args.url || '');
      const sel = call.args.selector ? ` → ${shortText(call.args.selector, 30)}` : '';
      return `Fetch ${shortText(cleanedUrl, 50)}${sel}`;
    }
    case 'web_search':
      return `Buscando "${shortText(call.args.query || '', 50)}"`;
    case 'web_read': {
      const readUrl = cleanUrl(call.args.url || '');
      return `Leyendo ${shortText(readUrl, 60)}`;
    }
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

    const timer = options.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          child.kill('SIGTERM');
        }, options.timeoutMs)
      : null;

    child.stdout.on('data', chunk => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', chunk => {
      stderr += chunk.toString();
    });

    child.on('error', reject);
    child.on('close', code => {
      if (timer) {
        clearTimeout(timer);
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


function hasBackgroundOperator(command) {
  return /(^|[^&])&([^&]|$)/.test(command) && !/&&/.test(command);
}

function suggestTimeoutMs(command) {
  const sample = String(command || '').toLowerCase();
  if (!sample) return 30000;
  if (hasBackgroundOperator(sample)) return 5000;
  if (/\b(npm|pnpm|yarn|bun|pip|pip3|cargo|pytest|vitest|jest|mocha|install|build|compile|test|go test)\b/i.test(sample)) {
    return 10 * 60 * 1000;
  }
  if (/\b(serve|watch|run|start|dev|docker|compose)\b/i.test(sample)) {
    return 5 * 60 * 1000;
  }
  return 45000;
}

async function runBackgroundCommand(command, cwd, timeoutMs) {
  const child = spawn('bash', ['-lc', command], {
    cwd,
    detached: true,
    stdio: 'ignore',
  });

  const pid = child.pid || 0;
  child.unref();

  const shortWait = Math.min(Number(timeoutMs) || 0, 1500);
  const deadline = Date.now() + shortWait;

  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0);
      await new Promise(r => setTimeout(r, 100));
      continue;
    } catch {
      return {
        code: 0,
        stdout: `Proceso terminado en background: ${pid}`,
        stderr: '',
        timedOut: false,
        background: true,
        finished: true,
        pid,
      };
    }
  }

  return {
    code: 0,
    stdout: `Proceso iniciado en background: ${pid}`,
    stderr: '',
    timedOut: false,
    background: true,
    finished: false,
    pid,
  };
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

async function readFileTool(args, state) {
  const targetPath = resolveInputPath(args.path, state.cwd);
  const content = await fsp.readFile(targetPath, 'utf8');
  const lines = content.split('\n');
  const startLine = Math.max(Number(args.startLine ?? 1), 1);
  const endLimit = Math.min(lines.length, startLine + MAX_FILE_LINES - 1);
  const endLine = Math.min(Number(args.endLine ?? endLimit), endLimit);
  const body = formatLineRange(lines, startLine, endLine);

  return truncateText(
    `Archivo: ${targetPath}\nLineas ${startLine}-${endLine} de ${lines.length}\n\n${body}`,
  );
}

async function searchTextTool(args, state) {
  if (!args.pattern || typeof args.pattern !== 'string') {
    throw new Error('search_text requiere pattern');
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
  });

  if (result.code === 1) {
    return `Sin coincidencias en ${targetPath}`;
  }

  if (result.code !== 0) {
    throw new Error(result.stderr.trim() || `rg fallo con codigo ${result.code}`);
  }

  return truncateText(result.stdout.trim() || `Sin coincidencias en ${targetPath}`);
}

async function globFilesTool(args, state) {
  if (!args.pattern || typeof args.pattern !== 'string') {
    throw new Error('glob_files requiere pattern');
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
    throw new Error('file_info requiere path');
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

async function runCommandTool(args, state, paint) {
  if (!args.command || typeof args.command !== 'string') {
    throw new Error('run_command requiere command');
  }

  const command = cleanCommand(args.command);
  const timeoutMs = Math.max(1000, Number.isFinite(Number(args.timeoutMs)) ? Number(args.timeoutMs) : suggestTimeoutMs(command));
  const detail = [
    command,
    `Directorio: ${state.cwd}`,
    `Timeout: ${timeoutMs}ms`,
    hasBackgroundOperator(command) ? 'Modo: background detectado' : null,
  ].filter(Boolean).join('\n');

  const allowed = await askConfirmation(
    state.rl,
    'Ejecutar comando',
    detail,
    paint,
    state,
  );

  if (!allowed) {
    return 'Comando cancelado por el usuario.';
  }

  let result;
  if (hasBackgroundOperator(command)) {
    result = await runBackgroundCommand(command, state.cwd, timeoutMs);
  } else {
    result = await runProcess('bash', ['-lc', command], {
      cwd: state.cwd,
      timeoutMs,
    });
  }

  const parts = [`Exit code: ${result.code ?? 'desconocido'}`];

  if (result.background) {
    parts.push(`Background: ${result.finished ? 'terminado' : 'iniciado'}`);
    if (result.pid) parts.push(`PID: ${result.pid}`);
  }

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
    throw new Error('make_dir requiere path');
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
    throw new Error('write_file requiere path');
  }

  if (typeof args.content !== 'string') {
    throw new Error('write_file requiere content');
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
    throw new Error('append_file requiere path');
  }

  if (typeof args.content !== 'string') {
    throw new Error('append_file requiere content');
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
    throw new Error('replace_in_file requiere path');
  }

  if (typeof args.search !== 'string' || typeof args.replace !== 'string') {
    throw new Error('replace_in_file requiere search y replace');
  }

  const targetPath = resolveInputPath(args.path, state.cwd);
  const content = await fsp.readFile(targetPath, 'utf8');
  const matches = content.split(args.search).length - 1;

  if (matches === 0) {
    throw new Error('No encontre el texto a reemplazar');
  }

  const nextContent = args.all
    ? content.split(args.search).join(args.replace)
    : content.replace(args.search, args.replace);

  if (nextContent === content) {
    throw new Error('El reemplazo no produjo cambios');
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
    throw new Error('fetch_url requiere url');
  }

  const url = cleanUrl(args.url);

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`URL invalida: ${url}`);
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Solo se permite http y https');
  }

  const timeoutMs = Math.max(1000, Number.isFinite(Number(args.timeoutMs)) ? Number(args.timeoutMs) : 15000);
  const detail = [
    `${String(args.method || 'GET').toUpperCase()} ${url}`,
    args.selector ? `Selector: ${args.selector}` : null,
    args.headers ? 'Headers: configurados' : null,
    args.body ? 'Body: configurado' : null,
    `Timeout: ${timeoutMs}ms`,
  ].filter(Boolean).join('\n');

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

  const axios = require('axios');
  const response = await axios({
    url,
    method: String(args.method || 'GET').toUpperCase(),
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
      ...(args.headers || {}),
    },
    data: args.body && typeof args.body === 'object' ? args.body : args.body,
    timeout: timeoutMs,
    maxContentLength: 512000,
    maxRedirects: 5,
    responseType: 'text',
    validateStatus: () => true,
  });

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


function parseTagList(value) {
  if (Array.isArray(value)) {
    return value.map(item => String(item).trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value.split(/[;,]/).map(item => item.trim()).filter(Boolean);
  }
  return [];
}

function normalizePriority(value) {
  const sample = String(value || '').trim().toLowerCase();
  if (['high', 'alta', 'urgente', '1'].includes(sample)) return 'high';
  if (['low', 'baja', '2'].includes(sample)) return 'low';
  return 'medium';
}

async function taskListTool(args, state) {
  const tasks = listTasks({
    status: args.status ? String(args.status).trim().toLowerCase() : '',
    includeDone: args.includeDone !== false,
  });

  const lang = state.language === 'es' ? 'es' : 'en';
  if (tasks.length === 0) {
    return lang === 'es' ? 'No hay tareas registradas.' : 'No tasks recorded.';
  }

  return [
    lang === 'es' ? `Tareas: ${tasks.length}` : `Tasks: ${tasks.length}`,
    ...tasks.map(formatTask),
  ].join('\n');
}

async function taskCreateTool(args, state) {
  const task = createTask({
    title: args.title || args.description || '',
    description: args.description || '',
    priority: normalizePriority(args.priority),
    dueAt: args.dueAt || null,
    tags: parseTagList(args.tags),
    source: 'agent',
    sessionId: state.sessionId || null,
    notes: args.notes || '',
  });
  return `Tarea creada: ${formatTask(task)}`;
}

async function taskUpdateTool(args) {
  if (!args.id) {
    throw new Error('task_update requiere id');
  }
  const task = updateTask(args.id, {
    title: args.title,
    description: args.description,
    status: args.status,
    priority: args.priority ? normalizePriority(args.priority) : undefined,
    dueAt: args.dueAt,
    tags: args.tags !== undefined ? parseTagList(args.tags) : undefined,
    notes: args.notes,
  });
  return `Tarea actualizada: ${formatTask(task)}`;
}

async function taskCompleteTool(args) {
  if (!args.id) {
    throw new Error('task_complete requiere id');
  }
  const task = completeTask(args.id, args.notes || '');
  return `Tarea completada: ${formatTask(task)}`;
}

async function taskDeleteTool(args) {
  if (!args.id) {
    throw new Error('task_delete requiere id');
  }
  const task = deleteTask(args.id);
  return `Tarea eliminada: ${task.id} :: ${task.title}`;
}

async function taskClearTool() {
  clearTasks();
  return 'Todas las tareas fueron eliminadas.';
}

function pickCanvasColor(value, fallback = '#000000') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function drawRoundedRect(ctx, x, y, w, h, r = 0) {
  const radius = Math.max(0, Number(r) || 0);
  if (radius <= 0) {
    ctx.rect(x, y, w, h);
    return;
  }
  const rr = Math.min(radius, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
}

async function createCanvasImageTool(args, state, paint) {
  const width = Math.max(1, Number(args.width || 0));
  const height = Math.max(1, Number(args.height || 0));
  if (!width || !height) {
    throw new Error('create_canvas_image requiere width y height');
  }

  const format = String(args.format || 'png').toLowerCase();
  const safeFormat = ['png', 'jpg', 'jpeg', 'webp', 'svg', 'pdf'].includes(format) ? format : 'png';
  const fileExt = safeFormat === 'jpeg' ? 'jpg' : safeFormat;
  const outputPath = resolveInputPath(
    args.outputPath || path.join('generated', `canvas-${Date.now()}.${fileExt}`),
    state.cwd,
  );

  const allowed = await askConfirmation(
    state.rl,
    'Crear imagen',
    `${width}x${height}
Formato: ${safeFormat}
Salida: ${outputPath}`,
    paint,
    state,
  );

  if (!allowed) {
    return 'Creacion de imagen cancelada por el usuario.';
  }

  const { createCanvas, loadImage } = require('canvas');
  const canvasType = safeFormat === 'svg' || safeFormat === 'pdf' ? safeFormat : undefined;
  const canvas = canvasType ? createCanvas(width, height, canvasType) : createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  const elements = Array.isArray(args.elements) ? args.elements : [];

  if (args.background) {
    if (typeof args.background === 'string') {
      ctx.fillStyle = args.background;
      ctx.fillRect(0, 0, width, height);
    } else if (args.background && typeof args.background === 'object') {
      if (args.background.type === 'linear-gradient' && Array.isArray(args.background.stops)) {
        const grad = ctx.createLinearGradient(
          Number(args.background.x0 || 0),
          Number(args.background.y0 || 0),
          Number(args.background.x1 || width),
          Number(args.background.y1 || height),
        );
        for (const stop of args.background.stops) {
          if (stop && typeof stop === 'object' && stop.color) {
            grad.addColorStop(Number(stop.offset ?? 0), String(stop.color));
          }
        }
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);
      } else if (args.background.color) {
        ctx.fillStyle = args.background.color;
        ctx.fillRect(0, 0, width, height);
      }
    }
  }

  for (const element of elements) {
    if (!element || typeof element !== 'object') continue;
    const type = String(element.type || 'text').toLowerCase();
    ctx.save();
    if (element.opacity !== undefined) {
      ctx.globalAlpha = Math.max(0, Math.min(1, Number(element.opacity)));
    }
    if (element.shadowColor) ctx.shadowColor = element.shadowColor;
    if (element.shadowBlur) ctx.shadowBlur = Number(element.shadowBlur) || 0;
    if (element.shadowOffsetX) ctx.shadowOffsetX = Number(element.shadowOffsetX) || 0;
    if (element.shadowOffsetY) ctx.shadowOffsetY = Number(element.shadowOffsetY) || 0;

    if (element.clip && element.clip.radius) {
      ctx.beginPath();
      drawRoundedRect(ctx, Number(element.x || 0), Number(element.y || 0), Number(element.w || element.width || 0), Number(element.h || element.height || 0), Number(element.clip.radius || 0));
      ctx.clip();
    }

    switch (type) {
      case 'rect': {
        const x = Number(element.x || 0);
        const y = Number(element.y || 0);
        const w = Number(element.w || element.width || 0);
        const h = Number(element.h || element.height || 0);
        if (element.fill) {
          ctx.fillStyle = element.fill;
          ctx.fillRect(x, y, w, h);
        }
        if (element.stroke) {
          ctx.lineWidth = Number(element.lineWidth || 1);
          ctx.strokeStyle = element.stroke;
          if (element.radius) {
            ctx.beginPath();
            drawRoundedRect(ctx, x, y, w, h, element.radius);
            ctx.stroke();
          } else {
            ctx.strokeRect(x, y, w, h);
          }
        }
        break;
      }
      case 'circle':
      case 'ellipse': {
        const x = Number(element.x || 0);
        const y = Number(element.y || 0);
        const rx = Number(element.rx || element.r || element.radius || element.width || 0);
        const ry = Number(element.ry || element.r || element.radius || element.height || rx);
        ctx.beginPath();
        ctx.ellipse(x, y, rx, ry, Number(element.rotation || 0), 0, Math.PI * 2);
        if (element.fill) {
          ctx.fillStyle = element.fill;
          ctx.fill();
        }
        if (element.stroke) {
          ctx.lineWidth = Number(element.lineWidth || 1);
          ctx.strokeStyle = element.stroke;
          ctx.stroke();
        }
        break;
      }
      case 'line': {
        ctx.beginPath();
        ctx.moveTo(Number(element.x1 || 0), Number(element.y1 || 0));
        ctx.lineTo(Number(element.x2 || 0), Number(element.y2 || 0));
        ctx.lineWidth = Number(element.lineWidth || 1);
        ctx.strokeStyle = element.stroke || '#000000';
        if (Array.isArray(element.dash)) {
          ctx.setLineDash(element.dash.map(Number));
        }
        ctx.stroke();
        break;
      }
      case 'image': {
        const src = element.src || element.url || element.path;
        if (!src) break;
        const img = await loadImage(src.startsWith('http') || src.startsWith('data:') ? src : resolveInputPath(src, state.cwd));
        const x = Number(element.x || 0);
        const y = Number(element.y || 0);
        const w = Number(element.w || element.width || img.width);
        const h = Number(element.h || element.height || img.height);
        if (element.fit === 'cover') {
          ctx.drawImage(img, x, y, w, h);
        } else {
          ctx.drawImage(img, x, y, w, h);
        }
        break;
      }
      case 'text':
      default: {
        const x = Number(element.x || 0);
        const y = Number(element.y || 0);
        ctx.font = `${element.fontStyle || ''} ${element.fontWeight || element.weight || 'normal'} ${Number(element.fontSize || 24)}px ${element.fontFamily || 'Arial'}`.replace(/\s+/g, ' ').trim();
        ctx.fillStyle = pickCanvasColor(element.fill || element.color, '#000000');
        ctx.textAlign = element.align || 'left';
        ctx.textBaseline = element.baseline || 'alphabetic';
        const text = String(element.text || '');
        if (element.stroke) {
          ctx.lineWidth = Number(element.lineWidth || 1);
          ctx.strokeStyle = element.stroke;
          ctx.strokeText(text, x, y, element.maxWidth ? Number(element.maxWidth) : undefined);
        }
        ctx.fillText(text, x, y, element.maxWidth ? Number(element.maxWidth) : undefined);
        break;
      }
    }

    ctx.restore();
  }

  await fsp.mkdir(path.dirname(outputPath), { recursive: true });
  let buffer;
  if (safeFormat === 'jpg' || safeFormat === 'jpeg') {
    buffer = canvas.toBuffer('image/jpeg', { quality: Number(args.quality || 0.92) });
  } else if (safeFormat === 'webp') {
    buffer = canvas.toBuffer('image/webp', { quality: Number(args.quality || 0.92) });
  } else {
    buffer = canvas.toBuffer();
  }
  await fsp.writeFile(outputPath, buffer);

  return [
    `Imagen creada: ${outputPath}`,
    `Formato: ${safeFormat}`,
    `Tamano: ${width}x${height}`,
    `Elementos: ${elements.length}`,
  ].join('\n');
}

async function webSearchTool(args, state, paint) {
  const query = (args.query || '').trim();
  if (!query) throw new Error('web_search requiere query');

  const allowed = await askConfirmation(
    state.rl, 'Buscar en la web', query, paint, state,
  );
  if (!allowed) return 'Busqueda cancelada.';

  const axios = require('axios');
  const cheerio = require('cheerio');
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

  const res = await axios({
    url,
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
    },
    timeout: 15000,
    responseType: 'text',
  });

  const $ = cheerio.load(res.data);
  const results = [];

  $('.result').each((i, el) => {
    if (i >= 10) return false;
    const title = $(el).find('.result__a').text().trim();
    const snippet = $(el).find('.result__snippet').text().trim();
    const href = $(el).find('.result__url').attr('href')
      || $(el).find('.result__a').attr('href') || '';
    if (title) results.push(`${i + 1}. ${title}\n   ${href}\n   ${snippet}`);
  });

  return results.length > 0
    ? `Resultados para: ${query}\n\n${results.join('\n\n')}`
    : 'Sin resultados para esa busqueda.';
}

async function webReadTool(args, state, paint) {
  const rawUrl = (args.url || '').trim();
  if (!rawUrl) throw new Error('web_read requiere url');

  const url = cleanUrl(rawUrl);
  let parsed;
  try { parsed = new URL(url); } catch { throw new Error(`URL invalida: ${url}`); }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Solo se permite http y https');
  }

  const allowed = await askConfirmation(
    state.rl, 'Leer pagina web', url, paint, state,
  );
  if (!allowed) return 'Lectura cancelada.';

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

async function executeToolCall(call, state, ui) {
  ui.logEvent(state, 'tool', describeToolCall(call));

  const startTime = Date.now();
  let result;

  switch (call.tool) {
    case 'list_dir':
      result = await listDirTool(call.args, state);
      break;
    case 'read_file':
      result = await readFileTool(call.args, state);
      break;
    case 'search_text':
      result = await searchTextTool(call.args, state);
      break;
    case 'glob_files':
      result = await globFilesTool(call.args, state);
      break;
    case 'file_info':
      result = await fileInfoTool(call.args, state);
      break;
    case 'run_command':
      result = await runCommandTool(call.args, state, ui.paint);
      break;
    case 'make_dir':
      result = await makeDirTool(call.args, state, ui.paint);
      break;
    case 'write_file':
      result = await writeFileTool(call.args, state, ui.paint);
      break;
    case 'append_file':
      result = await appendFileTool(call.args, state, ui.paint);
      break;
    case 'replace_in_file':
      result = await replaceInFileTool(call.args, state, ui.paint);
      break;
    case 'fetch_url':
      result = await fetchUrlTool(call.args, state, ui.paint);
      break;
    case 'task_create':
      result = await taskCreateTool(call.args, state, ui.paint);
      break;
    case 'task_list':
      result = await taskListTool(call.args, state, ui.paint);
      break;
    case 'task_update':
      result = await taskUpdateTool(call.args, state, ui.paint);
      break;
    case 'task_complete':
      result = await taskCompleteTool(call.args, state, ui.paint);
      break;
    case 'task_delete':
      result = await taskDeleteTool(call.args, state, ui.paint);
      break;
    case 'task_clear':
      result = await taskClearTool(call.args, state, ui.paint);
      break;
    case 'create_canvas_image':
      result = await createCanvasImageTool(call.args, state, ui.paint);
      break;
    case 'web_search':
      result = await webSearchTool(call.args, state, ui.paint);
      break;
    case 'web_read':
      result = await webReadTool(call.args, state, ui.paint);
      break;
    default:
      throw new Error(`Herramienta no soportada: ${call.tool}`);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  ui.logEvent(state, 'ok', `Completado en ${elapsed}s`, shortText(result, 100));
  return result;
}

function buildOllamaInstallCommand() {
  const isTermux = Boolean(
    process.env.TERMUX_VERSION
    || process.env.TERMUX_APP_PACKAGE
    || (process.env.PREFIX && process.env.PREFIX.includes('com.termux'))
  );

  return isTermux
    ? 'pkg update -y && pkg install -y ollama'
    : 'curl -fsSL https://ollama.com/install.sh | sh';
}

function parseDirectAction(input) {
  const text = input.trim();

  const runMatch = text.match(/^(?:ejecuta|corre)\s+(?:el\s+)?comando\s+([\s\S]+)$/i);
  if (runMatch) {
    return {
      tool: 'run_command',
      args: { command: runMatch[1].trim() },
    };
  }

  if (/^(?:instala|installa|install)\s+ollama$/i.test(text)) {
    return {
      tool: 'run_command',
      args: { command: buildOllamaInstallCommand() },
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
