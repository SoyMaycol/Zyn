const { normalizeText } = require('../utils/text');
const { buildSkillsPrompt } = require('./skills');
const { getToolPromptText } = require('../tools');
const { listProvidersFromModels, MODELS, DEFAULT_MODEL_KEY } = require('../config');
const { detectLanguage, normalizeLanguage, languageLabel } = require('../i18n');

const KNOWN_TOOLS = new Set([
  'list_dir', 'read_file', 'search_text', 'glob_files', 'file_info',
  'run_command', 'make_dir', 'write_file', 'append_file', 'replace_in_file',
  'fetch_url', 'task_create', 'task_list', 'task_update', 'task_complete', 'task_delete', 'task_clear', 'create_canvas_image', 'git_secret_set', 'git_secret_list', 'git_secret_remove', 'git_clone_repo', 'git_api_request', 'web_search', 'web_read',
]);


function buildSystemPrompt(cwd, state = {}, options = {}) {
  const language = normalizeLanguage(options.language || state.language || detectLanguage(options.input || '', state.language));
  const platform = process.platform === 'linux' ? 'Linux'
    : process.platform === 'darwin' ? 'macOS'
    : process.platform;
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
        'Para GitHub, GitLab o un Git personalizado usa git_secret_set para guardar credenciales y git_clone_repo o git_api_request para operar sin exponer secretos.',
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
        'For GitHub, GitLab, or a custom Git host, use git_secret_set to store credentials and git_clone_repo or git_api_request to operate without exposing secrets.',
      ];

  const parts = [
    skills,
    '',
    '# Tool use',
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
  web_search: ['query'],
  web_read: ['url'],
  create_canvas_image: ['width', 'height', 'background', 'elements', 'format', 'outputPath'],
};

const LONG_VALUE_ARG = {
  run_command: 'command',
  write_file: 'content',
  append_file: 'content',
  replace_in_file: 'replace',
};

function fuzzyExtractTool(text) {
  const toolMatch = text.match(/"tool"\s*:\s*"(\w+)"/);
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
  parseAgentResponse,
  sanitizeArgsForModel,
};
