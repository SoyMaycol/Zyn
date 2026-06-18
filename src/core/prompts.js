const { normalizeText } = require('../utils/text');
const { buildSkillsIndexPrompt, buildSkillsPrompt } = require('./skills');
const { getToolPromptText, TOOL_DEFINITIONS } = require('../tools');
const { listProvidersFromModels, MODELS, DEFAULT_MODEL_KEY, MAX_HISTORY_CHARS, KEEP_RECENT_MESSAGES, countTokens, stripBase64Images } = require('../config');
const { detectLanguage, normalizeLanguage, languageLabel } = require('../i18n');
const os = require('os');
const fs = require('fs');

function getPlatformInfo() {
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

const TOOL_ALIASES = {
  bash: 'run_command',
  shell: 'run_command',
  terminal: 'run_command',
  execute_command: 'run_command',
  command: 'run_command',
  run_terminal_command: 'run_command',
};

function normalizeToolName(name) {
  const raw = String(name || '').trim();
  if (!raw) return raw;
  const lower = raw.toLowerCase();
  return TOOL_ALIASES[lower] || lower;
}

const KNOWN_TOOLS = new Set([
  ...TOOL_DEFINITIONS.map(tool => tool.name),
  'task_create', 'task_list', 'task_update', 'task_complete', 'task_delete', 'task_clear',
]);

function buildSystemPrompt(cwd, state = {}, options = {}) {
  const language = normalizeLanguage(options.language || state.language || detectLanguage(options.input || '', state.language));
  const platform = getPlatformInfo();
  const date = new Date().toLocaleDateString(language === 'es' ? 'es-ES' : 'en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const skillsIndex = buildSkillsIndexPrompt();
  const providerGroups = listProvidersFromModels(MODELS)
    .map(group => `${group.key}: ${group.models.map(m => m.key).join(', ')}`)
    .join('\n');

  const parts = [
    ...(language === 'es' ? [
      '# RESPUESTA — SOLO JSON, NADA MAS',
      'Tu respuesta es UN OBJETO JSON. Sin texto antes ni despues. Sin explicaciones. Sin pensamientos.',
      '',
      'Usar herramienta:',
      '{"type":"tool","tool":"NOMBRE","args":{...}}',
      'Ejemplos:',
      '  {"type":"tool","tool":"write_file","args":{"path":"index.html","content":"<h1>Hola</h1>"}}',
      '  {"type":"tool","tool":"run_command","args":{"command":"npm install express"}}',
      '  {"type":"tool","tool":"web_search","args":{"query":"clima madrid"}}',
      '  {"type":"tool","tool":"read_file","args":{"path":"package.json"}}',
      '  {"type":"tool","tool":"list_dir","args":{"path":"src"}}',
      '',
      'Responder al usuario:',
      '{"type":"final","content":"Tu respuesta aqui"}',
      '',
      'REGLAS:',
      '- SOLO usa nombres de herramientas de la seccion "# TOOLS".',
      '- NO inventes herramientas. NO uses XML ni function-call syntax.',
      '- Si una herramienta falla 2 veces, cambia de estrategia.',
      '- Maximo 8 herramientas por turno.',
      '- Tienes acceso al historial de la conversacion. Úsalo para responder preguntas sobre conversaciones anteriores.',
      '- Si el usuario pregunta "que dice al principio" o similar, revisa el historial y responde con lo que dice.',
      '',
      '# CLASIFICACION — ACCION vs INFORMACION',
      '',
      'ACCION = usa herramienta (type="tool"):',
      '  verbos: haz, crea, edita, ejecuta, instala, busca, corrige, descarga, configura, borra, mueve',
      '  datos actuales: clima, noticias, precios, cotizaciones → web_search o fetch_url',
      '  "busca" / "buscar" / "el clima" → ACCION, nunca asumas datos actuales',
      '',
      'INFORMACION = responde directo (type="final"):',
      '  definiciones, conceptos, matematicas, saludos, opinion',
      '  "que es X" / "como funciona Y" / "hola" → INFORMACION',
      '',
      'PREGUNTAR AL USUARIO = usa ask_user (type="tool"):',
      '  cuando necesites una decision, preferencia o input del usuario',
      '  cuando el usuario te pida que le preguntes algo',
      '  cuando tengas opciones y no sepas cual elegir',
      '  cuando falte informacion que solo el usuario puede dar',
      '',
      'REGLA: Si necesitas datos actuales o del sistema del usuario → ACCION.',
      'Si puedes responder de memoria → INFORMACION.',
      'Si necesitas que el usuario decida algo → ask_user.',
      'Nunca describas lo que vas a hacer. Solo responde el JSON.',
    ] : [
      '# RESPONSE — ONLY JSON, NOTHING ELSE',
      'Your response is A SINGLE JSON OBJECT. No text before or after. No explanations. No thoughts.',
      '',
      'Use a tool:',
      '{"type":"tool","tool":"NAME","args":{...}}',
      'Examples:',
      '  {"type":"tool","tool":"write_file","args":{"path":"index.html","content":"<h1>Hello</h1>"}}',
      '  {"type":"tool","tool":"run_command","args":{"command":"npm install express"}}',
      '  {"type":"tool","tool":"web_search","args":{"query":"weather london"}}',
      '  {"type":"tool","tool":"read_file","args":{"path":"package.json"}}',
      '  {"type":"tool","tool":"list_dir","args":{"path":"src"}}',
      '',
      'Reply to user:',
      '{"type":"final","content":"Your answer here"}',
      '',
      'RULES:',
      '- ONLY use tool names from the "# TOOLS" section below.',
      '- Do NOT invent tools. Do NOT use XML or function-call syntax.',
      '- If a tool fails 2 times, change strategy.',
      '- Maximum 8 tools per turn.',
      '- You have access to the conversation history. Use it to answer questions about previous conversations.',
      '- If the user asks "what does it say at the beginning" or similar, check the history and respond with what it says.',
      '',
      '# CLASSIFICATION — ACTION vs INFORMATION',
      '',
      'ACTION = use a tool (type="tool"):',
      '  verbs: make, create, edit, run, install, search, fix, download, configure, delete, move',
      '  current data: weather, news, prices, stocks → web_search or fetch_url',
      '  "search" / "find" / "the weather" → ACTION, never assume current data',
      '',
      'INFORMATION = reply directly (type="final"):',
      '  definitions, concepts, math, greetings, opinions',
      '  "what is X" / "how does Y work" / "hello" → INFORMATION',
      '',
      'ASK USER = use ask_user (type="tool"):',
      '  when you need a decision, preference, or input from the user',
      '  when the user asks you to ask them something',
      '  when you have options and don\'t know which to choose',
      '  when missing information only the user can provide',
      '',
      'RULE: If you need current data or user system data → ACTION.',
      'If you can answer from memory → INFORMATION.',
      'If you need the user to decide something → ask_user.',
      'Never describe what you will do. Only respond with the JSON.',
    ]),
    '',
    '# TOOLS',
    getToolPromptText(),
    '',
    ...(language === 'es' ? [
      '# SKILLS',
      'Skills en `data/skills/<name>/SKILL.md`. Formato compatible con skills.sh.',
      'Solo hay un indice aqui. Si necesitas una skill, llama a load_skill con el nombre exacto.',
      'Carga la skill UNA vez al inicio del turno.',
      'Si el usuario menciona un repo o skill que no esta en el indice, usa web_search para buscarlo.',
      '',
      skillsIndex,
    ] : [
      '# SKILLS',
      'Skills in `data/skills/<name>/SKILL.md`. Format compatible with skills.sh.',
      'Only the index is shown here. If you need a skill, call load_skill with the exact name.',
      'Load the skill ONCE at the start of the turn.',
      'If the user mentions a repo or skill not in the index, use web_search to find it.',
      '',
      skillsIndex,
    ]),
    '',
    '# ENVIRONMENT',
    `- Working directory: ${cwd}`,
    `- System: ${platform}`,
    `- Date: ${date}`,
    `- Response language: ${languageLabel(language)}`,
    '',
    '# PROVIDERS',
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

function extractToolJson(text) {
  return scanJson(text, obj =>
    obj?.type === 'tool' && KNOWN_TOOLS.has(obj.tool),
  );
}

function extractXmlTool(text) {
  const invokeMatch = text.match(
    /<invoke\s+name="([\w-]+)"\s*>\s*<args>\s*([\s\S]*?)\s*<\/args>\s*<\/invoke>/i,
  );
  if (!invokeMatch) return null;

  const tool = normalizeToolName(invokeMatch[1]);
  if (!KNOWN_TOOLS.has(tool)) return null;

  const rawArgs = invokeMatch[2].trim();
  if (!rawArgs) return { type: 'tool', tool, args: {} };

  try {
    const args = JSON.parse(rawArgs);
    return { type: 'tool', tool, args: args && typeof args === 'object' ? args : {} };
  } catch {}

  const fuzzy = fuzzyExtractTool(`{"tool":"${tool}","args":${rawArgs}}`);
  if (fuzzy) return fuzzy;

  return { type: 'tool', tool, args: {} };
}

function classifyParsed(parsed) {
  if (parsed?.type === 'tool' && parsed.tool) {
    const normalized = normalizeToolName(parsed.tool);
    if (KNOWN_TOOLS.has(normalized)) return { type: 'tool', tool: normalized, args: parsed.args ?? {} };
  }
  if (parsed?.type === 'final') {
    return { type: 'final', content: typeof parsed.content === 'string' ? parsed.content : '' };
  }
  if (parsed?.tool) {
    const normalized = normalizeToolName(parsed.tool);
    if (KNOWN_TOOLS.has(normalized)) return { type: 'tool', tool: normalized, args: parsed.args ?? {} };
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
  upload_file: ['path', 'field', 'name', 'type'],
  gmail: ['action', 'query', 'maxResults', 'id', 'to', 'subject', 'body'],
  create_canvas_image: ['width', 'height', 'background', 'elements', 'format', 'outputPath'],
  git: ['provider', 'action', 'method', 'path', 'body', 'headers', 'name', 'repoUrl', 'destination', 'branch', 'timeoutMs'],
  load_skill: ['name'],
};

const LONG_VALUE_ARG = {
  run_command: 'command',
  write_file: 'content',
  append_file: 'content',
  replace_in_file: 'replace',
};

function extractMalformedFinalContent(text) {
  const typeMatch = text.match(/(?:["'])type(?:["'])\s*:\s*(?:["'])final(?:["'])/i);
  if (!typeMatch) return null;

  const contentMatch = text.match(/(?:["'])content(?:["'])\s*:\s*(["'])/i);
  if (!contentMatch) return null;

  const quote = contentMatch[1];
  const start = contentMatch.index + contentMatch[0].length;
  let esc = false;

  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (esc) { esc = false; continue; }
    if (ch === '\\') { esc = true; continue; }
    if (ch !== quote) continue;

    const tail = text.slice(i + 1).trim();
    if (!tail || /^}\s*$/.test(tail) || /^,\s*(["']\w+["']\s*:|})/.test(tail)) {
      return unescapeJsonString(text.slice(start, i)).trim();
    }
  }

  const lastQuote = text.lastIndexOf(quote);
  if (lastQuote > start) {
    return unescapeJsonString(text.slice(start, lastQuote)).trim();
  }

  return null;
}

function fuzzyExtractTool(text) {
  const toolMatch = text.match(/(?:"|')?tool(?:"|')?\s*:\s*"(\w+)"/i);
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

function extractArgsContext(text) {
  const argsMatch = text.match(/(?:"|')?args(?:"|')?\s*:\s*\{/i);
  if (!argsMatch) return text;

  let depth = 1;
  let inStr = false;
  let esc = false;
  const start = argsMatch.index + argsMatch[0].length - 1;

  for (let i = start + 1; i < text.length; i++) {
    const ch = text[i];
    if (esc) { esc = false; continue; }
    if (ch === '\\' && inStr) { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return text;
}

function extractLongValueTool(text, tool, longArg) {
  const context = extractArgsContext(text);
  const args = {};
  const keys = TOOL_ARG_KEYS[tool] || [];

  for (const key of keys) {
    if (key === longArg) continue;
    const m = context.match(new RegExp(`(?:"|')?${key}(?:"|')?\\s*:\\s*"([^"]*?)"`));
    if (m) args[key] = unescapeJsonString(m[1]);
    const bm = context.match(new RegExp(`(?:"|')?${key}(?:"|')?\\s*:\\s*(true|false|\\d+)`));
    if (bm) args[key] = bm[1] === 'true' ? true : bm[1] === 'false' ? false : Number(bm[1]);
  }

  const longKeyRe = new RegExp(`(?:"|')?${longArg}(?:"|')?\\s*:`);
  const longMatch = context.match(longKeyRe);
  if (!longMatch) return null;

  const colonPos = context.indexOf(':', longMatch.index + longMatch[0].length - 1);
  if (colonPos === -1) return null;
  const quotePos = context.indexOf('"', colonPos);
  if (quotePos === -1) return null;
  const valStart = quotePos + 1;

  const valEnd = findStringEnd(context, valStart);
  if (valEnd === -1 || valEnd <= valStart) return null;

  const value = context.slice(valStart, valEnd);
  if (!value.trim()) return null;

  args[longArg] = unescapeJsonString(value);
  return { type: 'tool', tool, args };
}

function extractSimpleArgsTool(text, tool) {
  const args = {};
  const keys = TOOL_ARG_KEYS[tool] || [];

  for (const key of keys) {
    const strM = text.match(new RegExp(`(?:"|')?${key}(?:"|')?\\s*:\\s*"([^"]*?)"`));
    if (strM) { args[key] = unescapeJsonString(strM[1]); continue; }
    const numM = text.match(new RegExp(`(?:"|')?${key}(?:"|')?\\s*:\\s*(true|false|\\d+)`));
    if (numM) {
      const v = numM[1];
      args[key] = v === 'true' ? true : v === 'false' ? false : Number(v);
    }
  }

  return Object.keys(args).length > 0
    ? { type: 'tool', tool, args }
    : null;
}

function parseAgentResponse(raw) {
  const text = normalizeText(raw);

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

  const malformedFinalContent = extractMalformedFinalContent(text);
  if (malformedFinalContent !== null) {
    const embedded = extractToolJson(malformedFinalContent);
    if (embedded) return { type: 'tool', tool: embedded.tool, args: embedded.args ?? {} };
    return { type: 'final', content: malformedFinalContent };
  }

  const xmlInvoke = extractXmlTool(text);
  if (xmlInvoke) return xmlInvoke;

  const fuzzy = fuzzyExtractTool(text);
  if (fuzzy) return fuzzy;

  return { type: 'final', content: text || (raw ? String(raw).trim() : '') };
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

function truncateHistory(state) {
  if (!Array.isArray(state.history) || state.history.length === 0) return;
  const totalChars = state.history.reduce((sum, m) => sum + (m.content?.length || 0), 0);
  if (totalChars <= MAX_HISTORY_CHARS) return;

  const keep = Math.min(KEEP_RECENT_MESSAGES, state.history.length);
  const recent = state.history.slice(-keep);
  const removed = state.history.slice(0, -keep);

  const removedSummary = removed
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => {
      const label = m.role === 'user' ? 'U' : 'A';
      const preview = (m.content || '').slice(0, 120).replace(/\n/g, ' ');
      return `[${label}] ${preview}`;
    })
    .join('\n');

  const compacted = removedSummary
    ? `Conversacion anterior (${removed.length} mensajes, ~${countTokens(removedSummary)} tokens):\n${removedSummary}`
    : '';

  state.memorySummary = compacted;
  state.history = recent;
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
      if (msg && msg.content) messages.push(msg);
    }
  }
  for (const msg of turnMessages) {
    if (msg && msg.content) messages.push(msg);
  }
  return messages;
}

function buildToolResultMessage(parsed, result, language = 'es') {
  let cleanResult = typeof result === 'string' ? result : String(result || '');
  cleanResult = stripBase64Images(cleanResult);
  const maxResultChars = 8000;
  const truncated = cleanResult.length > maxResultChars
    ? `${cleanResult.slice(0, maxResultChars)}\n... [${language === 'en' ? 'truncated result' : 'resultado truncado'}, ${cleanResult.length} ${language === 'en' ? 'total chars' : 'caracteres totales'}]`
    : cleanResult;
  const args = JSON.stringify(sanitizeArgsForModel(parsed), null, 2);
  if (language === 'en') {
    return [
      `Tool: ${parsed.tool}`,
      `Args: ${args}`,
      'Result:',
      truncated,
      '',
      'Reply with the next concrete action or the final result.',
    ].join('\n');
  }
  return [
    `Herramienta: ${parsed.tool}`,
    `Argumentos: ${args}`,
    'Resultado:',
    truncated,
    '',
    'Responde con la siguiente accion concreta o con el resultado final.',
  ].join('\n');
}

function buildToolErrorMessage(parsed, errorMessage, language = 'es') {
  const toolNames = TOOL_DEFINITIONS.map(t => t.name).join(', ');
  if (language === 'en') {
    return [
      `The tool "${parsed.tool}" could not be executed (invalid name or not available).`,
      `Error: ${errorMessage}`,
      `Available tools: ${toolNames}.`,
      'Choose ONE of those tools. Use the exact name. Do not invent tools.',
    ].join('\n');
  }
  return [
    `La herramienta "${parsed.tool}" no se pudo ejecutar (nombre invalido o no disponible).`,
    `Error: ${errorMessage}`,
    `Las unicas herramientas disponibles son: ${toolNames}.`,
    'Elige UNA de esas herramientas. Usa el formato exacto del nombre. No inventes herramientas.',
  ].join('\n');
}

module.exports = {
  KNOWN_TOOLS,
  buildConversationMessages,
  buildSystemPrompt,
  buildToolErrorMessage,
  buildToolResultMessage,
  parseAgentResponse,
  sanitizeArgsForModel,
  truncateHistory,
};
