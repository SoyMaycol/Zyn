const { normalizeText } = require('../utils/text');
const { buildSkillsPrompt } = require('./skills');
const { getToolPromptText, TOOL_DEFINITIONS } = require('../tools');
const { listProvidersFromModels, MODELS, DEFAULT_MODEL_KEY } = require('../config');
const { detectLanguage, normalizeLanguage, languageLabel } = require('../i18n');
const os = require('os');
const fs = require('fs');

function getPlatformInfo() {
  // Detectar SO real primero
  let osName = 'Unknown';

  if (process.platform === 'linux') {
    try {
      const release = fs.readFileSync('/etc/os-release', 'utf8');
      const nameMatch = release.match(/^PRETTY_NAME="?([^"\n]+)"?/m);
      if (nameMatch) {
        osName = nameMatch[1];
      } else {
        const idMatch = release.match(/^ID="?([^"\n]+)"?/m);
        const verMatch = release.match(/^VERSION_ID="?([^"\n]+)"?/m);
        osName = `Linux ${idMatch ? idMatch[1] : ''}${verMatch ? ' ' + verMatch[1] : ''}`.trim();
      }
    } catch {
      try {
        const { execSync } = require('child_process');
        osName = execSync('uname -o -r -m', { encoding: 'utf8', timeout: 3000 }).trim();
      } catch {
        osName = `Linux ${os.release()} ${os.arch()}`;
      }
    }
  } else if (process.platform === 'darwin') {
    try {
      const { execSync } = require('child_process');
      const ver = execSync('sw_vers -productVersion', { encoding: 'utf8', timeout: 3000 }).trim();
      osName = `macOS ${ver} (${os.arch()})`;
    } catch {
      osName = `macOS ${os.release()} (${os.arch()})`;
    }
  } else if (process.platform === 'win32') {
    osName = `Windows ${os.release()} (${os.arch()})`;
  }

  return osName;
}

const KNOWN_TOOLS = new Set([
  ...TOOL_DEFINITIONS.map(tool => tool.name),
  'task_create', 'task_list', 'task_update', 'task_complete', 'task_delete', 'task_clear',
]);

const TOOL_ALIASES = new Map([
  ['command', 'run_command'],
  ['cmd', 'run_command'],
  ['exec', 'run_command'],
  ['execute', 'run_command'],
  ['run', 'run_command'],
  ['runcommand', 'run_command'],
  ['run_command_tool', 'run_command'],
  ['shell', 'run_command'],
  ['terminal', 'run_command'],
  ['bash', 'run_command'],
  ['list', 'list_dir'],
  ['ls', 'list_dir'],
  ['dir', 'list_dir'],
  ['list_directory', 'list_dir'],
  ['listdir', 'list_dir'],
  ['list_dir_tool', 'list_dir'],
  ['read', 'read_file'],
  ['readfile', 'read_file'],
  ['read_file_tool', 'read_file'],
  ['cat', 'read_file'],
  ['open_file', 'read_file'],
  ['grep', 'search_text'],
  ['search', 'search_text'],
  ['find_text', 'search_text'],
  ['searchtext', 'search_text'],
  ['search_text_tool', 'search_text'],
  ['glob', 'glob_files'],
  ['mkdir', 'make_dir'],
  ['makedir', 'make_dir'],
  ['write', 'write_file'],
  ['writefile', 'write_file'],
  ['append', 'append_file'],
  ['appendfile', 'append_file'],
  ['replace', 'replace_in_file'],
  ['replaceinfile', 'replace_in_file'],
  ['http', 'fetch_http'],
  ['fetch_url_content', 'fetch_url'],
  ['web_fetch', 'webfetch'],
]);

function normalizeToolName(name) {
  const normalized = String(name || '')
    .trim()
    .replace(/^tools?[./:-]/i, '')
    .replace(/[\s-]+/g, '_')
    .toLowerCase();
  return TOOL_ALIASES.get(normalized) || normalized;
}

function normalizeToolArgs(tool, rawArgs) {
  if (!rawArgs || typeof rawArgs !== 'object' || Array.isArray(rawArgs)) return {};
  const args = { ...rawArgs };

  if (tool === 'run_command' && typeof args.command !== 'string') {
    args.command = args.cmd || args.shell || args.input || args.code || args.query;
  }
  if (tool === 'list_dir' && typeof args.path !== 'string') {
    args.path = args.directory || args.dir || args.cwd || args.target || '.';
  }
  if (tool === 'read_file' && typeof args.path !== 'string') {
    args.path = args.file || args.filename || args.target;
  }
  if (tool === 'search_text' && typeof args.pattern !== 'string') {
    args.pattern = args.regex || args.query || args.search;
  }
  if (tool === 'glob_files' && typeof args.pattern !== 'string') {
    args.pattern = args.glob || args.query || args.search;
  }

  return args;
}

function getToolNameFromObject(obj) {
  return obj?.tool || obj?.name || obj?.function?.name || obj?.tool_name || obj?.toolName;
}

function getToolArgsFromObject(obj) {
  let args = obj?.args ?? obj?.arguments ?? obj?.input ?? obj?.parameters ?? obj?.function?.arguments;
  if (typeof args === 'string') {
    try { args = JSON.parse(args); } catch { args = {}; }
  }
  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    args = { ...obj };
    delete args.type;
    delete args.tool;
    delete args.name;
    delete args.tool_name;
    delete args.toolName;
    delete args.function;
  }
  return args;
}

function toToolCall(obj) {
  const tool = normalizeToolName(getToolNameFromObject(obj));
  if (!KNOWN_TOOLS.has(tool)) return null;
  return { type: 'tool', tool, args: normalizeToolArgs(tool, getToolArgsFromObject(obj)) };
}


function buildSystemPrompt(cwd, state = {}, options = {}) {
  const language = normalizeLanguage(options.language || state.language || detectLanguage(options.input || '', state.language));
  const platform = getPlatformInfo();
  const date = new Date().toLocaleDateString(language === 'es' ? 'es-ES' : 'en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const skills = buildSkillsPrompt();
  const providerGroups = listProvidersFromModels(MODELS)
    .map(group => `${group.key}: ${group.models.map(m => m.key).join(', ')}`)
    .join('\n');

  const languageInstructions = language === 'es'
    ? [
        'Responde siempre en español.',
        'Ejecuta la tarea directamente. No des tutoriales ni instrucciones al usuario cuando puedas actuar tú mismo.',
        'Si hace falta, usa herramientas sin pedir permiso extra.',
        'Responde solo con el resultado final o con la siguiente accion concreta.',
        'Si el usuario pide editar, corregir, crear, mover, buscar o ejecutar, hazlo directamente.',
        'Nunca finjas que hiciste algo si no usaste herramientas o no tienes el resultado real.',
        'Si la tarea requiere comprobar algo, primero intenta una herramienta real y espera el resultado antes de concluir.',
        'No cierres con una conclusion si todavia no has probado nada.',
        'Si una tarea dura demasiado, usa run_command con un timeoutMs adecuado y confirma el resultado real.',
        'Para operaciones de Git usa la herramienta git con action="api" o action="clone".',
        'Usa exclusivamente tools registradas en "Tool use". No inventes nombres de tools ni aliases.',
        'Mantente acotado y determinista: entradas claras, salidas claras, sin razonamiento creativo salvo que el usuario lo pida.',
        'Cuando aplique, entrega resumen ejecutivo corto + riesgos/banderas rojas + siguiente accion concreta.',
        'Para proyectos, usa combinaciones de tools según la fase: descubrir (list_dir/search_text), leer (read_file/fetch/webfetch), cambiar (write/replace), validar (run_command), documentar (final).',
        'No te limites a una sola tool por costumbre; elige la mejor secuencia técnica para el objetivo.',
        'Si el usuario pide logos, mockups o piezas visuales para un proyecto/frontend, usa create_canvas_image cuando corresponda, junto al resto de tools del flujo.',
      ]
    : [
        'Always respond in English.',
        'Execute the task directly. Do not give tutorials or instructions when you can act yourself.',
        'Use tools when needed without asking for extra permission.',
        'Reply only with the final result or the next concrete action.',
        'If the user asks to edit, fix, create, move, search, or execute, do it directly.',
        'Never pretend you completed an action if you did not actually use tools or obtain a real result.',
        'If the task requires verification, try a real tool first and wait for its result before concluding.',
        'Do not end with a conclusion if you have not tested anything yet.',
        'If a task takes long, use run_command with an appropriate timeoutMs and verify the real result.',
        'For Git operations use the git tool with action="api" or action="clone".',
        'Use only tools listed under "Tool use". Never invent tool names or aliases.',
        'Stay bounded and deterministic: clear inputs, clear outputs, no creative reasoning unless explicitly requested.',
        'When relevant, provide a short executive summary + obvious red flags + next concrete action.',
        'For project work, combine tools by phase: discover (list_dir/search_text), read (read_file/fetch/webfetch), change (write/replace), validate (run_command), then report.',
        'Do not over-focus on a single tool by habit; choose the best technical sequence for the goal.',
        'If the user asks for logos, mockups, or visual assets for a project/frontend, use create_canvas_image when appropriate together with the rest of the workflow.',
      ];

  const parts = [
    skills,
    '',
    '# Tool use',
    'Tools are NOT native provider functions. To use a tool, output exactly one JSON object and no prose:',
    '{"type":"tool","tool":"list_dir","args":{"path":"."}}',
    'For command execution, use: {"type":"tool","tool":"run_command","args":{"command":"ls"}}',
    'Never write phrases like "Tool X does not exist". If a tool is listed below, it exists in Zyn and must be requested with JSON.',
    getToolPromptText(),
    '',
    '# Environment',
    `- Working directory: ${cwd}`,
    `- System: ${platform}`,
    `- Date: ${date}`,
    `- Response language: ${languageLabel(language)}`,
    '',
    '# Working mode',
    ...languageInstructions,
    '',
    '# Available providers and models',
    providerGroups,
  ];

  if (state.personaPrompt && state.personaPrompt.trim()) {
    parts.push(
      '',
      '# Persona style (tone only)',
      'Apply this only to communication style. Do NOT change tool choice, safety rules, or technical decisions.',
      state.personaPrompt.trim(),
    );
  }

  if (state.concuerdo) {
    const activeKey = state.activeModel || DEFAULT_MODEL_KEY;
    const otherKeys = Object.keys(MODELS).filter(k => k !== activeKey);
    const otherLabels = otherKeys.map(k => MODELS[k]?.label || k).join(', ');
    parts.push(
      '',
      '# Group mode (ACTIVE)',
      `You work collaboratively with ${otherKeys.length} models: ${otherLabels}.`,
      'Each model may review and correct the others before the final answer.',
      'If asked, confirm that you are working with other models.',
    );
  }

  return parts.join('\n');
}

function scanJson(text, filterFn) {
  let pos = 0;
  while (pos < text.length) {
    const start = text.indexOf('{', pos);
    if (start === -1) return null;

    let depth = 0;
    let inStr = false;
    let esc = false;

    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (esc) { esc = false; continue; }
      if (ch === '\\' && inStr) { esc = true; continue; }
      if (ch === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (ch === '{') depth++;
      if (ch === '}') {
        depth--;
        if (depth === 0) {
          try {
            const obj = JSON.parse(text.slice(start, i + 1));
            if (!filterFn || filterFn(obj)) return obj;
          } catch {}
          break;
        }
      }
    }

    pos = start + 1;
  }
  return null;
}

function extractJson(text) {
  return scanJson(text);
}

function extractToolJson(text) {
  const obj = scanJson(text, candidate => Boolean(toToolCall(candidate)));
  return toToolCall(obj);
}

function extractXmlTool(text) {
  const invokeMatch = text.match(
    /<invoke\s+name=["']([^"']+)["']\s*>\s*<args>\s*([\s\S]*?)\s*<\/args>\s*<\/invoke>/i,
  );
  const toolCallMatch = text.match(
    /<tool_call\s+name=["']([^"']+)["']\s*>\s*([\s\S]*?)\s*<\/tool_call>/i,
  );
  const match = invokeMatch || toolCallMatch;
  if (!match) return null;

  const tool = normalizeToolName(match[1]);
  if (!KNOWN_TOOLS.has(tool)) return null;

  const rawArgs = (match[2] || '').trim();
  if (!rawArgs) return { type: 'tool', tool, args: {} };

  try {
    const args = JSON.parse(rawArgs);
    return { type: 'tool', tool, args: normalizeToolArgs(tool, args) };
  } catch {}

  const fuzzy = fuzzyExtractTool(`{"tool":"${tool}","args":${rawArgs}}`);
  if (fuzzy) return fuzzy;

  return { type: 'tool', tool, args: {} };
}

function classifyParsed(parsed) {
  if (Array.isArray(parsed)) {
    return parsed.map(classifyParsed).find(Boolean) || null;
  }
  const toolCall = toToolCall(parsed);
  if (toolCall && (parsed?.type === 'tool' || parsed?.tool || parsed?.name || parsed?.function?.name)) {
    return toolCall;
  }
  if (Array.isArray(parsed?.tool_calls) && parsed.tool_calls.length > 0) {
    const firstTool = parsed.tool_calls.map(toToolCall).find(Boolean);
    if (firstTool) return firstTool;
  }
  if (Array.isArray(parsed?.toolCalls) && parsed.toolCalls.length > 0) {
    const firstTool = parsed.toolCalls.map(toToolCall).find(Boolean);
    if (firstTool) return firstTool;
  }
  if (parsed?.type === 'final') {
    return { type: 'final', content: typeof parsed.content === 'string' ? parsed.content : '' };
  }
  if (parsed?.type === 'answer' || parsed?.type === 'message') {
    const content = parsed.content ?? parsed.answer ?? parsed.message ?? '';
    return { type: 'final', content: typeof content === 'string' ? content : JSON.stringify(content) };
  }
  return null;
}

const TOOL_ARG_KEYS = {
  list_dir: ['path'],
  read_file: ['path', 'startLine', 'endLine'],
  search_text: ['pattern', 'path', 'glob'],
  glob_files: ['pattern', 'path'],
  file_info: ['path'],
  run_command: ['command'],
  make_dir: ['path'],
  write_file: ['path', 'content'],
  append_file: ['path', 'content'],
  replace_in_file: ['path', 'search', 'replace', 'all'],
  fetch_url: ['url', 'selector', 'attribute', 'limit'],
  fetch: ['url', 'method', 'headers', 'query', 'json', 'data', 'form', 'files', 'timeoutMs'],
  fetch_http: ['url', 'method', 'headers', 'query', 'json', 'data', 'form', 'files', 'timeoutMs'],
  webfetch: ['url', 'headers', 'timeoutMs'],
  scrape_site: ['url', 'selectors', 'limit', 'headers'],
  web_search: ['query', 'lang', 'limit'],
  web_read: ['url'],
  create_canvas_image: ['width', 'height', 'background', 'elements', 'format', 'outputPath'],
  git: ['provider', 'action', 'method', 'path', 'body', 'headers', 'name', 'repoUrl', 'destination', 'branch', 'timeoutMs'],
};

const LONG_VALUE_ARG = {
  run_command: 'command',
  write_file: 'content',
  append_file: 'content',
  replace_in_file: 'replace',
};

function fuzzyExtractTool(text) {
  const toolMatch = text.match(/"(?:tool|name|tool_name|toolName)"\s*:\s*"([\w\s.-]+)"/);
  if (!toolMatch) return null;

  const tool = normalizeToolName(toolMatch[1]);
  if (!KNOWN_TOOLS.has(tool)) return null;

  const longArg = LONG_VALUE_ARG[tool];
  if (longArg) {
    return extractLongValueTool(text, tool, longArg);
  }

  return extractSimpleArgsTool(text, tool);
}

function unescapeJsonString(raw) {
  return raw
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\r/g, '\r')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
}

function findStringEnd(text, start) {
  for (let i = start; i < text.length; i++) {
    if (text[i] === '\\') { i++; continue; }
    if (text[i] === '"') return i;
  }
  return -1;
}

function extractLongValueTool(text, tool, longArg) {
  const args = {};
  const keys = TOOL_ARG_KEYS[tool] || [];

  for (const key of keys) {
    if (key === longArg) continue;
    const m = text.match(new RegExp(`"${key}"\\s*:\\s*"([^"]*?)"`));
    if (m) args[key] = unescapeJsonString(m[1]);
    const bm = text.match(new RegExp(`"${key}"\\s*:\\s*(true|false|\\d+)`));
    if (bm) args[key] = bm[1] === 'true' ? true : bm[1] === 'false' ? false : Number(bm[1]);
  }

  const marker = `"${longArg}"`;
  const argIdx = text.indexOf(marker);
  if (argIdx === -1) return null;

  let i = text.indexOf(':', argIdx + marker.length);
  if (i === -1) return null;
  i = text.indexOf('"', i);
  if (i === -1) return null;
  const valStart = i + 1;

  const valEnd = findStringEnd(text, valStart);
  if (valEnd === -1 || valEnd <= valStart) return null;

  const value = text.slice(valStart, valEnd);
  if (!value.trim()) return null;

  args[longArg] = unescapeJsonString(value);
  return { type: 'tool', tool, args };
}

function extractSimpleArgsTool(text, tool) {
  const args = {};
  const keys = TOOL_ARG_KEYS[tool] || [];

  for (const key of keys) {
    const strM = text.match(new RegExp(`"${key}"\\s*:\\s*"([^"]*?)"`));
    if (strM) { args[key] = unescapeJsonString(strM[1]); continue; }
    const numM = text.match(new RegExp(`"${key}"\\s*:\\s*(true|false|\\d+)`));
    if (numM) {
      const v = numM[1];
      args[key] = v === 'true' ? true : v === 'false' ? false : Number(v);
    }
  }

  return Object.keys(args).length > 0
    ? { type: 'tool', tool, args }
    : null;
}

function stripCodeFence(text) {
  const match = String(text || '').trim().match(/^```(?:json|javascript|js)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1].trim() : text;
}

function parseAgentResponse(raw) {
  const text = stripCodeFence(normalizeText(raw));

  try {
    const parsed = JSON.parse(text);
    const result = classifyParsed(parsed);
    if (result) {
      if (result.type === 'final' && result.content) {
        const embedded = extractToolJson(result.content);
        if (embedded) {
          return { type: 'tool', tool: embedded.tool, args: embedded.args ?? {} };
        }
      }
      return result;
    }
  } catch {}

  const tool = extractToolJson(text);
  if (tool) return { type: 'tool', tool: tool.tool, args: tool.args ?? {} };

  const xmlTool = extractXmlTool(text);
  if (xmlTool) return xmlTool;

  const extracted = classifyParsed(extractJson(text));
  if (extracted) return extracted;

  const fuzzy = fuzzyExtractTool(text);
  if (fuzzy) return fuzzy;

  return { type: 'final', content: text || raw.trim() };
}

function sanitizeArgsForModel(parsed) {
  const args = { ...(parsed.args || {}) };
  if (typeof args.content === 'string' && args.content.length > 2000) {
    args.content = `${args.content.slice(0, 2000)}\n... [truncado]`;
  }
  if (typeof args.replace === 'string' && args.replace.length > 2000) {
    args.replace = `${args.replace.slice(0, 2000)}\n... [truncado]`;
  }
  if (typeof args.command === 'string' && args.command.length > 1000) {
    args.command = `${args.command.slice(0, 1000)} ...`;
  }
  return args;
}

function buildConversationMessages(state, turnMessages, systemPrompt) {
  const messages = [];
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  if (state.memorySummary) {
    messages.push({
      role: 'system',
      content: `Memoria resumida anterior:\n${state.memorySummary}`,
    });
  }
  if (Array.isArray(state.history) && state.history.length > 0) {
    for (const msg of state.history) {
      messages.push(msg);
    }
  }
  messages.push(...turnMessages);
  return messages;
}

function buildToolResultMessage(parsed, result) {
  return [
    `Herramienta: ${parsed.tool}`,
    `Argumentos: ${JSON.stringify(sanitizeArgsForModel(parsed), null, 2)}`,
    'Resultado:',
    result,
    '',
    'Responde con la siguiente accion concreta o con el resultado final.',
  ].join('\n');
}

function buildToolErrorMessage(parsed, errorMessage) {
  return [
    `La herramienta ${parsed.tool} fallo.`,
    `Error: ${errorMessage}`,
    'Corrige la llamada o explica brevemente el problema si no puedes continuar.',
  ].join('\n');
}

module.exports = {
  buildConversationMessages,
  buildSystemPrompt,
  buildToolErrorMessage,
  buildToolResultMessage,
  normalizeToolName,
  parseAgentResponse,
  sanitizeArgsForModel,
};
