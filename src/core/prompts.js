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
        'Responde en el idioma del ultimo mensaje del usuario (si es ambiguo, usa la preferencia de sesion).',
        'Ejecuta la tarea directamente. No des tutoriales ni instrucciones al usuario cuando puedas actuar tú mismo.',
        'Si hace falta, usa herramientas sin pedir permiso extra.',
        'Responde solo con el resultado final o con la siguiente accion concreta.',
        'Si el usuario pide editar, corregir, crear, mover, buscar o ejecutar, hazlo directamente.',
        'Nunca finjas que hiciste algo si no usaste herramientas o no tienes el resultado real.',
        'Si la tarea requiere comprobar algo, primero intenta una herramienta real y espera el resultado antes de concluir.',
        'No cierres con una conclusion si todavia no has probado nada.',
        'Si una tarea dura demasiado, usa run_command con un timeoutMs adecuado y confirma el resultado real.',
        'Para operaciones de Git usa la herramienta git con action="api" o action="clone".',
        'Para proyectos, usa combinaciones de tools según la fase: descubrir (list_dir/search_text), leer (read_file/fetch/webfetch), cambiar (write/replace), validar (run_command), subir artefactos si hace falta (upload_file), documentar (final).',
        'Antes de elegir una herramienta revisa su nombre exacto, argumentos requeridos y resultado esperado; usa read/search/list antes de editar y run_command para validar cambios.',
        'No te limites a una sola tool por costumbre; elige la mejor secuencia técnica para el objetivo.',
        'Si el usuario pide logos, mockups o piezas visuales para un proyecto/frontend, usa create_canvas_image cuando corresponda, junto al resto de tools del flujo.',
      ]
    : [
        'Respond in the language of the user\'s latest message (if ambiguous, use the session preference).',
        'Execute the task directly. Do not give tutorials or instructions when you can act yourself.',
        'Use tools when needed without asking for extra permission.',
        'Reply only with the final result or the next concrete action.',
        'If the user asks to edit, fix, create, move, search, or execute, do it directly.',
        'Never pretend you completed an action if you did not actually use tools or obtain a real result.',
        'If the task requires verification, try a real tool first and wait for its result before concluding.',
        'Do not end with a conclusion if you have not tested anything yet.',
        'If a task takes long, use run_command with an appropriate timeoutMs and verify the real result.',
        'For Git operations use the git tool with action="api" or action="clone".',
        'For project work, combine tools by phase: discover (list_dir/search_text), read (read_file/fetch/webfetch), change (write/replace), validate (run_command), upload artifacts if needed (upload_file), then report.',
        'Before choosing a tool, verify its exact name, required args, and expected result; use read/search/list before editing and run_command to validate changes.',
        'Do not over-focus on a single tool by habit; choose the best technical sequence for the goal.',
        'If the user asks for logos, mockups, or visual assets for a project/frontend, use create_canvas_image when appropriate together with the rest of the workflow.',
        'Prioritize and reuse explicit user-provided context (requirements, constraints, repo instructions, preferences) across the full task; do not ignore it.',
      ];

  const toolUseEnforcement = language === 'es'
    ? [
        '',
        '# Formato obligatorio de respuesta',
        'Solo existen DOS formatos de respuesta. NO inventes otros:',
        '',
        'FORMATO 1 — Para USAR una herramienta:',
        '{"type":"tool","tool":"NOMBRE_EXACTO","args":{"clave":"valor"}}',
        '',
        'FORMATO 2 — Para responder AL USUARIO:',
        '{"type":"final","content":"Tu respuesta aqui"}',
        '',
        'REGLAS ESTRICTAS:',
        '- USA EXCLUSIVAMENTE los nombres de herramientas listados en "# Tool use".',
        '- NO inventes herramientas como "code_interpreter", "python", "bash", "shell", etc.',
        '- NO uses formatos como <invoke>, function calls, ni tool_use de otros sistemas.',
        '- Si una herramienta falla, INTENTA con otra herramienta diferente.',
        '- Si una herramienta falla 2 VECES seguidas, no la repitas. Cambia de estrategia o usa type=final.',
        '- LIMITE: Maximo 8 herramientas por turno. Despues de 8 pasos, responde con type=final.',
        '- Si no puedes completar la tarea, responde con type=final explicando honestamente por que.',
        '- Cada respuesta debe ser UNICAMENTE el JSON. Sin texto antes ni despues.',
      ]
    : [
        '',
        '# Strict response format',
        'Only TWO response formats are allowed. Do NOT use others:',
        '',
        'FORMAT 1 — To USE a tool:',
        '{"type":"tool","tool":"EXACT_NAME","args":{"key":"value"}}',
        '',
        'FORMAT 2 — To REPLY to user:',
        '{"type":"final","content":"Your answer here"}',
        '',
        'STRICT RULES:',
        '- ONLY use tool names listed in "# Tool use".',
        '- Do NOT invent tools like "code_interpreter", "python", "bash", "shell", etc.',
        '- Do NOT use <invoke>, function call, or tool_use formats from other systems.',
        '- If a tool fails, TRY a different tool instead.',
        '- If a tool fails 2 TIMES in a row, do not repeat it. Change strategy or use type=final.',
        '- LIMIT: Maximum 8 tools per turn. After 8 steps, respond with type=final.',
        '- If you cannot complete the task, use type=final and honestly explain why.',
        '- Each response must be ONLY the JSON. No text before or after.',
      ];

  const parts = [
    skills,
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
  return scanJson(text, obj =>
    obj?.type === 'tool' && KNOWN_TOOLS.has(obj.tool),
  );
}

function extractXmlTool(text) {
  const invokeMatch = text.match(
    /<invoke\s+name="([\w-]+)"\s*>\s*<args>\s*([\s\S]*?)\s*<\/args>\s*<\/invoke>/i,
  );
  if (!invokeMatch) return null;

  const tool = invokeMatch[1];
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
    return { type: 'tool', tool: parsed.tool, args: parsed.args ?? {} };
  }
  if (parsed?.type === 'final') {
    return { type: 'final', content: typeof parsed.content === 'string' ? parsed.content : '' };
  }
  if (parsed?.tool && KNOWN_TOOLS.has(parsed.tool)) {
    return { type: 'tool', tool: parsed.tool, args: parsed.args ?? {} };
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

  const tool = toolMatch[1];
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
  const maxResultChars = 8000;
  const truncatedResult = typeof result === 'string' && result.length > maxResultChars
    ? `${result.slice(0, maxResultChars)}\n... [resultado truncado, ${result.length} caracteres totales]`
    : result;
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
    `La herramienta "${parsed.tool}" NO existe.`,
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
};
