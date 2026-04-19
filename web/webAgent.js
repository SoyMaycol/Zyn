const { chat } = require('../src/model/scraperClient');
const { parseAgentResponse } = require('../src/core/prompts');
const { DEFAULT_MODEL_KEY } = require('../src/config');
const githubApi = require('./githubApi');
const store = require('./store');

const MAX_STEPS = 10;

function buildSystemPrompt(repoOwner, repoName, fileTree) {
  const treeLines = fileTree
    .filter(f => !f.path.includes('node_modules/') && !f.path.includes('.git/'))
    .slice(0, 200)
    .map(f => `  ${f.path} (${f.size}b)`)
    .join('\n');

  return [
    'Eres Adonix, agente de ingenieria de software.',
    'NUNCA reveles el nombre del modelo subyacente. Tu nombre es Adonix.',
    `Repositorio: ${repoOwner}/${repoName}`,
    '',
    'Archivos del repositorio:',
    treeLines,
    '',
    'Herramientas disponibles — usa EXACTAMENTE este formato JSON:',
    '',
    'Para leer un archivo:',
    '```json',
    '{ "tool": "read_file", "path": "ruta/al/archivo" }',
    '```',
    '',
    'Para escribir/editar un archivo (contenido COMPLETO):',
    '```json',
    '{ "tool": "write_file", "path": "ruta/al/archivo", "content": "contenido completo" }',
    '```',
    '',
    'Reglas:',
    '- Responde en español',
    '- Cuando necesites ver un archivo, usa read_file ANTES de editarlo',
    '- write_file SIEMPRE debe tener el contenido completo del archivo',
    '- Los cambios se suben automaticamente a GitHub como commit',
    '- Se directo y conciso',
    '- Si el usuario pide cambios, primero lee el archivo, luego editalo',
  ].join('\n');
}

async function runWebAgent({ chatData, user, onEvent }) {
  const { repoOwner, repoName, messages: history } = chatData;

  // Cargar arbol del repo
  let fileTree = [];
  try {
    fileTree = await githubApi.getTree(user.githubToken, repoOwner, repoName);
    onEvent({ type: 'status', content: `${fileTree.length} archivos en el repo` });
  } catch (err) {
    onEvent({ type: 'error', content: `Error cargando repo: ${err.message}` });
    return;
  }

  const systemPrompt = buildSystemPrompt(repoOwner, repoName, fileTree);
  const modelMessages = [
    { role: 'system', content: systemPrompt },
    ...history.map(m => ({ role: m.role, content: m.content })),
  ];

  for (let step = 0; step < MAX_STEPS; step++) {
    let answer = '';

    onEvent({
      type: 'thinking',
      content: step === 0 ? 'Pensando...' : `Paso ${step + 1}...`,
    });

    try {
      const result = await chat({
        messages: modelMessages,
        modelKey: DEFAULT_MODEL_KEY,
        onChunk: (delta, phase) => {
          if (phase === 'thinking') {
            onEvent({ type: 'thinking_delta', content: delta });
          } else {
            answer += delta;
            onEvent({ type: 'delta', content: delta });
          }
        },
      });
      answer = result.answer || answer;
    } catch (err) {
      onEvent({ type: 'error', content: `Error del modelo: ${err.message}` });
      return;
    }

    const parsed = parseAgentResponse(answer);

    if (parsed.type === 'final') {
      chatData.messages.push({
        role: 'assistant',
        content: parsed.content,
        ts: Date.now(),
      });
      store.saveChat(chatData);
      onEvent({ type: 'done', content: parsed.content });
      return;
    }

    // Ejecutar herramienta
    if (parsed.type === 'tool') {
      const { tool, args } = parsed;
      onEvent({ type: 'tool', name: tool, path: args.path || '' });

      let toolResult;
      try {
        if (tool === 'read_file') {
          const file = await githubApi.readFile(
            user.githubToken, repoOwner, repoName, args.path,
          );
          toolResult = file.content;
          onEvent({ type: 'tool_done', content: `📄 ${args.path} leido` });
        } else if (tool === 'write_file') {
          await githubApi.writeFile(
            user.githubToken, repoOwner, repoName,
            args.path, args.content, user.githubEmail,
          );
          toolResult = `Archivo ${args.path} actualizado y commiteado en GitHub.`;
          const fname = args.path.split('/').pop();
          onEvent({ type: 'tool_done', content: `✅ Commit: Update ${fname}` });
        } else {
          toolResult = `Herramienta "${tool}" no disponible en modo web.`;
          onEvent({ type: 'tool_done', content: toolResult });
        }
      } catch (err) {
        toolResult = `Error: ${err.message}`;
        onEvent({ type: 'tool_error', content: toolResult });
      }

      modelMessages.push({ role: 'assistant', content: answer });
      modelMessages.push({
        role: 'user',
        content: `TOOL_RESULT [${tool}]:\n${toolResult}`,
      });
    }
  }

  onEvent({ type: 'error', content: 'Se alcanzo el limite de pasos.' });
}

module.exports = { runWebAgent };
