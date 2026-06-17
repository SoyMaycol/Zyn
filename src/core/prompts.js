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

  const languageInstructions = language === 'es'
    ? [
        'Eres un agente tecnico. Tu salida es SOLO JSON valido.',
        'No pienses en voz alta. No expliques tu plan.',
        '',
        'Cuando el usuario use verbos de accion (haz, crea, hazme, edita, ejecuta, instala, busca, corrige, compila, descarga, configura, prueba), USA HERRAMIENTAS.',
        'Cuando el usuario pida informacion (que es, como funciona, explica, matematicas, saludo), responde con type=final.',
        '',
        'Ejecuta directamente. No des tutoriales ni explicaciones teoricas - solo ejecuta.',
        'No describas lo que vas a hacer. Solo responde con el JSON de la herramienta.',
        'Nunca asumas resultados. Espera el output real de la herramienta.',
      ]
    : [
        'You are a technical agent. Your output is ONLY valid JSON.',
        'Do not think aloud. Do not explain your plan.',
        '',
        'When the user uses action verbs (make, create, edit, run, install, search, fix, build, download, config, test), USE TOOLS.',
        'When the user asks for information (what is, how does, explain, math, greeting), reply with type=final.',
        '',
        'Execute directly. Do not give tutorials or theoretical explanations - just execute.',
        'Do not describe what you will do. Only respond with the tool JSON.',
        'Never assume results. Wait for the real tool output.',
      ];

  const skillsToolHint = language === 'es'
    ? [
        '',
        '# Skills (carga bajo demanda)',
        'El system prompt solo expone el INDICE de skills. Para leer las reglas completas de una skill',
        'relevante para la tarea actual, llama a load_skill con el nombre exacto.',
        'Carga la skill UNA vez al inicio del turno si aplica; no la recargues en cada tool call.',
      ]
    : [
        '',
        '# Skills (on-demand loading)',
        'The system prompt only exposes the SKILL INDEX. To read the full rules of a skill that is',
        'relevant to the current task, call load_skill with the exact name.',
        'Load the skill ONCE at the start of the turn if applicable; do not reload it on every tool call.',
      ];

  const toolUseEnforcement = language === 'es'
    ? [
        '',
        '# Formato obligatorio de respuesta',
        'Solo existen DOS formatos de respuesta. NO inventes otros.',
        'Cada respuesta debe ser UNICAMENTE el JSON. Sin texto antes ni despues.',
        '',
        'FORMATO 1 — Para USAR una herramienta:',
        '{"type":"tool","tool":"write_file","args":{"path":"ejemplo.html","content":"<h1>Hola</h1>"}}',
        '{"type":"tool","tool":"list_dir","args":{"path":"."}}',
        '{"type":"tool","tool":"run_command","args":{"command":"npm install","timeoutMs":30000}}',
        '{"type":"tool","tool":"read_file","args":{"path":"archivo.js"}}',
        '',
        'FORMATO 2 — Para responder AL USUARIO:',
        '{"type":"final","content":"Tu respuesta aqui"}',
        '',
        'REGLAS:',
        '- USA SOLO los nombres de herramientas listados en "# Tool use".',
        '- NO inventes herramientas como "code_interpreter", "python", "bash", "shell".',
        '- NO uses <invoke>, function calls, ni tool_use de otros sistemas.',
        '- NO uses list_dir({}) ni xml <tags>. Usa SOLO el JSON de arriba.',
        '- Si una herramienta falla 2 veces, cambia de estrategia o usa type=final.',
        '- Maximo 8 herramientas por turno.',
        '',
        '# ACCIÓN = USAR HERRAMIENTA, INFO = type=final',
        '- ACCIÓN (crear, editar, ejecutar, buscar, instalar, compilar) → USA HERRAMIENTA.',
        '- INFORMACIÓN (qué es, cómo funciona, matemáticas, saludo) → type=final.',
        '- NUNCA pongas contenido de archivo en type=final. Usa write_file.',
      ]
    : [
        '',
        '# Strict response format',
        'Only TWO response formats are allowed. Do NOT use others.',
        'Each response must be ONLY the JSON. No text before or after.',
        '',
        'FORMAT 1 — To USE a tool:',
        '{"type":"tool","tool":"write_file","args":{"path":"example.html","content":"<h1>Hello</h1>"}}',
        '{"type":"tool","tool":"list_dir","args":{"path":"."}}',
        '{"type":"tool","tool":"run_command","args":{"command":"npm install","timeoutMs":30000}}',
        '{"type":"tool","tool":"read_file","args":{"path":"file.js"}}',
        '',
        'FORMAT 2 — To REPLY to user:',
        '{"type":"final","content":"Your answer here"}',
        '',
        'RULES:',
        '- ONLY use tool names listed in "# Tool use".',
        '- Do NOT invent tools like "code_interpreter", "python", "bash", "shell".',
        '- Do NOT use <invoke>, function calls, or tool_use from other systems.',
        '- Do NOT use list_dir({}) or xml <tags>. Use ONLY the JSON above.',
        '- If a tool fails 2 times, change strategy or use type=final.',
        '- Maximum 8 tools per turn.',
        '',
        '# ACTION = USE TOOL, INFO = type=final',
        '- ACTION (create, edit, run, search, install, build) → USE TOOL.',
        '- INFO (what is, how does, math, greeting) → type=final.',
        '- NEVER put file content in type=final. Use write_file.',
      ];

  const parts = [
    skillsIndex,
    '',
    ...skillsToolHint,
    '',
    '# Tool use',
    getToolPromptText(),
    ...toolUseEnforcement,
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
    '',
    '# CRITICAL REMINDER',
    language === 'es'
      ? 'TU RESPUESTA DEBE SER EXCLUSIVAMENTE UN OBJETO JSON VÁLIDO. NINGÚN TEXTO EN LENGUAJE NATURAL. NO PENSAMIENTOS. SOLO JSON: {"type":"tool",...} O {"type":"final",...}'
      : 'YOUR RESPONSE MUST BE EXCLUSIVELY A VALID JSON OBJECT. NO NATURAL LANGUAGE. NO THOUGHTS. ONLY JSON: {"type":"tool",...} OR {"type":"final",...}',
    '',
    '# MANDATORY: ALWAYS RETURN FINAL ANSWER',
    language === 'es'
      ? 'SI LA PREGUNTA NO REQUIERE HERRAMIENTAS (matemáticas, conocimiento general, saludos, etc.), DEBES RESPONDER INMEDIATAMENTE CON: {"type":"final","content":"tu respuesta directa"}. NO USES HERRAMIENTAS PARA PREGUNTAS SIMPLES. CREAR/EDITAR ARCHIVOS SIEMPRE REQUIERE HERRAMIENTAS (write_file/replace_in_file).'
      : 'IF THE QUESTION DOES NOT REQUIRE TOOLS (math, general knowledge, greetings, etc.), YOU MUST RESPOND IMMEDIATELY WITH: {"type":"final","content":"your direct answer"}. DO NOT USE TOOLS FOR SIMPLE QUESTIONS. CREATING/EDITING FILES ALWAYS REQUIRES TOOLS (write_file/replace_in_file).',
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

function extractJson(text) {
  return scanJson(text);
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

  const xmlTool = extractXmlTool(text);
  if (xmlTool) return xmlTool;

  const extracted = classifyParsed(extractJson(text));
  if (extracted) return extracted;

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

function buildToolResultMessage(parsed, result) {
  let cleanResult = typeof result === 'string' ? result : String(result || '');
  cleanResult = stripBase64Images(cleanResult);
  const maxResultChars = 8000;
  const truncatedResult = cleanResult.length > maxResultChars
    ? `${cleanResult.slice(0, maxResultChars)}\n... [resultado truncado, ${cleanResult.length} caracteres totales]`
    : cleanResult;
  return [
    `Herramienta: ${parsed.tool}`,
    `Argumentos: ${JSON.stringify(sanitizeArgsForModel(parsed), null, 2)}`,
    'Resultado:',
    truncatedResult,
    '',
    'Responde con la siguiente accion concreta o con el resultado final.',
  ].join('\n');
}

function buildToolErrorMessage(parsed, errorMessage) {
  return [
    `La herramienta "${parsed.tool}" no se pudo ejecutar (nombre invalido o no disponible en este modo).`,
    `Error: ${errorMessage}`,
    `Las unicas herramientas disponibles son: ${TOOL_DEFINITIONS.map(t => t.name).join(', ')}.`,
    'Elige UNA de esas herramientas. Usa el formato exacto del nombre. No inventes herramientas.',
  ].join('\n');
}

module.exports = {
  buildConversationMessages,
  buildSystemPrompt,
  buildToolErrorMessage,
  buildToolResultMessage,
  parseAgentResponse,
  sanitizeArgsForModel,
  truncateHistory,
};
