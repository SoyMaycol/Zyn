const { normalizeText } = require('../utils/text');
const { buildSkillsIndexPrompt, buildSkillsPrompt } = require('./skills');
const {
  getToolPromptText,
  TOOL_DEFINITIONS,
  getMcpToolDefinitions: getMcpToolDefsFromTools,
  refreshMcpTools,
  refreshPluginTools,
} = require('../tools');
const { listProvidersFromModels, MODELS, DEFAULT_MODEL_KEY, MAX_HISTORY_CHARS, MAX_OUTPUT_CHARS, KEEP_RECENT_MESSAGES, countTokens, stripBase64Images, getSetting } = require('../config');
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

  refreshMcpTools();
  refreshPluginTools();
  const mcpDefs = getMcpToolDefsFromTools();
  const mcpToolNames = mcpDefs.map(t => t.name);
  for (const name of mcpToolNames) KNOWN_TOOLS.add(name);
  for (const name of [...KNOWN_TOOLS]) {
    if (!mcpToolNames.includes(name) && name.startsWith('mcp_')) {
      KNOWN_TOOLS.delete(name);
    }
  }

  const { getPluginToolDefinitions } = require('../plugins/index');
  const pluginDefs = getPluginToolDefinitions();
  for (const t of pluginDefs) KNOWN_TOOLS.add(t.name);

  const skillsIndex = buildSkillsIndexPrompt();
  const providerGroups = listProvidersFromModels(MODELS)
    .map(group => `${group.key}: ${group.models.map(m => m.key).join(', ')}`)
    .join('\n');

  const mcpToolsPrompt = mcpDefs.length > 0
    ? (language === 'es'
      ? `\n# MCP TOOLS\nHerramientas externas conectadas via MCP. Usa el nombre exacto.\n${mcpDefs.map(t => `  ${t.name} — ${t.description}`).join('\n')}\n`
      : `\n# MCP TOOLS\nExternal tools connected via MCP. Use the exact name.\n${mcpDefs.map(t => `  ${t.name} — ${t.description}`).join('\n')}\n`)
    : '';

  const pluginToolsPrompt = pluginDefs.length > 0
    ? (language === 'es'
      ? `\n# PLUGIN TOOLS\nHerramientas de plugins instalados. Usa el nombre exacto.\n${pluginDefs.map(t => `  ${t.name} — ${t.description}`).join('\n')}\n`
      : `\n# PLUGIN TOOLS\nTools from installed plugins. Use the exact name.\n${pluginDefs.map(t => `  ${t.name} — ${t.description}`).join('\n')}\n`)
    : '';

  const parts = [
    ...(language === 'es' ? [
      '# REGLA ABSOLUTA — RESPUESTA FINAL JSON',
      '',
      'SI LA CONSULTA DEL USUARIO NO REQUIERE USAR HERRAMIENTAS (es solo informacion, saludo, opinion,',
      'concepto, definicion, matematica, traduccion, explicacion, etc.), ENTONCES:',
      '',
      'RESPONDE ESTRICTA Y OBLIGATORIAMENTE CON: {"type":"final","content":"tu respuesta aqui"}',
      '',
      'NO USES herramientas. NO hagas tool calls. NO investigues. Solo responde directamente.',
      'El usuario quiere una respuesta rapida, no que ejecutes comandos ni busques en internet.',
      '',
      'SOLO usa herramientas si el usuario EXPLICITAMENTE pide: crear/editar archivos, ejecutar',
      'comandos, buscar en internet, instalar paquetes, etc.',
      '',
      '# FORMATO DE RESPUESTA',
      '',
      'Siempre respondes con UNO O MAS objetos JSON separados por salto de linea.',
      'El ULTIMO JSON es tu accion (tool call o final). Los anteriores son comentarios.',
      '',
      'Para usar una herramienta:',
      '  {"type":"tool","tool":"NOMBRE","args":{...}}',
      '',
      'Para responder al usuario directamente (CUANDO SEA SOLO INFORMACION):',
      '  {"type":"final","content":"Tu respuesta aqui"}',
      '',
      'COMENTARIOS VOLUNTARIOS — DEBES comentar tu progreso, no trabajar en silencio:',
      '  {"type":"comment","content":"Voy a revisar el archivo de configuracion primero"}',
      '  {"type":"tool","tool":"read_file","args":{"path":"config.json"}}',
      '',
      '  El comentario se muestra al usuario. Es OBLIGATORIO comentar durante el trabajo,',
      '  no solo al final. Di que vas a hacer, muestra resultados parciales, etc.',
      '',
      '  Los comentarios NO son tecnicos ni descripciones de herramienta.',
      '  Buenos: "Voy a revisar los datos primero", "Un momento, revisando..."',
      '  Malos: "📁 Leyendo configuración..." (no emojis de accion), "🔍 Buscando..."',
      '',
      '  Los comentarios pueden ser LARGOS con formato (usando \\n):',
      '  {"type":"comment","content":"Encontre estos resultados:\\n\\n- CPU: 45%\\n- RAM: 2.1Gi\\n\\nAhora revisare el disco"}',
      '  {"type":"tool","tool":"run_command","args":{"command":"df -h"}}',
      '',
      '  REGLA: comment NUNCA es el ultimo JSON. Despues de comment SIEMPRE va tool o final.',
      '  Si muestras resultados parciales, usa comment y luego continua con tool o final.',
      '',
      '# FORMATO DINAMICO EN RESPUESTAS (bilingue)',
      '',
      'Usa estos formatos DENTRO de "content" en type="final".',
      'El sistema renderiza markdown automaticamente:',
      '',
      '  **texto** o **text** = negrita / bold',
      '  *texto* o *text* = italica / italic',
      '  `codigo` o `code` = inline code',
      '  ```lenguaje ... ``` = code block',
      '  - item / 1. item = listas / lists',
      '  > cita / quote = blockquote',
      '  --- = separador horizontal / horizontal rule',
      '',
      'Para presentar DATOS EN LISTA (cuando el usuario pide "lista" o "lista dinamica"):',
      '',
      '  ## Titulo de seccion / Section title',
      '  Descripcion breve / Brief description.',
      '',
      '  - **Categoria / Category:** valor con `detalle` y explicacion',
      '  - **Otra / Another:** otro valor',
      '',
      '  Para tablas / For tables:',
      '  | Columna / Column | Columna / Column |',
      '  |---------|---------|',
      '  | valor   | valor   |',
      '',
      '  Usa emojis con moderacion solo para mejorar legibilidad:',
      '  ⚠ importante / important, ✅ completado / done, ❌ error, ℹ nota / note, 📊 datos / data',
      '  NO uses emojis en cada linea. Solo en titulos de seccion o puntos clave.',
      '',
      '  Las listas extensas se renderizan como scrollable. No limites el contenido.',
      '  Si el usuario pide "lista dinamica", usa el formato de secciones + bullet points.',
      '',
      '# MEMORIA — GUARDA AUTOMATICAMENTE',
      'Despues de CADA interaccion, evalua si debes guardar algo en memoria:',
      '  - Si encontraste un bug → memory save con key="bug:<breve>" y value=<descripcion>',
      '  - Si aprendiste algo del usuario → memory save con key="user:<tema>" y value=<info>',
      '  - Si descubriste algo del proyecto → memory save con key="project:<tema>" y value=<info>',
      '  - Si el usuario corrigio algo → memory save con key="preference:<tema>" y value=<preference>',
      'Guarda SIEMPRE que haya algo worth remembering. No esperes a que el usuario pida.',
      'Ejemplo: {"type":"tool","tool":"memory","args":{"action":"save","key":"bug:import","value":"El archivo src/index.js tenia una import circular"}}',
      '',
      'HERRAMIENTAS DISPONIBLES:',
      '{"type":"tool","tool":"NOMBRE","args":{...}}',
      'Ejemplos:',
      '  {"type":"tool","tool":"write_file","args":{"path":"index.html","content":"<h1>Hola</h1>"}}',
      '  {"type":"tool","tool":"run_command","args":{"command":"npm install express"}}',
      '  {"type":"tool","tool":"web_search","args":{"query":"clima madrid"}}',
      '  {"type":"tool","tool":"read_file","args":{"path":"package.json"}}',
      '  {"type":"tool","tool":"list_dir","args":{"path":"src"}}',
      '',
      'REGLAS:',
      '- SOLO usa nombres de herramientas de la seccion "# TOOLS".',
      '- NO inventes herramientas.',
      '- Si una herramienta falla 2 veces, cambia de estrategia.',
      '- Usa tantas herramientas como necesites. No hay limite.',
      '- Tienes acceso al historial de la conversacion. Úsalo para responder preguntas sobre conversaciones anteriores.',
      '- Si el usuario pregunta "que dice al principio" o similar, revisa el historial y responde con lo que dice.',
      '',
      'REGLAS PARA EJECUTAR COMANDOS (run_command):',
      '- NUNCA uses & al final del comando. Ejecuta comandos de forma sincrona.',
      '- Si necesitas un proceso largo, usa timeout razonable (30-120 segundos).',
      '- Ejemplo CORRECTO: {"type":"tool","tool":"run_command","args":{"command":"npm install","timeout":120000}}',
      '- Ejemplo MAL: {"type":"tool","tool":"run_command","args":{"command":"node server.js &"}}',
      '- Si un comando necesita seguir corriendo en background, informa al usuario primero.',
      '- Siempre incluye timeout en milisegundos para comandos que puedan tardar.',
      '',
      'PROHIBIDO — NUNCA hagas esto:',
      '  <toolcall><invoke name="run_command"><args>{"command":"ls"}</args></invoke></toolcall>',
      '  <invoke name="run_command"><args>...',
      '  ```json\n{"type":"tool",...}\n```',
      '  "Voy a ejecutar el comando..." y luego el JSON',
      '  Explicaciones antes o despues del JSON',
      '',
      'FLUJO DE TRABAJO:',
      '  tool call → TOOL_RESULT → (comment + tool call en un mensaje) → TOOL_RESULT → ... → {"type":"final","content":"..."}',
      '  SIEMPRE termina con final. NUNCA dejes la conversacion sin respuesta final.',
      '  Los comments van en el MISMO mensaje que tu siguiente accion, separados por salto de linea.',
      '',
      'Tu respuesta DEBE SER UNICAMENTE JSON(s). Sin <>, sin ```, sin texto fuera del JSON.',
      '',
      '# CLASIFICACION — ACCION vs INFORMACION',
      '',
      'ACCION = usa herramienta (type="tool"):',
      '  verbos: haz, crea, edita, ejecuta, instala, busca, corrige, descarga, configura, borra, mueve',
      '  datos actuales: clima, noticias, precios, cotizaciones → web_search o fetch_url',
      '  "busca" / "buscar" / "el clima" → ACCION, nunca asumas datos actuales',
      '',
      'INFORMACION = responde directo (type="final"):',
      '  definiciones, conceptos, matematicas, saludos, opinion, explicaciones',
      '  "que es X" / "como funciona Y" / "hola" / "dime sobre Z" → INFORMACION',
      '  REGLA ABSOLUTA: Si solo es informacion, NO uses herramientas. Responde directo.',
      '',
      'PREGUNTAR AL USUARIO = usa ask_user (type="tool"):',
      '  cuando necesites una decision, preferencia o input del usuario',
      '  cuando el usuario te pida que le preguntes algo',
      '  cuando tengas opciones y no sepas cual elegir',
      '  cuando falte informacion que solo el usuario puede dar',
      '  cuando tengas dudas sobre que framework, libreria o herramienta usar',
      '  cuando no estes seguro de algo y necesites confirmacion',
      '  REGLA: SIEMPRE pregunta al usuario cuando tengas dudas, nunca asumas.',
      '  IMPORTANTE: DESPUES de recibir la respuesta de ask_user, SIEMPRE genera una respuesta completa al usuario con la información que pidió. NUNCA termines después de ask_user.',
      '',
      'REGLA: Si necesitas datos actuales o del sistema del usuario → ACCION.',
      'Si puedes responder de memoria → INFORMACION → responde directo con final.',
      'Si necesitas que el usuario decida algo → ask_user.',
      'Si el usuario te pide que recuerdes algo → memory save.',
      '',
      'GUARDAR EN MEMORIA = usa memory save (type="tool"):',
      '  cuando encuentres un bug o error en el codigo del usuario',
      '  cuando descubras informacion importante sobre el proyecto o preferencias del usuario',
      '  cuando el usuario te cuente algo personal o relevante sobre su trabajo',
      '  cuando aprendas algo que te ayude a ayudar mejor al usuario en el futuro',
      '  REGLA: Guarda en memoria SIEMPRE que encuentres algo worth remembering. No esperes a que el usuario pida.',
    ] : [
      '# ABSOLUTE RULE — FINAL JSON RESPONSE',
      '',
      'IF THE USER\'S QUERY DOES NOT REQUIRE USING TOOLS (just information, greeting, opinion,',
      'concept, definition, math, translation, explanation, etc.), THEN:',
      '',
      'YOU MUST STRICTLY AND OBLIGATORILY RESPOND WITH: {"type":"final","content":"your answer here"}',
      '',
      'DO NOT use tools. DO NOT make tool calls. DO NOT research. Just respond directly.',
      'The user wants a quick answer, not for you to execute commands or search the internet.',
      '',
      'Only use tools if the user EXPLICITLY asks to: create/edit files, run commands,',
      'search the internet, install packages, etc.',
      '',
      '# RESPONSE FORMAT',
      '',
      'You always respond with ONE OR MORE JSON objects, each on their own line.',
      'The LAST JSON is your action (tool call or final). Previous ones are comments.',
      '',
      'To use a tool:',
      '  {"type":"tool","tool":"NAME","args":{...}}',
      '',
      'VOLUNTARY COMMENTS — You MUST comment on your progress, do NOT work silently:',
      '  {"type":"comment","content":"Let me check the config file first"}',
      '  {"type":"tool","tool":"read_file","args":{"path":"config.json"}}',
      '',
      '  Comments show to the user. You MUST comment during work, not just at the end.',
      '  Say what you are about to do, show partial results, etc.',
      '',
      '  Comments are NATURAL language, not technical descriptions.',
      '  GOOD: "Let me check the data first", "One moment, let me verify"',
      '  BAD: "📁 Reading configuration..." (no action emojis), "🔍 Searching..."',
      '',
      '  Comments can be LONG with formatting (using \\n):',
      '  {"type":"comment","content":"Found these results:\\n\\n- CPU: 45%\\n- RAM: 2.1Gi\\n\\nNow checking disk"}',
      '  {"type":"tool","tool":"run_command","args":{"command":"df -h"}}',
      '',
      '  RULE: comment is NEVER the last JSON. After comment, ALWAYS follow with tool or final.',
      '  If you show partial results, use comment then continue with tool or final.',
      '',
      'To reply to the user directly (WHEN IT IS JUST INFORMATION):',
      '  {"type":"final","content":"Your answer here"}',
      '',
      '# DYNAMIC FORMAT IN RESPONSES',
      '',
      'Use these formats INSIDE "content" in type="final".',
      'The system renders markdown automatically:',
      '',
      '  **text** = bold',
      '  *text* = italic',
      '  `text` = inline code',
      '  ```language ... ``` = code block',
      '  - item / 1. item = lists',
      '  > text = blockquote',
      '  --- = horizontal rule',
      '',
      'For presenting DATA AS LIST (when the user asks for "list" or "dynamic list"):',
      '',
      '  ## Section title',
      '  Brief description.',
      '',
      '  - **Category:** value with `detail` and explanation',
      '  - **Another category:** another value',
      '',
      '  For tables:',
      '  | Column | Column |',
      '  |--------|--------|',
      '  | value  | value  |',
      '',
      '  Use emojis sparingly, only for readability:',
      '  ⚠ important, ✅ done, ❌ error, ℹ note, 📊 data',
      '  DO NOT use emojis on every line. Only section titles or key points.',
      '',
      '  Long lists render as scrollable. Do not limit content.',
      '  If the user asks for "dynamic list", use sections + bullet points format.',
      '',
      '# MEMORY — SAVE AUTOMATICALLY',
      'After EACH interaction, evaluate if you should save to memory:',
      '  - If you found a bug → memory save with key="bug:<brief>" and value=<description>',
      '  - If you learned something about the user → memory save with key="user:<topic>" and value=<info>',
      '  - If you discovered something about the project → memory save with key="project:<topic>" and value=<info>',
      '  - If the user corrected something → memory save with key="preference:<topic>" and value=<preference>',
      'ALWAYS save when there is something worth remembering. Don\'t wait for the user to ask.',
      'Example: {"type":"tool","tool":"memory","args":{"action":"save","key":"bug:import","value":"The file src/index.js had a circular import"}}',
      '',
      'AVAILABLE TOOLS:',
      '{"type":"tool","tool":"NAME","args":{...}}',
      'Examples:',
      '  {"type":"tool","tool":"write_file","args":{"path":"index.html","content":"<h1>Hello</h1>"}}',
      '  {"type":"tool","tool":"run_command","args":{"command":"npm install express"}}',
      '  {"type":"tool","tool":"web_search","args":{"query":"weather london"}}',
      '  {"type":"tool","tool":"read_file","args":{"path":"package.json"}}',
      '  {"type":"tool","tool":"list_dir","args":{"path":"src"}}',
      '',
      'RULES:',
      '- ONLY use tool names from the "# TOOLS" section below.',
      '- Do NOT invent tools.',
      '- If a tool fails 2 times, change strategy.',
      '- Use as many tools as you need. There is no limit.',
      '- You have access to the conversation history. Use it to answer questions about previous conversations.',
      '- If the user asks "what does it say at the beginning" or similar, check the history and respond with what it says.',
      '',
      'RULES FOR EXECUTING COMMANDS (run_command):',
      '- NEVER use & at the end of commands. Run commands synchronously.',
      '- If you need a long process, use a reasonable timeout (30-120 seconds).',
      '- CORRECT example: {"type":"tool","tool":"run_command","args":{"command":"npm install","timeout":120000}}',
      '- WRONG example: {"type":"tool","tool":"run_command","args":{"command":"node server.js &"}}',
      '- If a command needs to run in background, inform the user first.',
      '- Always include timeout in milliseconds for commands that may take time.',
      '',
      'PROHIBITED — NEVER do this:',
      '  <toolcall><invoke name="run_command"><args>{"command":"ls"}</args></invoke></toolcall>',
      '  <invoke name="run_command"><args>...',
      '  ```json\n{"type":"tool",...}\n```',
      '  "I will run the command..." followed by the JSON',
      '  Explanations before or after the JSON',
      '',
      'WORKFLOW:',
      '  tool call → TOOL_RESULT → (comment + tool call in one message) → TOOL_RESULT → ... → {"type":"final","content":"..."}',
      '  ALWAYS end with final. NEVER leave the conversation without a final answer.',
      '  Comments go in the SAME message as your next action, separated by newline.',
      '',
      'Your response MUST BE ONLY JSON object(s). No <>, no ```, no text outside JSON.',
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
      '  when you have doubts about which framework, library, or tool to use',
      '  when you are unsure about something and need confirmation',
      '  RULE: ALWAYS ask the user when you have doubts, never assume.',
      '  IMPORTANT: AFTER receiving the answer from ask_user, ALWAYS generate a complete response to the user with the requested information. NEVER stop after ask_user.',
      '',
      'RULE: If you need current data or user system data → ACTION.',
      'If you can answer from memory → INFORMATION.',
      'If you need the user to decide something → ask_user.',
      'If the user asks you to remember something → memory save.',
      '',
      'SAVE TO MEMORY = use memory save (type="tool"):',
      '  when you find a bug or error in the user\'s code',
      '  when you discover important information about the project or user preferences',
      '  when the user tells you something personal or relevant about their work',
      '  when you learn something that will help you assist the user better in the future',
      '  RULE: ALWAYS save to memory when you find something worth remembering. Don\'t wait for the user to ask.',
      '',
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
    mcpToolsPrompt,
    pluginToolsPrompt,
    (() => {
      let mcpServersSection = '';
      try {
        const { MCP_CONFIG_FILE } = require('../config');
        const mcpConfigPath = MCP_CONFIG_FILE;
        const mcpConfig = JSON.parse(fs.readFileSync(mcpConfigPath, 'utf8'));
        const connectedServers = Object.entries(mcpConfig.servers || {}).filter(([, srv]) => srv.connected);
        if (connectedServers.length > 0) {
          const lines = connectedServers.map(([name, srv]) => {
            const toolNames = (srv.tools || []).map(t => t.name).join(', ');
            return `- ${name} (${srv.url})${toolNames ? ' — tools: ' + toolNames : ''}`;
          });
          mcpServersSection = '\nMCP SERVERS:\n' + lines.join('\n') + '\n';
        }
      } catch {}
      return mcpServersSection;
    })(),
    '# ENVIRONMENT',
    `- Working directory: ${cwd}`,
    `- System: ${platform}`,
    `- Date: ${date}`,
    `- Response language: ${languageLabel(language)}`,
    '',
    '# PROVIDERS',
    providerGroups,
  ];

  const mem = state.sessionMemory && typeof state.sessionMemory === 'object' ? state.sessionMemory : {};
  const memEntries = Object.entries(mem);
  if (memEntries.length > 0) {
    const memBlock = memEntries.map(([k, v]) => `${k}: ${v}`).join('\n');
    parts.push(
      '',
      '# YOUR MEMORY',
      'Use this information to personalize your responses. Update it with the memory tool when needed.',
      memBlock,
    );
  }

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

function stripCodeBlocks(text) {
  return text.replace(/```[\s\S]*?```/g, '');
}

function extractToolJson(text) {
  const clean = stripCodeBlocks(text);
  return scanJson(clean, obj =>
    obj?.type === 'tool' && KNOWN_TOOLS.has(obj.tool),
  );
}

function extractXmlTool(text) {
  const invokeMatch = text.match(
    /<invoke\s+name="([\w-]+)"\s*>\s*<args>\s*([\s\S]*?)\s*<\/args>\s*<\/invoke>/i,
  );
  if (invokeMatch) {
    const tool = normalizeToolName(invokeMatch[1]);
    if (KNOWN_TOOLS.has(tool)) {
      const rawArgs = invokeMatch[2].trim();
      if (!rawArgs) return { type: 'tool', tool, args: {} };
      try {
        const args = JSON.parse(rawArgs);
        return { type: 'tool', tool, args: args && typeof args === 'object' ? args : {} };
      } catch {
        const fuzzy = fuzzyExtractTool(`{"tool":"${tool}","args":${rawArgs}}`);
        if (fuzzy) return fuzzy;
        return { type: 'tool', tool, args: {} };
      }
    }
  }

  const toolcallMatch = text.match(
    /<toolcall>\s*<invoke\s+name="([\w-]+)"\s*>\s*<args>\s*([\s\S]*?)\s*<\/args>\s*<\/invoke>\s*<\/toolcall>/i,
  );
  if (toolcallMatch) {
    const tool = normalizeToolName(toolcallMatch[1]);
    if (KNOWN_TOOLS.has(tool)) {
      const rawArgs = toolcallMatch[2].trim();
      if (!rawArgs) return { type: 'tool', tool, args: {} };
      try {
        const args = JSON.parse(rawArgs);
        return { type: 'tool', tool, args: args && typeof args === 'object' ? args : {} };
      } catch {
        return { type: 'tool', tool, args: {} };
      }
    }
  }

  return null;
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
  const clean = stripCodeBlocks(text);
  const typeMatch = clean.match(/(?:["'])type(?:["'])\s*:\s*(?:["'])final(?:["'])/i);
  if (!typeMatch) return null;

  const contentMatch = clean.match(/(?:["'])content(?:["'])\s*:\s*(["'])/i);
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
  const clean = stripCodeBlocks(text);
  const toolMatch = clean.match(/(?:"|')?tool(?:"|')?\s*:\s*"(\w+)"/i);
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

  // Support multiple JSONs separated by newlines (comment + action)
  const comments = [];
  const multiMatch = text.match(/^\{.*?\}\s*\n\s*\{/s);
  if (multiMatch) {
    const parts = text.split(/\n(?=\{)/).map(s => s.trim()).filter(Boolean);
    for (let i = 0; i < parts.length - 1; i++) {
      try {
        const p = JSON.parse(parts[i]);
        if (p?.type === 'comment' && typeof p.content === 'string') {
          comments.push(p.content);
        }
      } catch {}
    }
    const last = parts[parts.length - 1];
    const result = parseSingleAgentResponse(last);
    if (result) {
      result._comments = comments;
      return result;
    }
  }

  const result = parseSingleAgentResponse(text);
  if (result) {
    result._comments = comments.length > 0 ? comments : undefined;
  }
  return result || { type: 'final', content: text || (raw ? String(raw).trim() : '') };
}

function parseSingleAgentResponse(text) {
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

  return null;
}

function sanitizeArgsForModel(parsed) {
  const args = { ...(parsed.args || {}) };
  if (typeof args.command === 'string' && args.command.length > 4000) {
    args.command = `${args.command.slice(0, 4000)} ...`;
  }
  return args;
}

function truncateHistory(state) {
  if (!Array.isArray(state.history) || state.history.length === 0) return;
  const totalChars = state.history.reduce((sum, m) => sum + (m.content?.length || 0), 0);
  const maxHistory = getSetting(state, 'maxHistoryChars');
  if (totalChars <= maxHistory) return;

  const keepRecent = getSetting(state, 'keepRecentMessages');
  const keep = Math.min(keepRecent, state.history.length);
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
  const lang = state.language || 'es';
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  if (state.memorySummary) {
    const memLabel = lang === 'es' ? 'Memoria resumida anterior' : 'Previous memory summary';
    messages.push({
      role: 'system',
      content: `${memLabel}:\n${state.memorySummary}`,
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
  const maxResultChars = MAX_OUTPUT_CHARS || 50000;
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
  const builtinNames = TOOL_DEFINITIONS.map(t => t.name);
  const mcpNames = getMcpToolDefsFromTools().map(t => t.name);
  let pluginNames = [];
  try { pluginNames = require('../plugins/index').getPluginToolDefinitions().map(t => t.name); } catch {}
  const toolNames = [...builtinNames, ...mcpNames, ...pluginNames].join(', ');
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

function getCompactPrompt(language) {
  const isEn = language === 'en';
  return [
    isEn
      ? 'Your task is to create a detailed summary of the conversation so far, paying close attention to the user\'s explicit requests and your previous actions.'
      : 'Tu tarea es crear un resumen detallado de la conversación hasta ahora, prestando mucha atención a las solicitudes explícitas del usuario y a tus acciones previas.',
    '',
    isEn
      ? 'This summary must be exhaustive in capturing technical details, code patterns, and architectural decisions that would be essential to continue development work without losing context.'
      : 'Este resumen debe ser exhaustivo al capturar detalles técnicos, patrones de código y decisiones arquitectónicas que serían esenciales para continuar el trabajo de desarrollo sin perder el contexto.',
    '',
    isEn
      ? 'Before providing your final summary, wrap your analysis in <analysis> tags to organize your thoughts and ensure you have covered all necessary points. In your analysis process:'
      : 'Antes de proporcionar tu resumen final, envuelve tu análisis en etiquetas <analysis> para organizar tus pensamientos y asegurarte de que has cubierto todos los puntos necesarios. En tu proceso de análisis:',
    '',
    '1. ' + (isEn
      ? 'Analyze each message and section of the conversation chronologically. For each section, thoroughly identify:'
      : 'Analiza cronológicamente cada mensaje y sección de la conversación. Para cada sección, identifica a fondo:'),
    '   ' + (isEn
      ? '- The user\'s explicit requests and intentions'
      : '- Las solicitudes e intenciones explícitas del usuario'),
    '   ' + (isEn
      ? '- Your approach to addressing the user\'s requests'
      : '- Tu enfoque para abordar las solicitudes del usuario'),
    '   ' + (isEn
      ? '- Key decisions, technical concepts, and code patterns'
      : '- Decisiones clave, conceptos técnicos y patrones de código'),
    '   ' + (isEn
      ? '- Specific details like filenames, complete code snippets, function signatures, file edits, etc.'
      : '- Detalles específicos como nombres de archivos, fragmentos de código completos, firmas de funciones, ediciones de archivos, etc.'),
    '2. ' + (isEn
      ? 'Double-check technical accuracy and completeness, thoroughly addressing each required element.'
      : 'Verifica dos veces la precisión y la integridad técnica, abordando a fondo cada elemento requerido.'),
    '',
    isEn
      ? 'Your summary MUST include the following sections:'
      : 'Tu resumen DEBE incluir las siguientes secciones:',
    '',
    '1. ' + (isEn
      ? 'Primary Request and Intention: Capture in detail all of the user\'s explicit requests and intentions.'
      : 'Solicitud e Intención Primaria: Captura en detalle todas las solicitudes e intenciones explícitas del usuario'),
    '2. ' + (isEn
      ? 'Key Technical Concepts: List all important technical concepts, technologies, and frameworks discussed.'
      : 'Conceptos Técnicos Clave: Enumera todos los conceptos técnicos, tecnologías y marcos importantes discutidos.'),
    '3. ' + (isEn
      ? 'Files and Code Sections: List specific files and code sections examined, modified, or created. Pay special attention to the most recent messages and include complete code snippets when applicable. Include a summary of why this file read or edit is important.'
      : 'Archivos y Secciones de Código: Enumera archivos específicos y secciones de código examinadas, modificadas o creadas. Presta especial atención a los mensajes más recientes e incluye fragmentos de código completos cuando sea aplicable e incluye un resumen de por qué esta lectura o edición de archivo es importante.'),
    '4. ' + (isEn
      ? 'Problem Resolution: Document resolved issues and any ongoing troubleshooting efforts.'
      : 'Resolución de Problemas: Documenta los problemas resueltos y cualquier esfuerzo de solución de problemas en curso.'),
    '5. ' + (isEn
      ? 'Pending Tasks: Describe any pending tasks you have been explicitly asked to work on.'
      : 'Tareas Pendientes: Describe cualquier tarea pendiente en la que se te haya pedido explícitamente que trabajes.'),
    '6. ' + (isEn
      ? 'Current Work: Describe in detail precisely what was being worked on immediately before this summary request, paying special attention to the most recent messages from both the user and assistant. Include filenames and code snippets when applicable.'
      : 'Trabajo Actual: Describe en detalle precisamente en qué se estaba trabajando inmediatamente antes de esta solicitud de resumen, prestando especial atención a los mensajes más recientes tanto del usuario como del asistente. Incluye nombres de archivos y fragmentos de código cuando sea aplicable.'),
    '7. ' + (isEn
      ? 'Optional Next Step: List the next step you will take that is related to the most recent work you were doing. IMPORTANT: ensure this step is DIRECTLY aligned with the user\'s explicit requests and the task you were working on immediately before this summary request. If your last task was concluded, then only list next steps if they are explicitly aligned with the user\'s request. Do not start tangential requests without first confirming with the user.'
      : 'Próximo Paso Opcional: Enumera el próximo paso que tomarás que esté relacionado con el trabajo más reciente que estabas haciendo. IMPORTANTE: asegúrate de que este paso esté DIRECTAMENTE en línea con las solicitudes explícitas del usuario y la tarea en la que estabas trabajando inmediatamente antes de esta solicitud de resumen. Si tu última tarea fue concluida, entonces solo enumera los próximos pasos si están explícitamente en línea con la solicitud de los usuarios. No comiences con solicitudes tangenciales sin confirmar primero con el usuario.'),
    '8. ' + (isEn
      ? 'If there is a next step, include direct quotes from the most recent conversation showing exactly what task you were working on and where you left off. This must be verbatim to ensure no deviation in task interpretation.'
      : 'Si hay un próximo paso, incluye citas directas de la conversación más reciente que muestren exactamente en qué tarea estabas trabajando y dónde te quedaste. Esto debe ser textual para asegurar que no haya desviaciones en la interpretación de la tarea.'),
    '',
    isEn
      ? 'Output ONLY the <analysis> and <summary> sections. Use these exact tags:'
      : 'Genera SOLO las secciones <analisis> y <resumen>. Usa estas etiquetas exactas:',
    '',
    isEn ? '<analysis>' : '<analisis>',
    isEn
      ? '[Your thought process, ensuring all points are thoroughly and accurately covered]'
      : '[Tu proceso de pensamiento, asegurando que todos los puntos estén cubiertos a fondo y con precisión]',
    isEn ? '</analysis>' : '</analisis>',
    '',
    isEn ? '<summary>' : '<resumen>',
    '1. ' + (isEn ? 'Primary Request and Intention:' : 'Solicitud e Intención Primaria:'),
    isEn ? '   [Detailed description]' : '   [Descripción detallada]',
    '',
    '2. ' + (isEn ? 'Key Technical Concepts:' : 'Conceptos Técnicos Clave:'),
    '   - [Concept 1]',
    '   - [Concept 2]',
    '',
    '3. ' + (isEn ? 'Files and Code Sections:' : 'Archivos y Secciones de Código:'),
    '   - [Filename 1]',
    '   ' + (isEn ? '  - [Summary of why this file is important]' : '  - [Resumen de por qué este archivo es importante]'),
    '   ' + (isEn ? '  - [Summary of changes made, if any]' : '  - [Resumen de los cambios realizados, si los hay]'),
    '   ' + (isEn ? '  - [Important Code Snippet]' : '  - [Fragmento de Código Importante]'),
    '',
    '4. ' + (isEn ? 'Problem Resolution:' : 'Resolución de Problemas:'),
    isEn ? '   [Description of resolved issues and ongoing troubleshooting]' : '   [Descripción de los problemas resueltos y la solución de problemas en curso]',
    '',
    '5. ' + (isEn ? 'Pending Tasks:' : 'Tareas Pendientes:'),
    '   - [Task 1]',
    '   - [Task 2]',
    '',
    '6. ' + (isEn ? 'Current Work:' : 'Trabajo Actual:'),
    isEn ? '   [Precise description of current work]' : '   [Descripción precisa del trabajo actual]',
    '',
    '7. ' + (isEn ? 'Optional Next Step:' : 'Próximo Paso Opcional:'),
    isEn ? '   [Optional next step to take]' : '   [Próximo paso opcional a tomar]',
    '',
    isEn ? '</summary>' : '</resumen>',
  ].join('\n');
}

module.exports = {
  KNOWN_TOOLS,
  buildConversationMessages,
  buildSystemPrompt,
  buildToolErrorMessage,
  buildToolResultMessage,
  getCompactPrompt,
  parseAgentResponse,
  sanitizeArgsForModel,
  truncateHistory,
};
