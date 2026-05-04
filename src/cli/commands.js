const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const fsp = fs.promises;
const { listSkills, SKILLS_DIR } = require('../core/skills');
const { DEFAULT_LANGUAGE, DEFAULT_MODEL_KEY, MODELS, listProvidersFromModels } = require('../config');
const { languageLabel, normalizeLanguage, t } = require('../i18n');
const { createNewSessionState, listSessions, loadSessionState, saveState } = require('../utils/sessionStorage');
const { listGitSecrets, removeGitSecret, upsertGitSecret } = require('../utils/secretStorage');
const { exportTranscriptText, formatTranscriptPreview } = require('../utils/transcriptStorage');
const { resolveInputPath } = require('../utils/pathUtils');
const { printTools } = require('../tools');

const SLASH_COMMANDS = [
  { name: 'help', desc: 'full help' },
  { name: 'status', desc: 'current status' },
  { name: 'history', desc: 'recent actions' },
  { name: 'memory', desc: 'memory summary' },
  { name: 'session', desc: 'current session' },
  { name: 'sessions', desc: 'list sessions' },
  { name: 'new', desc: 'new session' },
  { name: 'resume', desc: 'resume session' },
  { name: 'title', desc: 'rename session' },
  { name: 'model', desc: 'view/change model' },
  { name: 'models', desc: 'list models' },
  { name: 'providers', desc: 'list providers' },
  { name: 'git', desc: 'configure git credentials' },
  { name: 'persona', desc: 'set response tone/personality' },
  { name: 'lang', desc: 'change language' },
  { name: 'language', desc: 'change language' },
  { name: 'auto', desc: 'auto-approval' },
  { name: 'concuerdo', desc: 'group model mode' },
  { name: 'tools', desc: 'tools' },
  { name: 'skills', desc: 'agent skills' },
  { name: 'config', desc: 'view/change session settings' },
  { name: 'web', desc: 'open web version' },
  { name: 'stop', desc: 'stop agent' },
  { name: 'abort', desc: 'stop agent' },
  { name: 'reset', desc: 'reset context' },
  { name: 'cwd', desc: 'working directory' },
  { name: 'transcript', desc: 'view transcript' },
  { name: 'export', desc: 'export to txt' },
  { name: 'exit', desc: 'exit' },
];

function parseSlashCommand(input) {
  const trimmed = String(input || '').trim();
  if (!trimmed.startsWith('/')) return null;
  const withoutSlash = trimmed.slice(1);
  const spaceIndex = withoutSlash.indexOf(' ');
  if (spaceIndex === -1) return { commandName: withoutSlash, args: '' };
  return { commandName: withoutSlash.slice(0, spaceIndex), args: withoutSlash.slice(spaceIndex + 1).trim() };
}

function printHelp(state = {}) {
  const { paint } = require('./print');
  const lang = normalizeLanguage(state.language || DEFAULT_LANGUAGE);
  const m = (value) => paint(value, 'dim');
  const providers = listProvidersFromModels(MODELS);

  console.log('');
  console.log(`  ${paint('◆', 'cyan')} ${paint('Zyn', 'cyan')} ${m(t(lang, 'helpTitle'))}`);
  console.log('');
  console.log(`  ${m(t(lang, 'usage'))}`);
  console.log(`    zyn                ${m(t(lang, 'interactiveMode'))}`);
  console.log(`    zyn 'question'     ${m(t(lang, 'singlePrompt'))}`);
  console.log(`    zyn --new          ${m(t(lang, 'newSession'))}`);
  console.log(`    zyn --resume ID    ${m(t(lang, 'resumeSession'))}`);
  console.log('');
  console.log(`  ${m(t(lang, 'commands'))}`);
  for (const cmd of SLASH_COMMANDS) {
    console.log(`    /${cmd.name.padEnd(14)} ${m(cmd.desc)}`);
  }
  console.log('');
  console.log(`  /config lang en|es   ${m('change session language')}`);
  console.log(`  /config model KEY    ${m('change active model')}`);
  console.log(`  /config show         ${m('show current config')}`);
  console.log('');
  console.log(`  ${m(t(lang, 'escTwice'))}`);
  console.log(`    ${m(t(lang, 'escTwiceDesc'))}`);
  console.log('');
  console.log(`  ${m(t(lang, 'providers'))}`);
  for (const provider of providers) {
    console.log(`    ${provider.key}  ${provider.models.map(model => model.label).join(', ')}`);
  }
  console.log('');
  console.log(`  ${m(t(lang, 'chooseLanguage'))}`);
  console.log('');
}

function printModels() {
  const providers = listProvidersFromModels(MODELS);
  for (const provider of providers) {
    console.log(`\n  ${provider.key}`);
    for (const model of provider.models) {
      const active = model.key === (global.__zynActiveModel || DEFAULT_MODEL_KEY) ? ' ◀' : '';
      console.log(`    ${model.key.padEnd(16)} ${model.label}${active}`);
    }
  }
  console.log('');
}

function printConfig(state) {
  const key = state.activeModel || DEFAULT_MODEL_KEY;
  const model = MODELS[key];
  const provider = model?.provider || 'unknown';

  console.log('');
  console.log(`  Language : ${languageLabel(normalizeLanguage(state.language))} (${normalizeLanguage(state.language)})`);
  console.log(`  Model    : ${key} (${model?.label || '?'})`);
  console.log(`  Provider : ${provider}`);
  console.log(`  Auto     : ${state.autoApprove ? 'on' : 'off'}`);
  console.log(`  Group    : ${state.concuerdo ? 'on' : 'off'}`);
  console.log(`  CWD      : ${state.cwd}`);
  console.log('');
  console.log('  Commands:');
  console.log('    /config lang en|es');
  console.log('    /config model <key>');
  console.log('    /config auto on|off');
  console.log('    /config group on|off');
  console.log('    /config cwd <path>');
  console.log('');
}

async function startWebVersion() {
  const serverPath = path.join(__dirname, '..', 'web', 'server.js');
  const child = spawn(process.execPath, [serverPath], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();
  return 'http://127.0.0.1:3000';
}

async function handleLocalCommand(input, state, deps) {
  const parsed = parseSlashCommand(input);
  if (!parsed) return false;

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
    printHelp(state);
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
    renderSessions(await listSessions(), state.language);
    return true;
  }

  if (commandName === 'lang' || commandName === 'language') {
    if (!args) {
      console.log(`${t(state.language, 'langCurrent')}: ${languageLabel(state.language)}`);
      return true;
    }

    const nextLanguage = normalizeLanguage(args);
    if (!['en', 'es'].includes(nextLanguage)) {
      throw new Error(t(state.language, 'langInvalid'));
    }

    state.language = nextLanguage;
    await saveState(state);
    console.log(`${t(state.language, 'langChanged')}: ${languageLabel(nextLanguage)} (${nextLanguage})`);
    return true;
  }

  if (commandName === 'git') {
    const [sub, ...rest] = args.split(' ').filter(Boolean);
    if (!sub || sub === 'help') {
      console.log('Uso: /git list | /git set <provider> <token> [username] | /git remove <provider>');
      return true;
    }
    if (sub === 'list') {
      const secrets = listGitSecrets();
      if (!secrets.length) console.log('No hay credenciales git guardadas.');
      else secrets.forEach(s => console.log(`${s.key}  user:${s.username || '-'}  api:${s.apiBaseUrl || '-'}`));
      return true;
    }
    if (sub === 'set') {
      const [provider, token, username] = rest;
      if (!provider || !token) throw new Error('Uso: /git set <provider> <token> [username]');
      upsertGitSecret(provider, { provider, token, username });
      console.log(`Credencial guardada para ${provider}`);
      return true;
    }
    if (sub === 'remove') {
      const [provider] = rest;
      if (!provider) throw new Error('Uso: /git remove <provider>');
      const removed = removeGitSecret(provider);
      console.log(removed ? `Credencial eliminada: ${provider}` : `No existe credencial para ${provider}`);
      return true;
    }
    throw new Error('Subcomando git no reconocido. Usa /git help');
  }

  if (commandName === 'persona') {
    const [sub, ...rest] = args.split(' ');
    if (!sub || sub === 'show') {
      console.log(state.personaPrompt ? `Persona activa:\n${state.personaPrompt}` : 'Persona por defecto activa.');
      return true;
    }
    if (sub === 'reset' || sub === 'default') {
      state.personaPrompt = '';
      await saveState(state);
      console.log('Persona restaurada al estado por defecto.');
      return true;
    }
    if (sub === 'set') {
      const text = rest.join(' ').trim();
      if (!text) throw new Error('Uso: /persona set <descripcion>');
      state.personaPrompt = text;
      await saveState(state);
      console.log('Persona actualizada (solo estilo).');
      return true;
    }
    throw new Error('Uso: /persona show | /persona set <texto> | /persona reset');
  }

  if (commandName === 'new') {
    const nextState = await createNewSessionState(state.rl);
    applyLoadedState(state, nextState);
    if (typeof state.clearQueuedMessages === 'function') state.clearQueuedMessages();
    global.__zynActiveModel = state.activeModel || DEFAULT_MODEL_KEY;
    printBanner(state);
    console.log(`${t(state.language, 'newSessionCreated')}: ${state.sessionId}`);
    return true;
  }

  if (commandName === 'resume') {
    const sessionId = args.trim();
    if (!sessionId) {
      throw new Error(t(state.language, 'missingSessionId'));
    }

    const loaded = await loadSessionState(sessionId, state.rl);
    if (!loaded) {
      throw new Error(t(state.language, 'sessionNotFound'));
    }

    applyLoadedState(state, loaded);
    if (typeof state.clearQueuedMessages === 'function') state.clearQueuedMessages();
    global.__zynActiveModel = state.activeModel || DEFAULT_MODEL_KEY;
    await saveState(state);
    printBanner(state);
    console.log(`${t(state.language, 'sessionResumed')}: ${state.sessionId}`);
    return true;
  }

  if (commandName === 'title' || commandName === 'rename') {
    if (!args) {
      throw new Error(t(state.language, 'missingTitle'));
    }

    state.title = args;
    await saveState(state);
    await appendTranscriptEntry(state.sessionId, {
      type: 'system',
      content: `Title updated: ${args}`,
    });
    console.log(`Title updated: ${state.title}`);
    return true;
  }

  if (commandName === 'config') {
    if (!args || args === 'show') {
      printConfig(state);
      return true;
    }

    const [sub, ...rest] = args.split(/\s+/);
    const value = rest.join(' ').trim();

    if (sub === 'lang' || sub === 'language') {
      const nextLanguage = normalizeLanguage(value);
      if (!['en', 'es'].includes(nextLanguage)) {
        throw new Error(t(state.language, 'langInvalid'));
      }
      state.language = nextLanguage;
      await saveState(state);
      console.log(`${t(state.language, 'langChanged')}: ${languageLabel(nextLanguage)} (${nextLanguage})`);
      return true;
    }

    if (sub === 'model') {
      const key = value.toLowerCase().trim();
      if (!MODELS[key]) {
        const available = Object.keys(MODELS).join(', ');
        throw new Error(`${t(state.language, 'modelInvalid')}: ${available}`);
      }
      state.activeModel = key;
      global.__zynActiveModel = key;
      await saveState(state);
      await appendTranscriptEntry(state.sessionId, {
        type: 'system',
        content: `Model switched to: ${MODELS[key].label}`,
      });
      console.log(`Model: ${MODELS[key].label}`);
      return true;
    }

    if (sub === 'auto') {
      if (value !== 'on' && value !== 'off') {
        throw new Error('Use /config auto on|off');
      }
      state.autoApprove = value === 'on';
      await saveState(state);
      console.log(state.autoApprove ? 'Auto approval enabled.' : 'Auto approval disabled.');
      return true;
    }

    if (sub === 'group' || sub === 'concuerdo') {
      if (value !== 'on' && value !== 'off') {
        throw new Error('Use /config group on|off');
      }
      state.concuerdo = value === 'on';
      await saveState(state);
      console.log(state.concuerdo ? 'Group mode enabled.' : 'Group mode disabled.');
      return true;
    }

    if (sub === 'cwd' || sub === 'pwd') {
      if (!value) {
        throw new Error(t(state.language, 'missingPath'));
      }
      const resolved = resolveInputPath(value, state.cwd);
      const stats = await fsp.stat(resolved).catch(() => null);
      if (!stats?.isDirectory()) {
        throw new Error(t(state.language, 'noDirectory'));
      }
      state.cwd = resolved;
      await saveState(state);
      console.log(state.cwd);
      return true;
    }

    throw new Error('Use /config show|lang|model|auto|group|cwd');
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
      throw new Error(`${t(state.language, 'modelInvalid')}: ${available}`);
    }

    state.activeModel = key;
    global.__zynActiveModel = key;
    await saveState(state);
    await appendTranscriptEntry(state.sessionId, {
      type: 'system',
      content: `Model switched to: ${MODELS[key].label}`,
    });
    console.log(`Model: ${MODELS[key].label}`);
    return true;
  }

  if (commandName === 'models') {
    printModels();
    return true;
  }

  if (commandName === 'providers') {
    const providers = listProvidersFromModels(MODELS);
    console.log('');
    for (const provider of providers) {
      console.log(`  ${provider.key}`);
      for (const model of provider.models) {
        console.log(`    ${model.key.padEnd(16)} ${model.label}`);
      }
    }
    console.log('');
    return true;
  }

  if (commandName === 'auto') {
    if (!args) {
      console.log(state.autoApprove ? 'auto: on' : 'auto: off');
      return true;
    }

    if (args !== 'on' && args !== 'off') {
      throw new Error('Use /auto on or /auto off');
    }

    state.autoApprove = args === 'on';
    await saveState(state);
    await appendTranscriptEntry(state.sessionId, {
      type: 'system',
      content: `Auto approve: ${state.autoApprove ? 'on' : 'off'}`,
    });
    console.log(state.autoApprove ? 'Auto approval enabled.' : 'Auto approval disabled.');
    return true;
  }

  if (commandName === 'concuerdo') {
    state.concuerdo = !state.concuerdo;
    await saveState(state);
    const activeKey = state.activeModel || DEFAULT_MODEL_KEY;
    const allLabels = Object.keys(MODELS).map(k => MODELS[k].label);
    await appendTranscriptEntry(state.sessionId, {
      type: 'system',
      content: `Group mode: ${state.concuerdo ? 'on' : 'off'}`,
    });
    if (state.concuerdo) {
      console.log(`Group mode enabled — ${allLabels.join(' + ')} work together.`);
      console.log(`  Primary: ${MODELS[activeKey]?.label || activeKey}`);
    } else {
      console.log('Group mode disabled.');
    }
    return true;
  }

  if (commandName === 'web') {
    const url = await startWebVersion();
    console.log(`Web version started at ${url}`);
    return true;
  }

  if (commandName === 'stop' || commandName === 'abort') {
    if (typeof state.abortCurrentTurn === 'function') {
      state.abortCurrentTurn();
      console.log('Agent stopped.');
    } else {
      console.log(t(state.language, 'noActiveTurn'));
    }
    return true;
  }

  if (commandName === 'tools') {
    printTools();
    return true;
  }

  if (commandName === 'skills') {
    const skills = listSkills();
    console.log(`\n  ${t(state.language, 'skillsLoaded')} (${skills.length}):\n`);
    for (const s of skills) {
      console.log(`    \x1b[36m${s.name.padEnd(14)}\x1b[0m ${s.title}`);
    }
    console.log(`\n  Directory: \x1b[90m${SKILLS_DIR}\x1b[0m`);
    console.log('  Edit or add .md files to customize the agent.\n');
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
      content: 'Context reset',
    });
    console.log('Context reset.');
    return true;
  }

  if (commandName === 'cwd' || commandName === 'pwd') {
    if (!args) {
      console.log(state.cwd);
      return true;
    }

    const resolved = resolveInputPath(args, state.cwd);
    const stats = await fsp.stat(resolved).catch(() => null);
    if (!stats?.isDirectory()) {
      throw new Error(t(state.language, 'noDirectory'));
    }

    state.cwd = resolved;
    await saveState(state);
    await appendTranscriptEntry(state.sessionId, {
      type: 'system',
      content: `Directory changed to ${resolved}`,
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
    console.log(`Transcript exported to: ${exported}`);
    return true;
  }

  return false;
}

module.exports = {
  SLASH_COMMANDS,
  handleLocalCommand,
  parseSlashCommand,
  printHelp,
};
