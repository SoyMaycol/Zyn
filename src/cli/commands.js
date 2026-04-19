const fs = require('fs');

const fsp = fs.promises;
const { listSkills, SKILLS_DIR } = require('../core/skills');

const {
  DEFAULT_MODEL_KEY,
  MODELS,
} = require('../config');
const {
  createNewSessionState,
  listSessions,
  loadSessionState,
  saveState,
} = require('../utils/sessionStorage');
const {
  exportTranscriptText,
  formatTranscriptPreview,
} = require('../utils/transcriptStorage');
const { resolveInputPath } = require('../utils/pathUtils');
const { printTools } = require('../tools');

function parseSlashCommand(input) {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) {
    return null;
  }

  const withoutSlash = trimmed.slice(1);
  const spaceIndex = withoutSlash.indexOf(' ');

  if (spaceIndex === -1) {
    return {
      commandName: withoutSlash,
      args: '',
    };
  }

  return {
    commandName: withoutSlash.slice(0, spaceIndex),
    args: withoutSlash.slice(spaceIndex + 1).trim(),
  };
}

function printHelp() {
  const { paint } = require('./print');
  const m = (t) => paint(t, 'dim');

  console.log('');
  console.log(`  ${paint('◆', 'cyan')} ${paint('Adonix', 'cyan')} ${m('— Ayuda')}`);
  console.log('');
  console.log(`  ${m('Uso')}`);
  console.log(`    adonix              ${m('modo interactivo')}`);
  console.log(`    adonix 'pregunta'   ${m('consulta unica')}`);
  console.log(`    adonix --new        ${m('nueva sesion')}`);
  console.log(`    adonix --resume ID  ${m('reanudar sesion')}`);
  console.log('');
  console.log(`  ${m('Comandos')}`);
  console.log(`    /help        ${m('ayuda')}`);
  console.log(`    /status      ${m('estado actual')}`);
  console.log(`    /history     ${m('acciones recientes')}`);
  console.log(`    /memory      ${m('memoria resumida')}`);
  console.log(`    /session     ${m('sesion actual')}`);
  console.log(`    /sessions    ${m('listar sesiones')}`);
  console.log(`    /resume X    ${m('reanudar sesion')}`);
  console.log(`    /new         ${m('nueva sesion')}`);
  console.log(`    /title X     ${m('renombrar')}`);
  console.log(`    /transcript  ${m('ver transcript')}`);
  console.log(`    /export [X]  ${m('exportar a txt')}`);
  console.log(`    /auto [X]    ${m('auto-aprobacion')}`);
  console.log(`    /model [X]   ${m('ver/cambiar modelo')}`);
  console.log(`    /reset       ${m('reiniciar contexto')}`);
  console.log(`    /cwd [X]     ${m('directorio')}`);
  console.log(`    /tools       ${m('herramientas')}`);
  console.log(`    /skills      ${m('skills del agente')}`);
  console.log(`    /exit        ${m('salir')}`);
  console.log('');
}

async function handleLocalCommand(input, state, deps) {
  const parsed = parseSlashCommand(input);
  if (!parsed) {
    return false;
  }

  const { commandName, args } = parsed;
  const {
    applyLoadedState,
    appendTranscriptEntry,
    printBanner,
    printHistory,
    printMemory,
    printSession,
    printSessions: renderSessions,
    printStatus,
  } = deps;

  if (commandName === 'help') {
    printHelp();
    return true;
  }

  if (commandName === 'status') {
    printStatus(state);
    return true;
  }

  if (commandName === 'history') {
    printHistory(state);
    return true;
  }

  if (commandName === 'memory' || commandName === 'summary') {
    printMemory(state);
    return true;
  }

  if (commandName === 'session') {
    printSession(state);
    return true;
  }

  if (commandName === 'sessions') {
    renderSessions(await listSessions());
    return true;
  }

  if (commandName === 'new') {
    const nextState = await createNewSessionState(state.rl);
    applyLoadedState(state, nextState);
    printBanner(state);
    console.log(`Nueva sesion: ${state.sessionId}`);
    return true;
  }

  if (commandName === 'resume') {
    const sessionId = args.trim();
    if (!sessionId) {
      throw new Error('Falta el id de sesion');
    }

    const loaded = await loadSessionState(sessionId, state.rl);
    if (!loaded) {
      throw new Error('No encontre esa sesion');
    }

    applyLoadedState(state, loaded);
    await saveState(state);
    printBanner(state);
    console.log(`Sesion reanudada: ${state.sessionId}`);
    return true;
  }

  if (commandName === 'title' || commandName === 'rename') {
    if (!args) {
      throw new Error('Falta el nuevo titulo');
    }

    state.title = args;
    await saveState(state);
    await appendTranscriptEntry(state.sessionId, {
      type: 'system',
      content: `Titulo actualizado: ${args}`,
    });
    console.log(`Titulo actualizado: ${state.title}`);
    return true;
  }

  if (commandName === 'model') {
    if (!args) {
      const key = state.activeModel || DEFAULT_MODEL_KEY;
      const info = MODELS[key];
      console.log(`${key} (${info?.label || '?'})`);
      return true;
    }

    const key = args.toLowerCase().trim();
    if (!MODELS[key]) {
      const available = Object.keys(MODELS).join(', ');
      throw new Error(`Modelo no valido. Disponibles: ${available}`);
    }

    state.activeModel = key;
    await saveState(state);
    await appendTranscriptEntry(state.sessionId, {
      type: 'system',
      content: `Modelo cambiado a: ${MODELS[key].label}`,
    });
    console.log(`Modelo: ${MODELS[key].label}`);
    return true;
  }

  if (commandName === 'models') {
    for (const [key, info] of Object.entries(MODELS)) {
      const active = key === (state.activeModel || DEFAULT_MODEL_KEY) ? ' ◀' : '';
      console.log(`  ${key}  ${info.label}${active}`);
    }
    return true;
  }

  if (commandName === 'auto') {
    if (!args) {
      console.log(state.autoApprove ? 'auto: on' : 'auto: off');
      return true;
    }

    if (args !== 'on' && args !== 'off') {
      throw new Error('Usa /auto on o /auto off');
    }

    state.autoApprove = args === 'on';
    await saveState(state);
    await appendTranscriptEntry(state.sessionId, {
      type: 'system',
      content: `Auto approve: ${state.autoApprove ? 'on' : 'off'}`,
    });
    console.log(state.autoApprove ? 'Auto approve activado.' : 'Auto approve desactivado.');
    return true;
  }

  if (commandName === 'tools') {
    printTools();
    return true;
  }

  if (commandName === 'skills') {
    const skills = listSkills();
    console.log(`\n  Skills cargadas (${skills.length}):\n`);
    for (const s of skills) {
      console.log(`    \x1b[36m${s.name.padEnd(14)}\x1b[0m ${s.title}`);
    }
    console.log(`\n  Directorio: \x1b[90m${SKILLS_DIR}\x1b[0m`);
    console.log('  Edita o agrega archivos .md para personalizar el agente.\n');
    return true;
  }

  if (commandName === 'reset' || commandName === 'clear') {
    state.history = [];
    state.actionLog = [];
    state.turnCount = 0;
    state.memorySummary = '';
    await saveState(state);
    await appendTranscriptEntry(state.sessionId, {
      type: 'system',
      content: 'Contexto reiniciado',
    });
    console.log('Contexto reiniciado.');
    return true;
  }

  if (commandName === 'cwd' || commandName === 'pwd') {
    if (!args) {
      console.log(state.cwd);
      return true;
    }

    const resolved = resolveInputPath(args, state.cwd);
    const stats = await fsp.stat(resolved);

    if (!stats.isDirectory()) {
      throw new Error('La ruta no es un directorio');
    }

    state.cwd = resolved;
    await saveState(state);
    await appendTranscriptEntry(state.sessionId, {
      type: 'system',
      content: `Directorio cambiado a ${resolved}`,
    });
    console.log(state.cwd);
    return true;
  }

  if (commandName === 'transcript') {
    console.log(await formatTranscriptPreview(state.sessionId));
    return true;
  }

  if (commandName === 'export') {
    const outputPath = args ? resolveInputPath(args, state.cwd) : '';
    const exported = await exportTranscriptText(state.sessionId, outputPath);
    console.log(`Transcript exportado en: ${exported}`);
    return true;
  }

  return false;
}

module.exports = {
  handleLocalCommand,
  parseSlashCommand,
  printHelp,
};
