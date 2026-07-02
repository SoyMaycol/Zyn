const fs = require('fs');
const path = require('path');

const fsp = fs.promises;
const { DEFAULT_LANGUAGE, DEFAULT_MODEL_KEY, GEMINI_MODEL_WARNING, MODELS, listProvidersFromModels, countTokens } = require('../config');
const { languageLabel, normalizeLanguage, t } = require('../i18n');
const { createNewSessionState, listSessions, loadSessionState, saveState, listBackgroundResults, consumeBackgroundResult, enqueueBackgroundTask } = require('../utils/sessionStorage');
const { truncateHistory } = require('../core/prompts');
const { listGitSecrets, removeGitSecret, upsertGitSecret } = require('../utils/secretStorage');
const { clearGmailAuth, getGmailAuthStatus, startGmailOAuthFlow } = require('../utils/gmailAuth');
const { exportTranscriptText, formatTranscriptPreview } = require('../utils/transcriptStorage');
const { resolveInputPath } = require('../utils/pathUtils');
const { detachBackgroundTurn } = require('../utils/backgroundWorker');
const {
  describeProviderConfig,
  fetchProviderModels,
  getActiveModelsForProvider,
  listConfiguredProviders,
  maskSecret,
  removeProviderConfig,
  setProviderField,
  summarizeProviderConfig,
  syncProvider,
  unsetProviderField,
} = require('../providers/catalog');


function getModelWarning(key) {
  const model = MODELS[key];
  return model?.provider === 'gemini' ? GEMINI_MODEL_WARNING : '';
}

function printModelChanged(key) {
  const warning = getModelWarning(key);
  console.log(`Model: ${MODELS[key].label}`);
  if (warning) console.log(`Warning: ${warning}`);
}

function printLanguageChanged(language) {
  const normalized = normalizeLanguage(language);
  const label = languageLabel(normalized);
  console.log(normalized === 'es'
    ? `Actualizado al idioma ${label} (${normalized})`
    : `Updated to language ${label} (${normalized})`);
}


const SLASH_COMMANDS = [
  { name: 'help', desc: 'full help', descEs: 'ayuda completa' },
  { name: 'status', desc: 'current status', descEs: 'estado actual' },
  { name: 'history', desc: 'recent actions', descEs: 'acciones recientes' },
  { name: 'memory', desc: 'memory summary', descEs: 'resumen de memoria' },
  { name: 'summary', desc: 'memory summary', descEs: 'resumen de memoria' },
  { name: 'session', desc: 'current session', descEs: 'sesión actual' },
  { name: 'sessions', desc: 'list sessions', descEs: 'listar sesiones' },
  { name: 'new', desc: 'new session', descEs: 'nueva sesión' },
  { name: 'resume', desc: 'resume session', descEs: 'reanudar sesión' },
  { name: 'title', desc: 'rename session', descEs: 'renombrar sesión' },
  { name: 'rename', desc: 'rename session', descEs: 'renombrar sesión' },
  { name: 'models', desc: 'list models', descEs: 'listar modelos' },
  { name: 'providers', desc: 'list/select providers', descEs: 'listar/seleccionar proveedores' },
  { name: 'provider', desc: 'manage providers (sync, set, list, remove)', descEs: 'gestionar proveedores (sync, set, list, remove)' },
  { name: 'git', desc: 'configure git credentials', descEs: 'configurar credenciales git' },
  { name: 'gmail', desc: 'connect Gmail account', descEs: 'conectar cuenta Gmail' },
  { name: 'persona', desc: 'set response tone/personality', descEs: 'definir tono/persona' },
  { name: 'lang', desc: 'change language', descEs: 'cambiar idioma' },
  { name: 'language', desc: 'change language', descEs: 'cambiar idioma' },
  { name: 'auto', desc: 'auto-approval', descEs: 'auto-aprobación' },
  { name: 'config', desc: 'view/change session settings', descEs: 'ver/cambiar configuración' },
  { name: 'bg', desc: 'background: continue current turn in background', descEs: 'segundo plano: continuar el turno en background' },
  { name: 'undo', desc: 'undo last turn', descEs: 'deshacer último turno' },
  { name: 'redo', desc: 'redo last turn', descEs: 'rehacer último turno' },
  { name: 'stop', desc: 'stop agent', descEs: 'detener agente' },
  { name: 'abort', desc: 'stop agent', descEs: 'detener agente' },
  { name: 'reset', desc: 'reset context', descEs: 'reiniciar contexto' },
  { name: 'clear', desc: 'reset context', descEs: 'reiniciar contexto' },
  { name: 'cwd', desc: 'working directory', descEs: 'directorio de trabajo' },
  { name: 'compact', desc: 'compact memory', descEs: 'compactar memoria' },
  { name: 'theme', desc: 'UI theme', descEs: 'tema de la UI' },
  { name: 'transcript', desc: 'view transcript', descEs: 'ver transcripción' },
  { name: 'export', desc: 'export to txt', descEs: 'exportar a txt' },
  { name: 'exit', desc: 'exit', descEs: 'salir' },
  { name: 'quit', desc: 'exit', descEs: 'salir' },
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
  const b = (value) => paint(value, 'cyan');
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

  // Sessions
  console.log(`  ${paint('── Sessions ──', 'dim')}`);
  console.log(`    ${b('/help')}                        Show this help`);
  console.log(`    ${b('/status')}                      Show current status`);
  console.log(`    ${b('/history')}                     Recent actions (last 20)`);
  console.log(`    ${b('/memory')}                      Agent memory summary`);
  console.log(`    ${b('/summary')}                     Alias of /memory`);
  console.log(`    ${b('/session')}                     Current session info`);
  console.log(`    ${b('/sessions')}                    List all saved sessions`);
  console.log(`    ${b('/new')}                         Create a new session`);
  console.log(`    ${b('/resume <ID>')}                 Resume an existing session`);
  console.log(`    ${b('/title <text>')}                Rename current session`);
  console.log(`    ${b('/rename <text>')}               Alias of /title`);
  console.log('');

  // Configuration
  console.log(`  ${paint('── Configuration ──', 'dim')}`);
  console.log(`    ${b('/models')}                      Open model picker`);
  console.log(`    ${b('/providers')}                   Open provider picker`);
  console.log(`    ${b('/lang')}                        Show current language`);
  console.log(`    ${b('/lang <en|es>')}                Change language`);
  console.log(`    ${b('/language <en|es>')}            Alias of /lang`);
  console.log(`    ${b('/auto')}                        Show auto-approval status`);
  console.log(`    ${b('/auto on')}                     Enable auto-approval`);
  console.log(`    ${b('/auto off')}                    Disable auto-approval`);
  console.log(`    ${b('/persona set <text>')}          Set response persona/tone`);
  console.log(`    ${b('/persona show')}                Show active persona`);
  console.log(`    ${b('/persona reset')}               Reset to default persona`);
  console.log(`    ${b('/config show')}                 Show session config`);
  console.log(`    ${b('/config lang <en|es>')}         Change language from config`);
  console.log(`    ${b('/config model <key>')}          Change model from config`);
  console.log(`    ${b('/config auto on|off')}          Toggle auto from config`);
  console.log(`    ${b('/config cwd <path>')}           Change working dir from config`);
  console.log('');

  // Tools and Git
  console.log(`  ${paint('── Tools and Git ──', 'dim')}`);
  console.log(`    ${b('/git set <provider> <token>')}  Configure git credentials`);
  console.log(`    ${b('/git set <provider> <token> [user] [apiBaseUrl:URL] [cloneBaseUrl:URL] [name:X]')}`);
  console.log(`    ${b('/git list')}                    List configured git profiles`);
  console.log(`    ${b('/git remove <provider> [name]')} Remove git credentials`);
  console.log(`    ${b('/gmail connect')}               Connect Gmail with Google OAuth + PKCE`);
  console.log(`    ${b('/gmail status')}                Show Gmail connection status`);
  console.log(`    ${b('/gmail disconnect')}            Remove saved Gmail tokens`);
  console.log(`    ${b('/cwd')}                         Show current working directory`);
  console.log(`    ${b('/cwd <path>')}                  Change working directory`);
  console.log('');

  // Export and background
  console.log(`  ${paint('── Export and Background ──', 'dim')}`);
  console.log(`    ${b('/bg')}                          Detach current turn to a background worker`);
  console.log(`    ${b('/transcript')}                  View full session transcript`);
  console.log(`    ${b('/export')}                      Export session to txt`);
  console.log(`    ${b('/export <path>')}               Export session to specific path`);
  console.log('');

  // Control
  console.log(`  ${paint('── Control ──', 'dim')}`);
  console.log(`    ${b('/stop')}                        Stop current agent turn`);
  console.log(`    ${b('/abort')}                       Alias of /stop`);
  console.log(`    ${b('/reset')}                       Reset context (clear history)`);
  console.log(`    ${b('/clear')}                       Alias of /reset`);
  console.log(`    ${b('/exit')}                        Exit Zyn`);
  console.log(`    ${b('/quit')}                        Alias of /exit`);
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

function buildModelListItems() {
  const providers = listProvidersFromModels(MODELS);
  const items = [];
  for (const provider of providers) {
    for (const model of provider.models) {
      const isActive = model.key === (global.__zynActiveModel || DEFAULT_MODEL_KEY);
      items.push({
        key: model.key,
        label: `${model.key.padEnd(22)} ${model.label}`,
        provider: provider.key,
        active: isActive,
      });
    }
  }
  return items;
}

function buildProviderListItems() {
  const fromModels = listProvidersFromModels(MODELS);
  const configured = listConfiguredProviders();
  const configuredKeys = new Set(configured.map(p => p.provider));
  const modelKeys = new Set(fromModels.map(p => p.key));
  for (const p of configured) {
    if (!modelKeys.has(p.provider)) {
      fromModels.push({
        key: p.provider,
        label: p.provider,
        models: (p.models || []).map(m => typeof m === 'string' ? { key: m, label: m } : m),
      });
    }
  }
  return fromModels.map(p => ({
    key: p.key,
    label: `${p.key}  ${p.models.length} model${p.models.length === 1 ? '' : 's'}`,
    models: p.models,
  }));
}

async function runModelSelector(state, deps) {
  const items = buildModelListItems();
  if (items.length === 0) return null;
  const active = state.activeModel || DEFAULT_MODEL_KEY;
  const initialIndex = Math.max(0, items.findIndex(it => it.key === active));
  const choice = await deps.askSelect({
    title: state.language === 'es' ? 'Selecciona un modelo' : 'Select a model',
    subtitle: state.language === 'es' ? '↑/↓ navega · Enter elige · Esc cancela' : '↑/↓ move · Enter pick · Esc cancel',
    items,
    initialIndex: initialIndex >= 0 ? initialIndex : 0,
    getLabel: (item) => item.label,
    getValue: (item) => item.key,
    isActive: (item) => item.active,
  });
  return choice || null;
}

async function runProviderSelector(state, deps) {
  const items = buildProviderListItems();
  const addCustomKey = '__add_custom__';
  items.push({ key: addCustomKey, label: '', models: [] });
  const es = state?.language === 'es';
  const choice = await deps.askSelect({
    title: es ? 'Selecciona un proveedor' : 'Select a provider',
    subtitle: es ? '↑/↓ navega · Enter elige · Esc cancela' : '↑/↓ move · Enter pick · Esc cancel',
    items,
    getLabel: (item) => {
      if (item.key === addCustomKey) return '+ ' + (es ? 'Agregar proveedor personalizado' : 'Add custom provider');
      return item.label;
    },
    getValue: (item) => item.key,
  });
  if (choice === addCustomKey) {
    const name = await deps.askInput({
      title: es ? 'Nombre del proveedor personalizado' : 'Custom provider name',
      prompt: es ? 'Ej: ollama, groq, anthropic' : 'E.g.: ollama, groq, anthropic',
      defaultValue: 'custom',
    });
    if (!name) return null;
    const baseUrl = await deps.askInput({
      title: es ? 'URL base de la API' : 'API base URL',
      prompt: 'baseUrl',
      defaultValue: '',
    });
    if (baseUrl) setProviderField(name, 'baseUrl', baseUrl);
    const apiKey = await deps.askInput({
      title: es ? `API Key para ${name} (opcional)` : `API Key for ${name} (optional)`,
      prompt: 'apiKey',
      hidden: true,
      defaultValue: '',
    });
    if (apiKey) setProviderField(name, 'apiKey', apiKey);
    const modelId = await deps.askInput({
      title: es ? `Model ID para ${name}` : `Model ID for ${name}`,
      prompt: 'modelId',
      defaultValue: '',
    });
    if (modelId) setProviderField(name, 'modelId', modelId);
    const ctxLen = await deps.askInput({
      title: es ? `Contexto máximo (tokens) para ${name}` : `Max context length (tokens) for ${name}`,
      prompt: es ? 'Ej: 128000 (vacio = 128K)' : 'E.g.: 128000 (empty = 128K)',
      defaultValue: '',
    });
    if (ctxLen && /^\d+$/.test(ctxLen)) setProviderField(name, 'contextLength', ctxLen);
    console.log(es
      ? `Proveedor "${name}" agregado. /provider sync ${name} para sincronizar.`
      : `Provider "${name}" added. /provider sync ${name} to sync models.`);
    console.log(es ? '  Campos editables: apiKey, baseUrl, modelId, contextLength' : '  Editable fields: apiKey, baseUrl, modelId, contextLength');
    return name;
  }
  return choice || null;
}

async function runProviderModelsSelector(state, deps, providerKey) {
  const es = state.language === 'es';
  const providerGroup = listProvidersFromModels(MODELS).find(p => p.key === providerKey);
  const items = (providerGroup?.models || []).map(m => ({
    key: m.key,
    label: `${m.key.padEnd(22)} ${m.label}`,
    active: m.key === (state.activeModel || DEFAULT_MODEL_KEY),
  }));

  items.push({
    key: '__custom__',
    label: es ? '(Escribir un model ID manualmente)' : '(Type a model ID manually)',
    active: false,
  });

  if (items.length === 0) return null;
  const initialIndex = Math.max(0, items.findIndex(it => it.active));
  const selected = await deps.askSelect({
    title: es ? `Modelos de ${providerKey}` : `Models in ${providerKey}`,
    subtitle: es ? 'Elige un modelo · Esc vuelve' : 'Pick a model · Esc back',
    items,
    initialIndex,
    getLabel: (item) => item.label,
    getValue: (item) => item.key,
    isActive: (item) => item.active,
  });

  if (selected === '__custom__') {
    const customModelId = await deps.askInput({
      title: es ? `Model ID para ${providerKey}` : `Model ID for ${providerKey}`,
      prompt: es
        ? `ID exacto del modelo (puede fallar si no existe en ${providerKey})`
        : `Exact model ID (may fail if not in ${providerKey})`,
      defaultValue: '',
    });
    if (!customModelId) return null;

    const customKey = `custom-${providerKey}-${customModelId.replace(/[^a-z0-9]/gi, '-').slice(0, 40)}`;
    const extraFields = {};
    const providerFieldMap = {
      qwenapi: 'qwenapiModel', gemini: 'geminiModel', deepseek: 'deepseekChatModel',
      huggingface: 'huggingfaceModel', zen: 'zenModel',
    };
    const fieldName = providerFieldMap[providerKey] || 'modelId';
    extraFields[fieldName] = customModelId;
    extraFields.modelId = customModelId;

    MODELS[customKey] = {
      label: customModelId,
      provider: providerKey,
      contextLength: 128000,
      ...extraFields,
    };

    if (es) {
      console.log(`\n  ! Aviso: "${customModelId}" se usara tal cual. Si falla, verifica que el modelo exista en ${providerKey}.\n`);
    } else {
      console.log(`\n  ! Warning: "${customModelId}" will be used as-is. If it fails, verify the model exists on ${providerKey}.\n`);
    }

    return customKey;
  }

  return selected;
}

async function switchActiveModel(state, deps, key) {
  if (!MODELS[key]) {
    const available = Object.keys(MODELS).join(', ');
    throw new Error(`${t(state.language, 'modelInvalid')}: ${available}`);
  }
  state.activeModel = key;
  global.__zynActiveModel = key;
  await saveState(state);
  if (deps.appendTranscriptEntry) {
    await deps.appendTranscriptEntry(state.sessionId, {
      type: 'system',
      content: `Model switched to: ${MODELS[key].label}${getModelWarning(key) ? `\nWarning: ${getModelWarning(key)}` : ''}`,
    });
  }
  return key;
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
    askSelect,
    askInput,
    askConfirm,
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
    printLanguageChanged(nextLanguage);
    return true;
  }

  if (commandName === 'git') {
    const [sub, ...rest] = args.split(' ').filter(Boolean);
    if (!sub || sub === 'help') {
      console.log('Uso: /git list');
      console.log('      /git set <provider> <token> [username] [apiBaseUrl] [cloneBaseUrl] [name]');
      console.log('      /git remove <provider> [name]');
      console.log('');
      console.log('Proveedores: github, gitlab, custom');
      console.log('Para custom: apiBaseUrl y cloneBaseUrl son obligatorios para configurar la URL');
      console.log('name: identificador para multiples perfiles custom');
      console.log('');
      console.log('Ejemplos:');
      console.log('  /git set github ghp_xxxxx');
      console.log('  /git set custom glpat_xxxxx - apiBaseUrl:https://git.empresa.com/api/v4 cloneBaseUrl:https://git.empresa.com name:empresa');
      return true;
    }
    if (sub === 'list') {
      const secrets = listGitSecrets();
      if (!secrets.length) console.log('No hay credenciales git guardadas.');
      else {
        for (const s of secrets) {
          console.log(`${s.key}  user:${s.username || '-'}  api:${s.apiBaseUrl || '-'}  clone:${s.cloneBaseUrl || '-'}`);
        }
      }
      return true;
    }
    if (sub === 'set') {
      if (rest.length < 2) throw new Error('Uso: /git set <provider> <token> [username] [apiBaseUrl] [cloneBaseUrl] [name]');
      const [provider, token, username] = rest;
      let apiBaseUrl = '';
      let cloneBaseUrl = '';
      let name = '';
      for (const part of rest.slice(3)) {
        if (part.startsWith('apiBaseUrl:')) apiBaseUrl = part.slice('apiBaseUrl:'.length);
        else if (part.startsWith('cloneBaseUrl:')) cloneBaseUrl = part.slice('cloneBaseUrl:'.length);
        else if (part.startsWith('name:')) name = part.slice('name:'.length);
      }
      upsertGitSecret(provider, { provider, token, username: username || '', apiBaseUrl: apiBaseUrl || '', cloneBaseUrl: cloneBaseUrl || '', name });
      console.log(`Credencial guardada para ${provider}${name ? `:${name}` : ''}`);
      return true;
    }
    if (sub === 'remove') {
      const [provider, namePart] = rest;
      if (!provider) throw new Error('Uso: /git remove <provider> [name]');
      const name = (namePart || '').startsWith('name:') ? namePart.slice('name:'.length) : '';
      const removed = removeGitSecret(provider, name);
      console.log(removed ? `Credencial eliminada: ${provider}${name ? `:${name}` : ''}` : `No existe credencial para ${provider}`);
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
      printLanguageChanged(nextLanguage);
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
        content: `Model switched to: ${MODELS[key].label}${getModelWarning(key) ? `\nWarning: ${getModelWarning(key)}` : ''}`,
      });
      printModelChanged(key);
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

function isProviderConfigured(providerKey) {
  const config = describeProviderConfig(providerKey);
  const hasEnv = (key) => Boolean(process.env[key]);
  switch (providerKey) {
    case 'openai': return Boolean(config?.apiKey || hasEnv('OPENAI_API_KEY'));
    case 'anthropic': return Boolean(config?.apiKey || hasEnv('ANTHROPIC_API_KEY'));
    case 'groq': return Boolean(config?.apiKey || hasEnv('GROQ_API_KEY'));
    case 'together': return Boolean(config?.apiKey || hasEnv('TOGETHER_API_KEY'));
    case 'openrouter': return Boolean(config?.apiKey || hasEnv('OPENROUTER_API_KEY'));
    case 'mistral': return Boolean(config?.apiKey || hasEnv('MISTRAL_API_KEY'));
    case 'xai': return Boolean(config?.apiKey || hasEnv('XAI_API_KEY'));
    case 'cohere': return Boolean(config?.apiKey || hasEnv('COHERE_API_KEY'));
    case 'fireworks': return Boolean(config?.apiKey || hasEnv('FIREWORKS_API_KEY'));
    case 'perplexity': return Boolean(config?.apiKey || hasEnv('PERPLEXITY_API_KEY'));
    case 'qwenapi': return Boolean(config?.apiKey || hasEnv('ZYN_QWEN_API_KEY') || hasEnv('QWEN_API_KEY') || hasEnv('DASHSCOPE_API_KEY'));
    case 'gemini': return Boolean(config?.apiKey || hasEnv('ZYN_GEMINI_API_KEY') || hasEnv('GEMINI_API_KEY') || hasEnv('GOOGLE_API_KEY'));
    case 'huggingface': return Boolean(config?.apiKey || hasEnv('ZYN_HUGGINGFACE_TOKEN') || hasEnv('HF_TOKEN'));
    case 'deepseek': return Boolean(config?.apiKey || hasEnv('ZYN_DEEPSEEK_CHAT_KEY') || hasEnv('DEEPSEEK_CHAT_KEY'));
    case 'ollama': return true;
    case 'ollamaCloud': return Boolean(config?.apiKey || hasEnv('OLLAMA_API_KEY'));
    case 'github': return Boolean(config?.apiKey || hasEnv('GITHUB_TOKEN'));
    case 'azure': return Boolean(config?.apiKey || hasEnv('AZURE_OPENAI_API_KEY'));
    case 'bedrock': return Boolean(config?.apiKey || hasEnv('BEDROCK_API_KEY'));
    case 'vertex': return Boolean(config?.apiKey || hasEnv('GOOGLE_CLOUD_API_KEY') || hasEnv('GEMINI_API_KEY'));
    case 'replicate': return Boolean(config?.apiKey || hasEnv('REPLICATE_API_TOKEN'));
    case 'cloudflare': return Boolean(config?.apiKey || hasEnv('CLOUDFLARE_API_TOKEN'));
    case 'lmstudio': return true;
    case 'novita': return Boolean(config?.apiKey || hasEnv('NOVITA_API_KEY'));
    case 'chutes': return Boolean(config?.apiKey || hasEnv('CHUTES_API_KEY'));
    case 'inference': return Boolean(config?.apiKey || hasEnv('INFERENCE_API_KEY'));
    default: return true;
  }
}

async function configureProviderInteractive(state, deps, providerKey) {
  const es = state?.language === 'es';
  const fields = [];
  const skip = es ? 'Enter para saltar' : 'Enter to skip';

  switch (providerKey) {
    case 'openai':
      fields.push({ name: 'apiKey', hidden: true, prompt: `API Key (${skip})` });
      break;
    case 'anthropic':
      fields.push({ name: 'apiKey', hidden: true, prompt: `API Key (${skip})` });
      break;
    case 'groq':
      fields.push({ name: 'apiKey', hidden: true, prompt: `API Key (${skip})` });
      break;
    case 'together':
      fields.push({ name: 'apiKey', hidden: true, prompt: `API Key (${skip})` });
      break;
    case 'openrouter':
      fields.push({ name: 'apiKey', hidden: true, prompt: `API Key (${skip})` });
      break;
    case 'mistral':
      fields.push({ name: 'apiKey', hidden: true, prompt: `API Key (${skip})` });
      break;
    case 'xai':
      fields.push({ name: 'apiKey', hidden: true, prompt: `API Key (${skip})` });
      break;
    case 'cohere':
      fields.push({ name: 'apiKey', hidden: true, prompt: `API Key (${skip})` });
      break;
    case 'fireworks':
      fields.push({ name: 'apiKey', hidden: true, prompt: `API Key (${skip})` });
      break;
    case 'perplexity':
      fields.push({ name: 'apiKey', hidden: true, prompt: `API Key (${skip})` });
      break;
    case 'qwenapi':
      fields.push({ name: 'apiKey', hidden: true, prompt: `DashScope API Key (${skip})` });
      break;
    case 'gemini':
      fields.push({ name: 'apiKey', hidden: true, prompt: `Google AI API Key (${skip})` });
      break;
    case 'huggingface':
      fields.push({ name: 'apiKey', hidden: true, prompt: `HuggingFace Token (${skip})` });
      break;
    case 'deepseek':
      fields.push({ name: 'apiKey', hidden: true, prompt: `API Key (${skip})` });
      break;
    case 'ollamaCloud':
      fields.push({ name: 'apiKey', hidden: true, prompt: `API Key (${skip})` });
      break;
    case 'github':
      fields.push({ name: 'apiKey', hidden: true, prompt: `GitHub PAT (${skip})` });
      break;
    case 'azure':
      fields.push({ name: 'apiKey', hidden: true, prompt: `API Key (${skip})` });
      fields.push({ name: 'resource', hidden: false, prompt: es ? 'Resource name' : 'Resource name' });
      break;
    case 'bedrock':
      fields.push({ name: 'apiKey', hidden: true, prompt: `API Key (${skip})` });
      fields.push({ name: 'region', hidden: false, prompt: 'Region (us-east-1)' });
      break;
    case 'vertex':
      fields.push({ name: 'apiKey', hidden: true, prompt: `API Key (${skip})` });
      fields.push({ name: 'project', hidden: false, prompt: 'Project ID' });
      fields.push({ name: 'location', hidden: false, prompt: 'Region (us-central1)' });
      break;
    case 'replicate':
      fields.push({ name: 'apiKey', hidden: true, prompt: `API Token (${skip})` });
      break;
    case 'cloudflare':
      fields.push({ name: 'apiKey', hidden: true, prompt: `API Token (${skip})` });
      fields.push({ name: 'accountId', hidden: false, prompt: 'Account ID' });
      break;
    case 'novita':
      fields.push({ name: 'apiKey', hidden: true, prompt: `API Key (${skip})` });
      break;
    case 'chutes':
      fields.push({ name: 'apiKey', hidden: true, prompt: `API Key (${skip})` });
      break;
    case 'inference':
      fields.push({ name: 'apiKey', hidden: true, prompt: `API Key (${skip})` });
      break;
    default:
      fields.push({ name: 'apiKey', hidden: true, prompt: `API Key (${skip})` });
      break;
  }

  for (const field of fields) {
    const value = await deps.askInput({
      title: `${providerKey} / ${field.name}`,
      prompt: field.prompt,
      hidden: field.hidden,
      defaultValue: '',
    });
    if (value) {
      setProviderField(providerKey, field.name, value);
    }
  }
}

async function runProvidersFlow(state, deps) {
  const es = state?.language === 'es';
  
  // Paso 1: Elegir proveedor
  const provider = await runProviderSelector(state, deps);
  if (!provider) return;
  if (provider === '__add_custom__') {
    // Handled inside runProviderSelector; nothing more to do.
    return;
  }
  // If it's a custom provider that hasn't been synced yet, sync it now
  const configured = listConfiguredProviders();
  const isCustom = configured.some(p => p.provider === provider) && !listProvidersFromModels(MODELS).some(p => p.key === provider);
  if (isCustom) {
    try {
      const syncedModels = await syncProvider(provider);
      for (const m of syncedModels) MODELS[m.key] = m;
    } catch (_) {
      // sync may fail silently; user can /provider sync later
    }
  }

  // Paso 2: Si es opcional y no configurado, preguntar si configurar
  if (!isProviderConfigured(provider)) {
    const configure = await deps.askConfirm({
      title: es ? `Configurar ${provider}?` : `Configure ${provider}?`,
      detail: es ? 'Necesita API key para funcionar' : 'Requires API key to work',
    });
    if (configure) {
      await configureProviderInteractive(state, deps, provider);
    }
  }

  // Paso 3: Mostrar modelos del proveedor
  const model = await runProviderModelsSelector(state, deps, provider);
  if (model) {
    await switchActiveModel(state, deps, model);
    printModelChanged(model);
  }
}

async function runModelsFlow(state, deps) {
  const currentKey = state.activeModel || DEFAULT_MODEL_KEY;
  const currentModel = MODELS[currentKey];
  const currentProvider = currentModel?.provider || 'zen';
  const model = await runProviderModelsSelector(state, deps, currentProvider);
  if (model) {
    await switchActiveModel(state, deps, model);
    printModelChanged(model);
  }
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

  if (commandName === 'gmail') {
    const [subRaw, ...rest] = String(args || 'status').trim().split(/\s+/).filter(Boolean);
    const sub = (subRaw || 'status').toLowerCase();

    if (sub === 'connect' || sub === 'login') {
      const portArg = rest.find(part => /^\d{2,5}$/.test(part));
      const flow = await startGmailOAuthFlow({ port: portArg ? Number(portArg) : 0, flow: 'code' });
      console.log(flow.authUrl);
      if (flow.flow === 'device') {
        console.log(`Código: ${flow.userCode}`);
        console.log('Abre el link, ingresa el código y autoriza Gmail.');
      } else {
        console.log('Abre el link, inicia sesión y vuelve aquí.');
      }
      flow.done
        .then(auth => {
          const email = auth?.profile?.email || 'cuenta conectada';
          console.error(`Gmail conectado: ${email}`);
        })
        .catch(err => console.error(`Gmail OAuth fallo: ${err.message}`));
      return true;
    }

    if (sub === 'status') {
      const status = await getGmailAuthStatus();
      if (!status.connected) {
        console.log('Gmail: no conectado. Usa /gmail connect.');
      } else {
        console.log(`Gmail: conectado${status.email ? ` (${status.email})` : ''}`);
        console.log(`Scopes: ${status.scopes.join(', ') || '-'}`);
        console.log(`Expira: ${status.expiryDate ? new Date(status.expiryDate).toISOString() : '-'}`);
      }
      return true;
    }

    if (sub === 'disconnect' || sub === 'logout' || sub === 'remove') {
      await clearGmailAuth();
      console.log('Gmail desconectado.');
      return true;
    }

    throw new Error('Use /gmail connect|status|disconnect');
  }

  if (commandName === 'bg') {
    if (!state.__bgDetach) {
      console.log('No hay un turno activo para mandar a segundo plano.');
      console.log('  /bg funciona después de enviar un mensaje; el worker procesa el turno y guarda el resultado.');
      return true;
    }
    const { input, signal } = state.__bgDetach;
    const sessionId = state.sessionId;
    const taskId = await enqueueBackgroundTask({ sessionId, input, detachedAt: new Date().toISOString() });
    detachBackgroundTurn({ taskId, sessionId, input, cwd: state.cwd, modelKey: state.activeModel, language: state.language, personaPrompt: state.personaPrompt, autoApprove: state.autoApprove });
    if (signal && !signal.aborted) signal.abort();
    if (typeof deps.exitAfterBg === 'function') {
      deps.exitAfterBg();
    } else {
      console.log(`Turno enviado a segundo plano. Task: ${taskId}`);
      console.log('  El worker terminará el turno y guardará la respuesta en la sesión.');
      console.log('  Vuelve a abrir zyn para ver el resultado.');
    }
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
  if (commandName === 'undo') {
    const len = state.history.length;
    if (len < 2) {
      console.log('Nothing to undo.');
      return true;
    }
    state.redoHistory = state.redoHistory || [];
    const removed = state.history.splice(len - 2, 2);
    state.redoHistory.push(...removed);
    await saveState(state);
    console.log('Last turn undone.');
    return true;
  }

  if (commandName === 'redo') {
    const stack = state.redoHistory || [];
    if (stack.length < 2) {
      console.log('Nothing to redo.');
      return true;
    }
    const restored = stack.splice(stack.length - 2, 2);
    state.history.push(...restored);
    await saveState(state);
    console.log('Last turn restored.');
    return true;
  }

  if (commandName === 'reset' || commandName === 'clear') {
    state.history = [];
    state.actionLog = [];
    state.turnCount = 0;
    state.memorySummary = '';
    state.sessionMemory = {};
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

  if (commandName === 'models') {
    if (askSelect) {
      await runModelsFlow(state, deps);
      return true;
    }
    printModels();
    return true;
  }

  if (commandName === 'providers') {
    if (askSelect) {
      await runProvidersFlow(state, deps);
      return true;
    }
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

  if (commandName === 'provider') {
    const [sub, ...rest] = args.split(' ').filter(Boolean);
    const subArg = rest.join(' ').trim();

    if (!sub || sub === 'help') {
      console.log('');
      console.log('  /provider list                    list configured providers');
      console.log('  /provider sync <name>             sync models for a provider');
      console.log('  /provider set <name> <k> <v>      set a config field');
      console.log('  /provider remove <name>           remove a provider config');
      console.log('');
      console.log('  Configurable fields (via set):');
      console.log('    apiKey         API key');
      console.log('    baseUrl        API base URL');
      console.log('    modelId        Model ID override');
      console.log('    contextLength  Max context tokens (e.g. 128000)');
      console.log('    email/password Basic auth');
      console.log('    modelEndpoint  Custom models endpoint');
      console.log('    chatEndpoint   Custom chat endpoint');
      console.log('');
      console.log('  /providers  interactive provider picker');
      console.log('');
      return true;
    }

    if (sub === 'list') {
      const configured = listConfiguredProviders();
      console.log('');
      if (configured.length === 0) {
        console.log('  No configured providers. Use /provider set <name> <key> <value> to add one.');
      } else {
        for (const p of configured) {
          const name = p.provider || p.key || '?';
          const summary = summarizeProviderConfig(name);
          console.log(`  ${name}`);
          if (summary?.fields?.length) {
            for (const f of summary.fields) {
              console.log(`    ${f.name}: ${f.value}`);
            }
          }
        }
      }
      console.log('');
      return true;
    }

    if (sub === 'sync') {
      if (!subArg) {
        console.log('  Usage: /provider sync <provider-name>');
        return true;
      }
      try {
        const models = await syncProvider(subArg);
        for (const k of Object.keys(MODELS)) {
          if (MODELS[k]?.provider === subArg) delete MODELS[k];
        }
        for (const m of models) MODELS[m.key] = m;
        console.log(`  Synced ${models.length} models for "${subArg}":`);
        for (const m of models) {
          console.log(`    ${m.key.padEnd(20)} ${m.label}`);
        }
      } catch (err) {
        console.log(`  Error: ${err.message}`);
      }
      return true;
    }

    if (sub === 'set') {
      const [providerName, field, ...values] = rest;
      if (!providerName || !field || values.length === 0) {
        console.log('  Usage: /provider set <name> <field> <value>');
        return true;
      }
      try {
        setProviderField(providerName, field, values.join(' '));
        console.log(`  ${providerName}.${field} = ${values.join(' ')}`);
      } catch (err) {
        console.log(`  Error: ${err.message}`);
      }
      return true;
    }

    if (sub === 'remove') {
      if (!subArg) {
        console.log('  Usage: /provider remove <name>');
        return true;
      }
      try {
        removeProviderConfig(subArg);
        console.log(`  Removed provider "${subArg}"`);
      } catch (err) {
        console.log(`  Error: ${err.message}`);
      }
      return true;
    }

    console.log('  Unknown subcommand. Use /provider help');
    return true;
  }

  if (commandName === 'compact') {
    if (!state.history || state.history.length === 0) {
      console.log('No history to compact.');
      return true;
    }
    const before = state.history.length;
    const beforeChars = state.history.reduce((sum, m) => sum + (m.content?.length || 0), 0);
    truncateHistory(state);
    await saveState(state);
    const after = state.history.length;
    if (before === after) {
      console.log(`Already compact (${before} messages, ${beforeChars} chars). Use /reset to clear.`);
    } else {
      console.log(`Compacted: ${before} -> ${after} messages. Summary: ~${countTokens(state.memorySummary)} tokens.`);
    }
    return true;
  }

  if (commandName === 'theme') {
    const themes = ['dark', 'cappuccino', 'light', 'coffee', 'gruvbox', 'dracula', 'nord', 'solarized', 'monokai', 'tokyoNight'];
    const current = state.theme || 'dark';
    if (!args) {
      console.log(`Current theme: ${current}`);
      console.log('Available: ' + themes.join(', '));
      return true;
    }
    const theme = args.toLowerCase().replace(/[-\s]/g, '');
    const themeMap = { tokyonight: 'tokyoNight' };
    const resolved = themeMap[theme] || theme;
    if (!themes.includes(resolved)) {
      console.log(`Unknown theme. Available: ${themes.join(', ')}`);
      return true;
    }
    state.theme = resolved;
    await saveState(state);
    console.log(`Theme set to: ${resolved}`);
    if (global.__zynApplyTheme) global.__zynApplyTheme(resolved);
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
