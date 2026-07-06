const fs = require('fs');
const path = require('path');

const fsp = fs.promises;
const { DEFAULT_LANGUAGE, DEFAULT_MODEL_KEY, DEFAULT_SETTINGS, GEMINI_MODEL_WARNING, MODELS, listProvidersFromModels, countTokens, getSetting } = require('../config');
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
  { name: 'plugins', desc: 'manage plugins (install, uninstall, list, search)', descEs: 'gestionar plugins (install, uninstall, list, search)' },
  { name: 'mcp', desc: 'MCP servers (connect, disconnect, list, tools)', descEs: 'servidores MCP (connect, disconnect, list, tools)' },
  { name: 'settings', desc: 'configure limits, retries, timeouts', descEs: 'configurar límites, reintentos, tiempos de espera' },
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
  const g = (value) => paint(value, 'green');
  const w = (value) => paint(value, 'white');
  const providers = listProvidersFromModels(MODELS);
  const line = '─'.repeat(52);

  console.log('');
  console.log(`  ${paint('◆', 'cyan')} ${paint('Zyn', 'cyan')} ${m('v1.4.1')} — ${m(t(lang, 'helpTitle'))}`);
  console.log(`  ${m(line)}`);

  console.log('');
  console.log(`  ${m(t(lang, 'usage'))}`);
  console.log(`    ${w('zyn')}                ${m(t(lang, 'interactiveMode'))}`);
  console.log(`    ${w("zyn 'question'")}     ${m(t(lang, 'singlePrompt'))}`);
  console.log(`    ${w('zyn --new')}          ${m(t(lang, 'newSession'))}`);
  console.log(`    ${w('zyn --resume ID')}    ${m(t(lang, 'resumeSession'))}`);

  console.log('');
  console.log(`  ${g(t(lang, 'helpSessions'))}`);
  console.log(`    ${b('/help')}                       ${m(t(lang, 'helpShowHelp'))}`);
  console.log(`    ${b('/status')}                     ${m(t(lang, 'helpStatusInfo'))}`);
  console.log(`    ${b('/history')}                    ${m(t(lang, 'helpRecentActions'))}`);
  console.log(`    ${b('/memory')}                     ${m(t(lang, 'helpMemorySummary'))}`);
  console.log(`    ${b('/session')}                    ${m(t(lang, 'helpCurrentSession'))}`);
  console.log(`    ${b('/sessions')}                   ${m(t(lang, 'helpListSessions'))}`);
  console.log(`    ${b('/new')}                        ${m(t(lang, 'helpCreateSession'))}`);
  console.log(`    ${b('/resume <ID>')}                ${m(t(lang, 'helpResumeSession'))}`);
  console.log(`    ${b('/title <text>')}               ${m(t(lang, 'helpRenameSession'))}`);

  console.log('');
  console.log(`  ${g(t(lang, 'helpConfiguration'))}`);
  console.log(`    ${b('/models')}                     ${m(t(lang, 'helpModelPicker'))}`);
  console.log(`    ${b('/providers')}                  ${m(t(lang, 'helpProviderPicker'))}`);
  console.log(`    ${b('/theme')}                      ${m(t(lang, 'helpThemePicker'))}`);
  console.log(`    ${b('/theme <name>')}               ${m(t(lang, 'helpThemeSwitch'))}`);
  console.log(`    ${b('/lang <en|es>')}               ${m(t(lang, 'helpChangeLang'))}`);
  console.log(`    ${b('/auto on|off')}                ${m(t(lang, 'helpAutoApprove'))}`);
  console.log(`    ${b('/persona set <text>')}         ${m(t(lang, 'helpSetPersona'))}`);
  console.log(`    ${b('/config show')}                ${m(t(lang, 'helpShowConfig'))}`);
  console.log(`    ${b('/cwd <path>')}                 ${m(t(lang, 'helpChangeCwd'))}`);

  console.log('');
  console.log(`  ${g(t(lang, 'helpPlugins'))}`);
  console.log(`    ${b('/plugins')}                    ${m(t(lang, 'helpOpenPlugins'))}`);
  console.log(`    ${b('/plugins list')}               ${m(t(lang, 'helpListPlugins'))}`);
  console.log(`    ${b('/plugins install <name>')}     ${m(t(lang, 'helpInstallPlugin'))}`);
  console.log(`    ${b('/plugins uninstall <name>')}   ${m(t(lang, 'helpRemovePlugin'))}`);
  console.log(`    ${b('/plugins search <query>')}     ${m(t(lang, 'helpSearchPlugins'))}`);

  console.log('');
  console.log(`  ${g(t(lang, 'helpMcpServers'))}`);
  console.log(`    ${b('/mcp')}                        ${m(t(lang, 'helpOpenMcp'))}`);
  console.log(`    ${b('/mcp connect <json>')}       ${m(t(lang, 'helpConnectMcp'))}`);
  console.log(`    ${b('/mcp disconnect <name>')}      ${m(t(lang, 'helpDisconnectMcp'))}`);
  console.log(`    ${b('/mcp list')}                   ${m(t(lang, 'helpListMcp'))}`);
  console.log(`    ${b('/mcp tools <name>')}           ${m(t(lang, 'helpListMcpTools'))}`);

  console.log('');
  console.log(`  ${g(t(lang, 'helpToolsGit'))}`);
  console.log(`    ${b('/git set <provider> <token>')} ${m(t(lang, 'helpGitConfig'))}`);
  console.log(`    ${b('/git list')}                   ${m(t(lang, 'helpGitList'))}`);
  console.log(`    ${b('/git remove <provider>')}      ${m(t(lang, 'helpGitRemove'))}`);
  console.log(`    ${b('/gmail connect')}              ${m(t(lang, 'helpGmailConnect'))}`);
  console.log(`    ${b('/cwd')}                        ${m(t(lang, 'helpShowCwd'))}`);

  console.log('');
  console.log(`  ${g(t(lang, 'helpExport'))}`);
  console.log(`    ${b('/bg')}                         ${m(t(lang, 'helpDetachBg'))}`);
  console.log(`    ${b('/transcript')}                 ${m(t(lang, 'helpTranscript'))}`);
  console.log(`    ${b('/export')}                     ${m(t(lang, 'helpExport'))}`);

  console.log('');
  console.log(`  ${g(t(lang, 'helpControl'))}`);
  console.log(`    ${b('/stop')}                       ${m(t(lang, 'helpStop'))} ${m(t(lang, 'helpEscWorks'))}`);
  console.log(`    ${b('/reset')}                      ${m(t(lang, 'helpResetContext'))}`);
  console.log(`    ${b('/exit')}                       ${m(t(lang, 'helpExit'))} ${m(t(lang, 'helpCtrlD'))}`);

  console.log('');
  console.log(`  ${m(line)}`);
  console.log(`  ${m(t(lang, 'providers'))}`);
  for (const provider of providers) {
    console.log(`    ${b(provider.key)}  ${provider.models.map(model => model.label).join(', ')}`);
  }
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
    title: t(state.language, 'selectorSelectModel'),
    subtitle: t(state.language, 'selectorNavModel'),
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
    title: t(state.language, 'selectorSelectProvider'),
    subtitle: t(state.language, 'selectorNavProvider'),
    items,
    getLabel: (item) => {
      if (item.key === addCustomKey) return '+ ' + t(state.language, 'providerAddCustom');
      return item.label;
    },
    getValue: (item) => item.key,
  });
  if (choice === addCustomKey) {
    const name = await deps.askInput({
      title: t(state.language, 'providerCustomName'),
      prompt: t(state.language, 'providerCustomNamePrompt'),
      defaultValue: 'custom',
    });
    if (!name) return null;
    const baseUrl = await deps.askInput({
      title: t(state.language, 'providerBaseUrl'),
      prompt: 'baseUrl',
      defaultValue: '',
    });
    if (baseUrl) setProviderField(name, 'baseUrl', baseUrl);
    const apiKey = await deps.askInput({
      title: t(state.language, 'providerApiKeyOptional', { name }),
      prompt: 'apiKey',
      hidden: true,
      defaultValue: '',
    });
    if (apiKey) setProviderField(name, 'apiKey', apiKey);
    const modelId = await deps.askInput({
      title: t(state.language, 'providerModelIdFor', { name }),
      prompt: 'modelId',
      defaultValue: '',
    });
    if (modelId) setProviderField(name, 'modelId', modelId);
    const ctxLen = await deps.askInput({
      title: t(state.language, 'providerContextLength', { name }),
      prompt: t(state.language, 'providerContextLengthHint'),
      defaultValue: '',
    });
    if (ctxLen && /^\d+$/.test(ctxLen)) setProviderField(name, 'contextLength', ctxLen);
    console.log(t(state.language, 'providerAdded', { name }));
    console.log('  ' + t(state.language, 'providerEditableFields'));
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
    label: t(state.language, 'providerTypeManual'),
    active: false,
  });

  if (items.length === 0) return null;
  const initialIndex = Math.max(0, items.findIndex(it => it.active));
  const selected = await deps.askSelect({
    title: t(state.language, 'providerModelsIn', { provider: providerKey }),
    subtitle: t(state.language, 'providerPickModel'),
    items,
    initialIndex,
    getLabel: (item) => item.label,
    getValue: (item) => item.key,
    isActive: (item) => item.active,
  });

  if (selected === '__custom__') {
    const customModelId = await deps.askInput({
      title: t(state.language, 'providerCustomModelTitle', { provider: providerKey }),
      prompt: t(state.language, 'providerCustomModelHint', { provider: providerKey }),
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
      console.log(`\n  ! ${t(state.language, 'providerCustomModelWarning', { model: customModelId, provider: providerKey })}\n`);
    } else {
      console.log(`\n  ! ${t(state.language, 'providerCustomModelWarning', { model: customModelId, provider: providerKey })}\n`);
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
  console.log(`  ${t(state.language, 'langCurrent')} : ${languageLabel(normalizeLanguage(state.language))} (${normalizeLanguage(state.language)})`);
  console.log(`  Model    : ${key} (${model?.label || '?'})`);
  console.log(`  Provider : ${provider}`);
  console.log(`  Auto     : ${state.autoApprove ? t(state.language, 'configAutoEnabled') : t(state.language, 'configAutoDisabled')}`);
  console.log(`  CWD      : ${state.cwd}`);
  console.log('');
  console.log('  ' + t(state.language, 'configCommands'));
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
      console.log(t(state.language, 'gitUsage'));
      console.log('      ' + t(state.language, 'gitUsageSet'));
      console.log('      ' + t(state.language, 'gitUsageRemove'));
      console.log('');
      console.log('  ' + t(state.language, 'gitProviders'));
      console.log('  ' + t(state.language, 'gitCustomInfo'));
      console.log('  ' + t(state.language, 'gitCustomName'));
      console.log('');
      console.log('  ' + t(state.language, 'gitExamples'));
      console.log('  /git set github ghp_xxxxx');
      console.log('  /git set custom glpat_xxxxx - apiBaseUrl:https://git.empresa.com/api/v4 cloneBaseUrl:https://git.empresa.com name:empresa');
      return true;
    }
    if (sub === 'list') {
      const secrets = listGitSecrets();
      if (!secrets.length) console.log(t(state.language, 'gitNoSaved'));
      else {
        for (const s of secrets) {
          console.log(`${s.key}  user:${s.username || '-'}  api:${s.apiBaseUrl || '-'}  clone:${s.cloneBaseUrl || '-'}`);
        }
      }
      return true;
    }
    if (sub === 'set') {
      if (rest.length < 2) throw new Error(t(state.language, 'gitUsageSet'));
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
      console.log(t(state.language, 'gitSaved', { provider: provider + (name ? `:${name}` : '') }));
      return true;
    }
    if (sub === 'remove') {
      const [provider, namePart] = rest;
      if (!provider) throw new Error(t(state.language, 'gitUsageRemove'));
      const name = (namePart || '').startsWith('name:') ? namePart.slice('name:'.length) : '';
      const removed = removeGitSecret(provider, name);
      console.log(removed ? t(state.language, 'gitRemoved', { provider: provider + (name ? `:${name}` : '') }) : t(state.language, 'gitNotFound', { provider }));
      return true;
    }
    throw new Error(t(state.language, 'gitUnknownSub'));
  }

  if (commandName === 'persona') {
    const [sub, ...rest] = args.split(' ');
    if (!sub || sub === 'show') {
      console.log(state.personaPrompt ? `${t(state.language, 'personaActive')}\n${state.personaPrompt}` : t(state.language, 'personaDefault'));
      return true;
    }
    if (sub === 'reset' || sub === 'default') {
      state.personaPrompt = '';
      await saveState(state);
      console.log(t(state.language, 'personaReset'));
      return true;
    }
    if (sub === 'set') {
      const text = rest.join(' ').trim();
      if (!text) throw new Error(t(state.language, 'personaUsage'));
      state.personaPrompt = text;
      await saveState(state);
      console.log(t(state.language, 'personaUpdated'));
      return true;
    }
    throw new Error(t(state.language, 'personaUsage'));
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
    console.log(t(state.language, 'titleUpdated', { title: state.title }));
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
        throw new Error(t(state.language, 'configAutoUsage'));
      }
      state.autoApprove = value === 'on';
      await saveState(state);
      console.log(state.autoApprove ? t(state.language, 'configAutoEnabled') : t(state.language, 'configAutoDisabled'));
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

    throw new Error(t(state.language, 'configUsage'));
  }

  if (commandName === 'settings') {
    const { paint } = require('./print');
    state.settings = state.settings || {};
    const lang = state.language;

    if (!args || args === 'show') {
      const s = state.settings;
      const d = DEFAULT_SETTINGS;
      const val = (key) => s[key] !== undefined ? s[key] : d[key];
      const mark = (key) => s[key] === undefined ? ` (${t(lang, 'settingsDefault')})` : '';
      const settingsList = [
        ['max-tool-steps',       'maxToolSteps',         'settingMaxToolSteps'],
        ['request-timeout',      'requestTimeoutMs',     'settingRequestTimeout'],
        ['max-history',          'maxHistoryChars',      'settingMaxHistory'],
        ['max-output',           'maxOutputChars',       'settingMaxOutput'],
        ['max-file-lines',       'maxFileLines',         'settingMaxFileLines'],
        ['keep-recent',          'keepRecentMessages',   'settingKeepRecent'],
        ['compact-threshold',    'autoCompactThreshold', 'settingCompactThreshold'],
        ['provider-attempts',    'providerMaxAttempts',  'settingProviderAttempts'],
        ['retry-delay',          'providerRetryDelayMs', 'settingRetryDelay'],
        ['max-tokens',           'maxTokens',            'settingMaxTokens'],
      ];
      console.log('');
      console.log(`  ${paint(t(lang, 'settingsTitle'), 'cyan')}`);
      console.log(`  ${'─'.repeat(44)}`);
      for (const [name, key, labelKey] of settingsList) {
        const v = val(key);
        const unit = (key.includes('Timeout') || key.includes('Delay')) ? t(lang, 'settingsUnitMs') : '';
        console.log(`  ${paint(t(lang, labelKey), 'white')}:  ${v}${unit}${mark(key)}`);
      }
      console.log('');
      console.log(`  ${paint(t(lang, 'settingsUsage'), 'dim')}`);
      console.log('');
      return true;
    }

    const [sub, ...rest] = args.split(/\s+/);
    const value = rest.join(' ').trim();

    if (sub === 'reset') {
      state.settings = {};
      await saveState(state);
      console.log(t(lang, 'settingsResetDone'));
      return true;
    }

    const SETTINGS_SCHEMA = {
      'max-tool-steps':       { key: 'maxToolSteps',         min: 1,      max: 500,     isFloat: false },
      'request-timeout':      { key: 'requestTimeoutMs',     min: 5000,   max: 600000,  isFloat: false },
      'max-history':          { key: 'maxHistoryChars',      min: 10000,  max: 2000000, isFloat: false },
      'max-output':           { key: 'maxOutputChars',       min: 1000,   max: 500000,  isFloat: false },
      'max-file-lines':       { key: 'maxFileLines',         min: 100,    max: 100000,  isFloat: false },
      'keep-recent':          { key: 'keepRecentMessages',   min: 5,      max: 500,     isFloat: false },
      'compact-threshold':    { key: 'autoCompactThreshold', min: 0.1,    max: 1.0,     isFloat: true },
      'provider-attempts':    { key: 'providerMaxAttempts',  min: 1,      max: 20,      isFloat: false },
      'retry-delay':          { key: 'providerRetryDelayMs', min: 500,    max: 30000,   isFloat: false },
      'max-tokens':           { key: 'maxTokens',            min: 1024,   max: 200000,  isFloat: false },
    };

    const schema = SETTINGS_SCHEMA[sub];
    if (!schema) {
      console.log('');
      console.log(`  ${paint(t(lang, 'settingsAvailable'), 'cyan')}`);
      for (const [name, s] of Object.entries(SETTINGS_SCHEMA)) {
        const current = state.settings[s.key] !== undefined ? state.settings[s.key] : DEFAULT_SETTINGS[s.key];
        const range = s.isFloat ? '(0.1-1.0)' : `(${s.min}-${s.max})`;
        console.log(`    ${paint(name, 'white')} = ${current}  ${paint(range, 'dim')}`);
      }
      console.log('');
      console.log(`  ${paint(t(lang, 'settingsSetUsage'), 'dim')}`);
      console.log('');
      return true;
    }

    if (!value) {
      const current = state.settings[schema.key] !== undefined ? state.settings[schema.key] : DEFAULT_SETTINGS[schema.key];
      console.log(`${sub} = ${current}`);
      return true;
    }

    const parsed = schema.isFloat ? parseFloat(value) : parseInt(value, 10);
    if (isNaN(parsed)) {
      throw new Error(t(lang, 'settingsInvalidValue') + ': ' + value);
    }
    if (parsed < schema.min || parsed > schema.max) {
      throw new Error(t(lang, 'settingsOutOfRange') + ': ' + parsed + ' (' + schema.min + '-' + schema.max + ')');
    }

    state.settings[schema.key] = parsed;
    await saveState(state);
    console.log(`${sub} = ${parsed} ${t(lang, 'settingsSaved')}`);
    return true;
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
      title: t(state.language, 'providerConfigureTitle', { provider }),
      detail: t(state.language, 'providerConfigureDetail'),
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
      console.log(state.autoApprove ? t(state.language, 'autoOn') : t(state.language, 'autoOff'));
      return true;
    }

    if (args !== 'on' && args !== 'off') {
      throw new Error(t(state.language, 'configAutoUsage'));
    }

    state.autoApprove = args === 'on';
    await saveState(state);
    await appendTranscriptEntry(state.sessionId, {
      type: 'system',
      content: `Auto approve: ${state.autoApprove ? 'on' : 'off'}`,
    });
    console.log(state.autoApprove ? t(state.language, 'configAutoEnabled') : t(state.language, 'configAutoDisabled'));
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
        console.log(t(state.language, 'gmailCode', { code: flow.userCode }));
        console.log(t(state.language, 'gmailOpenLink'));
      } else {
        console.log(t(state.language, 'gmailOpenLogin'));
      }
      flow.done
        .then(auth => {
          const email = auth?.profile?.email || 'cuenta conectada';
          console.error(t(state.language, 'gmailConnected', { email }));
        })
        .catch(err => console.error(t(state.language, 'gmailFailed', { error: err.message })));
      return true;
    }

    if (sub === 'status') {
      const status = await getGmailAuthStatus();
      if (!status.connected) {
        console.log(t(state.language, 'gmailNotConnected'));
      } else {
        console.log(`${t(state.language, 'gmailConnectedStatus')}${status.email ? ` (${status.email})` : ''}`);
        console.log(`Scopes: ${status.scopes.join(', ') || '-'}`);
        console.log(`Expira: ${status.expiryDate ? new Date(status.expiryDate).toISOString() : '-'}`);
      }
      return true;
    }

    if (sub === 'disconnect' || sub === 'logout' || sub === 'remove') {
      await clearGmailAuth();
      console.log(t(state.language, 'gmailDisconnected'));
      return true;
    }

    throw new Error(t(state.language, 'gmailUsage'));
  }

  if (commandName === 'bg') {
    if (!state.__bgDetach) {
      console.log(t(state.language, 'bgNoActive'));
      console.log('  ' + t(state.language, 'bgHowItWorks'));
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
      console.log(t(state.language, 'bgSent', { taskId }));
      console.log('  ' + t(state.language, 'bgWorkerInfo'));
      console.log('  ' + t(state.language, 'bgReopen'));
    }
    return true;
  }

  if (commandName === 'stop' || commandName === 'abort') {
    if (typeof state.abortCurrentTurn === 'function') {
      state.abortCurrentTurn();
      console.log(t(state.language, 'agentStopped'));
    } else {
      console.log(t(state.language, 'noActiveTurn'));
    }
    return true;
  }
  if (commandName === 'undo') {
    const len = state.history.length;
    if (len < 2) {
      console.log(t(state.language, 'nothingUndo'));
      return true;
    }
    state.redoHistory = state.redoHistory || [];
    const removed = state.history.splice(len - 2, 2);
    state.redoHistory.push(...removed);
    await saveState(state);
    console.log(t(state.language, 'lastTurnUndone'));
    return true;
  }

  if (commandName === 'redo') {
    const stack = state.redoHistory || [];
    if (stack.length < 2) {
      console.log(t(state.language, 'nothingRedo'));
      return true;
    }
    const restored = stack.splice(stack.length - 2, 2);
    state.history.push(...restored);
    await saveState(state);
    console.log(t(state.language, 'lastTurnRestored'));
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
    console.log(t(state.language, 'contextReset'));
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
    console.log(t(state.language, 'transcriptExported', { path: exported }));
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
      console.log('  ' + t(state.language, 'providerUsage'));
      console.log('  ' + t(state.language, 'providerSyncUsage'));
      console.log('  ' + t(state.language, 'providerSetUsage'));
      console.log('  ' + t(state.language, 'providerRemoveUsage'));
      console.log('');
      console.log('  ' + t(state.language, 'providerFields'));
      console.log('    apiKey         ' + t(state.language, 'providerFieldApiKey'));
      console.log('    baseUrl        ' + t(state.language, 'providerFieldBaseUrl'));
      console.log('    modelId        ' + t(state.language, 'providerFieldModelId'));
      console.log('    contextLength  ' + t(state.language, 'providerFieldContextLength'));
      console.log('    email/password ' + t(state.language, 'providerFieldBasicAuth'));
      console.log('    modelEndpoint  ' + t(state.language, 'providerFieldModelEndpoint'));
      console.log('    chatEndpoint   ' + t(state.language, 'providerFieldChatEndpoint'));
      console.log('');
      console.log('  ' + t(state.language, 'providerInteractiveHint'));
      console.log('');
      return true;
    }

    if (sub === 'list') {
      const configured = listConfiguredProviders();
      console.log('');
      if (configured.length === 0) {
        console.log('  ' + t(state.language, 'providerNoConfigured'));
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
        console.log('  ' + t(state.language, 'providerSyncUsageHint'));
        return true;
      }
      try {
        const models = await syncProvider(subArg);
        for (const k of Object.keys(MODELS)) {
          if (MODELS[k]?.provider === subArg) delete MODELS[k];
        }
        for (const m of models) MODELS[m.key] = m;
        console.log('  ' + t(state.language, 'providerSynced', { count: models.length, name: subArg }));
        for (const m of models) {
          console.log(`    ${m.key.padEnd(20)} ${m.label}`);
        }
      } catch (err) {
        console.log('  ' + t(state.language, 'providerError', { error: err.message }));
      }
      return true;
    }

    if (sub === 'set') {
      const [providerName, field, ...values] = rest;
      if (!providerName || !field || values.length === 0) {
        console.log('  ' + t(state.language, 'providerSetUsageHint'));
        return true;
      }
      try {
        setProviderField(providerName, field, values.join(' '));
        console.log(`  ${providerName}.${field} = ${values.join(' ')}`);
      } catch (err) {
        console.log('  ' + t(state.language, 'providerError', { error: err.message }));
      }
      return true;
    }

    if (sub === 'remove') {
      if (!subArg) {
        console.log('  ' + t(state.language, 'providerRemoveUsageHint'));
        return true;
      }
      try {
        removeProviderConfig(subArg);
        console.log('  ' + t(state.language, 'providerRemoved', { name: subArg }));
      } catch (err) {
        console.log('  ' + t(state.language, 'providerError', { error: err.message }));
      }
      return true;
    }

    console.log('  ' + t(state.language, 'providerUnknownSub'));
    return true;
  }

  if (commandName === 'compact') {
    if (!state.history || state.history.length === 0) {
      console.log(t(state.language, 'noHistoryCompact'));
      return true;
    }
    const before = state.history.length;
    const beforeChars = state.history.reduce((sum, m) => sum + (m.content?.length || 0), 0);
    truncateHistory(state);
    await saveState(state);
    const after = state.history.length;
    if (before === after) {
      console.log(t(state.language, 'alreadyCompact', { count: before, chars: beforeChars }));
    } else {
      console.log(t(state.language, 'compacted', { before, after }));
    }
    return true;
  }

  if (commandName === 'theme') {
    const themes = [
      'dark', 'cappuccino', 'light', 'coffee', 'gruvbox', 'dracula', 'nord',
      'solarized', 'monokai', 'tokyoNight', 'matrix', 'synthwave', 'rosePine',
      'catppuccin', 'oneDark', 'materialPalenight', 'cyberpunk', 'arctic',
      'ember', 'lavender', 'midnight', 'sunset', 'ocean', 'vaporwave',
    ];
    const current = state.theme || 'dark';
    if (!args) {
      console.log(t(state.language, 'themeCurrent', { theme: current }));
      console.log(t(state.language, 'themeAvailable', { themes: themes.join(', ') }));
      console.log(t(state.language, 'themeUsage'));
      return true;
    }
    if (args === 'random') {
      const pick = themes[Math.floor(Math.random() * themes.length)];
      state.theme = pick;
      await saveState(state);
      console.log(t(state.language, 'themeSetTo', { theme: pick }));
      if (global.__zynApplyTheme) global.__zynApplyTheme(pick);
      return true;
    }
    if (args === 'list') {
      console.log(t(state.language, 'themeListAvailable'));
      for (const th of themes) {
        console.log(`  ${th === current ? '> ' : '  '}${th}${th === current ? ' ' + t(state.language, 'themeCurrentLabel') : ''}`);
      }
      return true;
    }
    const theme = args.toLowerCase().replace(/[-\s]/g, '');
    const themeMap = {
      tokyonight: 'tokyoNight', rosepine: 'rosePine', catppuccin: 'catppuccin',
      onedark: 'oneDark', materialpalenight: 'materialPalenight',
    };
    const resolved = themeMap[theme] || theme;
    if (!themes.includes(resolved)) {
      console.log(t(state.language, 'themeUnknown', { themes: themes.join(', ') }));
      return true;
    }
    state.theme = resolved;
    await saveState(state);
    console.log(t(state.language, 'themeSetTo', { theme: resolved }));
    if (global.__zynApplyTheme) global.__zynApplyTheme(resolved);
    return true;
  }

  if (commandName === 'plugins') {
    const { execSync } = require('child_process');
    const fs = require('fs');
    const path = require('path');
    const { PLUGINS_DIR } = require('../config');
    const pluginsDir = PLUGINS_DIR;
    const [sub, ...rest] = (args || '').split(' ').filter(Boolean);

    if (!sub || sub === 'list') {
      if (!fs.existsSync(pluginsDir)) {
        console.log(t(state.language, 'pluginsNone'));
        return true;
      }
      const dirs = fs.readdirSync(pluginsDir).filter(d => {
        try { return fs.statSync(path.join(pluginsDir, d)).isDirectory(); }
        catch { return false; }
      });
      if (dirs.length === 0) {
        console.log(t(state.language, 'pluginsNoneHint'));
        return true;
      }
      console.log(t(state.language, 'pluginsInstalled'));
      for (const d of dirs) {
        try {
          const manifest = JSON.parse(fs.readFileSync(path.join(pluginsDir, d, 'manifest.json'), 'utf8'));
          console.log(`  ${d} v${manifest.version || '?'} — ${manifest.description || t(state.language, 'pluginsNoDescription')} [${manifest.type || 'unknown'}]`);
        } catch {
          console.log(`  ${d} — ${t(state.language, 'pluginsNoManifest')}`);
        }
      }
      return true;
    }

    if (sub === 'install') {
      const name = rest[0];
      if (!name) {
        console.log(t(state.language, 'pluginsUsageInstall'));
        return true;
      }
      console.log(`\n  ${t(state.language, 'pluginsSecurityWarning')}`);
      console.log(`  ${t(state.language, 'pluginsSecurityDetail1', { name })}`);
      console.log(`  ${t(state.language, 'pluginsSecurityDetail2')}`);
      console.log(`  ${t(state.language, 'pluginsSecurityDetail3')}`);
      console.log(`  ${t(state.language, 'pluginsProceed')}`);
      const confirm = await askConfirm({ title: t(state.language, 'pluginsConfirmTitle', { name }), detail: t(state.language, 'pluginsConfirmDetail') });
      if (!confirm) {
        console.log(t(state.language, 'pluginsCancelled'));
        return true;
      }
      try {
        fs.mkdirSync(pluginsDir, { recursive: true });
        console.log('  ' + t(state.language, 'pluginsInstalling', { name }));
        const isLocal = name.startsWith('/') || name.startsWith('./') || name.startsWith('../');
        if (isLocal) {
          const localPath = path.resolve(name);
          if (!fs.existsSync(localPath)) {
            console.log('  ' + t(state.language, 'pluginsInstallFailed', { error: `Path not found: ${localPath}` }));
            return true;
          }
          const pkgJson = path.join(localPath, 'package.json');
          const pkgName = fs.existsSync(pkgJson)
            ? (JSON.parse(fs.readFileSync(pkgJson, 'utf8')).name || path.basename(localPath))
            : path.basename(localPath);
          const targetDir = path.join(pluginsDir, 'node_modules', pkgName);
          fs.mkdirSync(path.dirname(targetDir), { recursive: true });
          if (fs.existsSync(targetDir)) fs.rmSync(targetDir, { recursive: true });
          fs.cpSync(localPath, targetDir, { recursive: true, filter: (src) => !src.includes('node_modules') });
          console.log('  ' + t(state.language, 'pluginsInstalledSuccess', { name: pkgName }));
          const manifestPath = path.join(targetDir, 'manifest.json');
          if (fs.existsSync(manifestPath)) {
            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
            console.log('  ' + t(state.language, 'pluginsType', { type: manifest.type || 'unknown' }));
            console.log('  ' + t(state.language, 'pluginsDescription', { desc: manifest.description || 'N/A' }));
            console.log('  ' + t(state.language, 'pluginsAuthor', { author: manifest.author || 'N/A' }));
          } else {
            console.log('  ' + t(state.language, 'pluginsNoManifestNote'));
          }
        } else {
          execSync(`npm install --prefix "${pluginsDir}" ${name}`, { stdio: 'pipe', timeout: 60000 });
          console.log('  ' + t(state.language, 'pluginsInstalledSuccess', { name }));
          const manifestPath = path.join(pluginsDir, 'node_modules', name, 'manifest.json');
          if (fs.existsSync(manifestPath)) {
            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
            console.log('  ' + t(state.language, 'pluginsType', { type: manifest.type || 'unknown' }));
            console.log('  ' + t(state.language, 'pluginsDescription', { desc: manifest.description || 'N/A' }));
            console.log('  ' + t(state.language, 'pluginsAuthor', { author: manifest.author || 'N/A' }));
          } else {
            console.log('  ' + t(state.language, 'pluginsNoManifestNote'));
          }
        }
      } catch (err) {
        console.log('  ' + t(state.language, 'pluginsInstallFailed', { error: err.message }));
      }
      return true;
    }

    if (sub === 'uninstall' || sub === 'remove') {
      const name = rest[0];
      if (!name) {
        console.log(t(state.language, 'pluginsUsageUninstall'));
        return true;
      }
      console.log('  ' + t(state.language, 'pluginsUninstalling', { name }));
      try {
        execSync(`npm uninstall --prefix "${pluginsDir}" ${name}`, { stdio: 'pipe', timeout: 30000 });
        console.log('  ' + t(state.language, 'pluginsRemoved', { name }));
      } catch (err) {
        console.log('  ' + t(state.language, 'pluginsUninstallFailed', { error: err.message }));
      }
      return true;
    }

    if (sub === 'search') {
      const query = rest.join(' ');
      if (!query) {
        console.log(t(state.language, 'pluginsUsageSearch'));
        return true;
      }
      console.log('  ' + t(state.language, 'pluginsSearching', { query }));
      try {
        const result = execSync(`npm search "zyn-plugin-${query}" --json 2>/dev/null || npm search "${query}" --json 2>/dev/null`, { stdio: 'pipe', timeout: 30000, encoding: 'utf8' });
        const packages = JSON.parse(result).slice(0, 10);
        if (packages.length === 0) {
          console.log('  ' + t(state.language, 'pluginsNoResults'));
        } else {
          console.log('  ' + t(state.language, 'pluginsFound', { count: packages.length }));
          for (const p of packages) {
            console.log(`    ${p.name} v${p.version} — ${p.description || t(state.language, 'pluginsNoDescription')}`);
          }
        }
      } catch (err) {
        console.log('  ' + t(state.language, 'pluginsSearchFailed', { error: err.message }));
      }
      return true;
    }

    console.log('  ' + t(state.language, 'pluginsUsage'));
    return true;
  }

  if (commandName === 'mcp') {
    const fs = require('fs');
    const path = require('path');
    const { MCP_CONFIG_FILE } = require('../config');
    const mcpConfigPath = MCP_CONFIG_FILE;
    const [sub, ...rest] = (args || '').split(' ').filter(Boolean);

    function loadMcpConfig() {
      try { return JSON.parse(fs.readFileSync(mcpConfigPath, 'utf8')); }
      catch { return { servers: {} }; }
    }
    function saveMcpConfig(config) {
      fs.mkdirSync(path.dirname(mcpConfigPath), { recursive: true });
      fs.writeFileSync(mcpConfigPath, JSON.stringify(config, null, 2), 'utf8');
    }

    if (!sub && askSelect) {
      const config = loadMcpConfig();
      const servers = Object.entries(config.servers || {});
      const menuItems = [
        { key: '__connect__', label: '+ ' + t(state.language, 'helpConnectMcp'), action: 'connect' },
        { key: '__disconnect__', label: '- ' + (state.language === 'es' ? 'Desconectar servidor' : 'Disconnect server'), action: 'disconnect' },
        { key: '__list__', label: (state.language === 'es' ? 'Lista de servidores' : 'List servers'), action: 'list' },
        { key: '__tools__', label: (state.language === 'es' ? 'Herramientas del servidor' : 'List tools'), action: 'tools' },
        { key: '__import__', label: '+ ' + t(state.language, 'mcpAutoDiscover'), action: 'import' },
      ];
      const choice = await askSelect({
        title: t(state.language, 'helpMcpServers'),
        subtitle: '↑/↓ ' + (state.language === 'es' ? 'navega · Enter elige · Esc cancela' : 'move · Enter pick · Esc cancel'),
        items: menuItems,
        getLabel: (item) => item.label,
        getValue: (item) => item.key,
      });
      if (!choice) return true;

      if (choice === '__connect__') {
        const jsonInput = await askInput({
          title: state.language === 'es' ? 'Ingresa el JSON del MCP' : 'Enter MCP JSON',
          prompt: '',
          defaultValue: '',
        });
        if (!jsonInput) return true;
        let serverConfig;
        try {
          serverConfig = JSON.parse(jsonInput);
        } catch {
          console.log('  ' + (state.language === 'es' ? 'JSON invalido. Ejemplo: {"name":"mi-servidor","url":"http://localhost:3000"}' : 'Invalid JSON. Example: {"name":"my-server","url":"http://localhost:3000"}'));
          return true;
        }
        const serverName = serverConfig.name || serverConfig.serverName;
        const serverUrl = serverConfig.url;
        const serverCommand = serverConfig.command;
        const serverArgs = serverConfig.args;
        const serverEnv = serverConfig.env;
        const serverCwd = serverConfig.cwd;
        const serverHeaders = serverConfig.headers;
        const serverProtocol = serverConfig.protocol || serverConfig.format;
        const serverTransport = serverConfig.type || (serverUrl ? 'http' : 'stdio');
        if (!serverName) {
          console.log('  ' + (state.language === 'es' ? 'El JSON debe incluir "name"' : 'JSON must include "name"'));
          return true;
        }
        if (!serverUrl && !serverCommand) {
          console.log('  ' + (state.language === 'es' ? 'El JSON debe incluir "url" (HTTP) o "command" (stdio)' : 'JSON must include "url" (HTTP) or "command" (stdio)'));
          return true;
        }
        config.servers = config.servers || {};
        config.servers[serverName] = {
          transport: serverTransport,
          connected: true,
          addedAt: new Date().toISOString(),
          ...(serverUrl ? { url: serverUrl } : {}),
          ...(serverHeaders ? { headers: serverHeaders } : {}),
          ...(serverProtocol ? { protocol: serverProtocol } : {}),
          ...(serverEnv ? { env: serverEnv } : {}),
          ...(serverCommand ? { command: serverCommand } : {}),
          ...(serverArgs ? { args: serverArgs } : {}),
          ...(serverCwd ? { cwd: serverCwd } : {}),
        };
        saveMcpConfig(config);
        const label = serverUrl || `${serverCommand} ${(serverArgs || []).join(' ')}`;
        console.log('  ' + t(state.language, 'mcpConnectedAt', { name: serverName, url: label }));
        return true;
      }

      if (choice === '__disconnect__') {
        const connectedServers = servers.filter(([, srv]) => srv.connected);
        if (connectedServers.length === 0) {
          console.log('  ' + (state.language === 'es' ? 'No hay servidores conectados' : 'No connected servers'));
          return true;
        }
        const disconnectItems = connectedServers.map(([name, srv]) => ({
          key: name,
          label: `${name} — ${srv.url}`,
          serverName: name,
        }));
        const disconnectChoice = await askSelect({
          title: state.language === 'es' ? 'Desconectar servidor' : 'Disconnect server',
          subtitle: '↑/↓ ' + (state.language === 'es' ? 'navega · Enter elige · Esc cancela' : 'move · Enter pick · Esc cancel'),
          items: disconnectItems,
          getLabel: (item) => item.label,
          getValue: (item) => item.key,
        });
        if (!disconnectChoice) return true;
        config.servers[disconnectChoice].connected = false;
        saveMcpConfig(config);
        console.log('  ' + t(state.language, 'mcpDisconnectedServer', { name: disconnectChoice }));
        return true;
      }

      if (choice === '__list__') {
        if (servers.length === 0) {
          console.log(t(state.language, 'mcpNone'));
          return true;
        }
        console.log(t(state.language, 'mcpServers'));
        for (const [name, srv] of servers) {
          console.log(`  ${srv.connected ? '>' : ' '} ${name} — ${srv.url} [${srv.connected ? t(state.language, 'mcpConnected') : t(state.language, 'mcpDisconnected')}]`);
        }
        return true;
      }

      if (choice === '__tools__') {
        if (servers.length === 0) {
          console.log('  ' + (state.language === 'es' ? 'No hay servidores configurados' : 'No servers configured'));
          return true;
        }
        const toolServerItems = servers.map(([name, srv]) => ({
          key: name,
          label: `${name} — ${srv.url || srv.command || '?'} [${srv.connected ? t(state.language, 'mcpConnected') : t(state.language, 'mcpDisconnected')}]`,
          serverName: name,
        }));
        const toolChoice = await askSelect({
          title: state.language === 'es' ? 'Seleccionar servidor' : 'Select server',
          subtitle: '↑/↓ ' + (state.language === 'es' ? 'navega · Enter elige · Esc cancela' : 'move · Enter pick · Esc cancel'),
          items: toolServerItems,
          getLabel: (item) => item.label,
          getValue: (item) => item.key,
        });
        if (!toolChoice) return true;
        const srv = config.servers[toolChoice];
        console.log('  ' + t(state.language, 'mcpToolsFrom', { name: toolChoice, url: srv.url }));
        if (srv?.tools?.length) {
          for (const tool of srv.tools) {
            console.log(`    ${tool.name} — ${tool.description || ''}`);
          }
        } else {
          console.log('  ' + t(state.language, 'mcpToolsNote'));
        }
        return true;
      }

      if (choice === '__import__') {
        console.log('  ' + t(state.language, 'mcpAutoDiscover'));
        console.log('  ' + t(state.language, 'mcpAutoDiscoverHint'));
        return true;
      }

      return true;
    }

    if (!sub) {
      const config = loadMcpConfig();
      const servers = Object.entries(config.servers || {});
      if (servers.length === 0) {
        console.log(t(state.language, 'mcpNone'));
        return true;
      }
      console.log(t(state.language, 'mcpServers'));
      for (const [name, srv] of servers) {
        const transport = srv.transport || (srv.url ? 'http' : 'stdio');
        const label = transport === 'stdio' ? `${srv.command || '?'} ${(srv.args || []).join(' ')}`.trim() : srv.url;
        console.log(`  ${srv.connected ? '>' : ' '} ${name} — ${label} [${transport}] [${srv.connected ? t(state.language, 'mcpConnected') : t(state.language, 'mcpDisconnected')}]`);
      }
      return true;
    }

    if (sub === 'connect') {
      const jsonArg = rest.join(' ').trim();
      let serverConfig;
      let serverName, serverUrl, serverHeaders, serverEnv, serverTransport, serverCommand, serverArgs, serverCwd, serverProtocol;
      if (jsonArg) {
        try {
          serverConfig = JSON.parse(jsonArg);
        } catch {
          console.log('  ' + (state.language === 'es' ? 'JSON invalido. Ejemplo: {"name":"mi-servidor","url":"http://localhost:3000"} o {"name":"mi-servidor","command":"npx","args":["-y","@modelcontextprotocol/server-filesystem"]}' : 'Invalid JSON. Example: {"name":"my-server","url":"http://localhost:3000"} or {"name":"my-server","command":"npx","args":["-y","@modelcontextprotocol/server-filesystem"]}'));
          return true;
        }
        serverName = serverConfig.name || serverConfig.serverName;
        serverUrl = serverConfig.url;
        serverHeaders = serverConfig.headers;
        serverProtocol = serverConfig.protocol || serverConfig.format;
        serverEnv = serverConfig.env;
        serverCwd = serverConfig.cwd;
        serverCommand = serverConfig.command;
        serverArgs = serverConfig.args;
        serverTransport = serverConfig.type || (serverUrl ? 'http' : 'stdio');
      }
      if (!serverName && askInput) {
        serverName = await askInput({ title: state.language === 'es' ? 'Nombre del servidor' : 'Server name', prompt: 'name', defaultValue: '' });
      }
      if (!serverUrl && !serverCommand && askInput) {
        const mode = await askSelect?.({
          title: state.language === 'es' ? 'Tipo de conexion' : 'Connection type',
          subtitle: '↑/↓ ' + (state.language === 'es' ? 'navega · Enter elige · Esc cancela' : 'move · Enter pick · Esc cancel'),
          items: [
            { key: 'http', label: 'HTTP/SSE — ' + (state.language === 'es' ? 'Servidor remoto' : 'Remote server') },
            { key: 'stdio', label: 'Stdio — ' + (state.language === 'es' ? 'Proceso local' : 'Local process') },
          ],
          getLabel: (item) => item.label,
          getValue: (item) => item.key,
        });
        if (mode === 'stdio') {
          serverCommand = await askInput({ title: 'Command', prompt: 'npx', defaultValue: 'npx' });
          const argsStr = await askInput({ title: 'Args (JSON array)', prompt: '["-y","@modelcontextprotocol/server-filesystem"]', defaultValue: '[]' });
          try { serverArgs = JSON.parse(argsStr); } catch { serverArgs = argsStr.split(/\s+/); }
        } else {
          serverUrl = await askInput({ title: 'URL', prompt: 'http://localhost:PORT', defaultValue: 'http://localhost:3000' });
        }
      }
      if (!serverName) {
        console.log('  ' + (state.language === 'es' ? 'Nombre requerido' : 'Name required'));
        return true;
      }
      if (!serverUrl && !serverCommand) {
        console.log('  ' + (state.language === 'es' ? 'URL o command requerido' : 'URL or command required'));
        return true;
      }
      serverTransport = serverTransport || (serverUrl ? 'http' : 'stdio');
      const config = loadMcpConfig();
      config.servers = config.servers || {};
      config.servers[serverName] = {
        transport: serverTransport,
        connected: true,
        addedAt: new Date().toISOString(),
        ...(serverUrl ? { url: serverUrl } : {}),
        ...(serverHeaders ? { headers: serverHeaders } : {}),
        ...(serverProtocol ? { protocol: serverProtocol } : {}),
        ...(serverEnv ? { env: serverEnv } : {}),
        ...(serverCommand ? { command: serverCommand } : {}),
        ...(serverArgs ? { args: serverArgs } : {}),
        ...(serverCwd ? { cwd: serverCwd } : {}),
      };
      saveMcpConfig(config);
      const label = serverUrl || `${serverCommand} ${(serverArgs || []).join(' ')}`;
      console.log('  ' + t(state.language, 'mcpConnectedAt', { name: serverName, url: label }));
      return true;
    }

    if (sub === 'disconnect') {
      let name = rest[0];
      if (!name && askSelect) {
        const config = loadMcpConfig();
        const connectedServers = Object.entries(config.servers || {}).filter(([, srv]) => srv.connected);
        if (connectedServers.length === 0) {
          console.log('  ' + (state.language === 'es' ? 'No hay servidores conectados' : 'No connected servers'));
          return true;
        }
        const disconnectItems = connectedServers.map(([n, srv]) => ({
          key: n,
          label: `${n} — ${srv.url}`,
          serverName: n,
        }));
        const disconnectChoice = await askSelect({
          title: state.language === 'es' ? 'Desconectar servidor' : 'Disconnect server',
          subtitle: '↑/↓ ' + (state.language === 'es' ? 'navega · Enter elige · Esc cancela' : 'move · Enter pick · Esc cancel'),
          items: disconnectItems,
          getLabel: (item) => item.label,
          getValue: (item) => item.key,
        });
        name = disconnectChoice;
      }
      if (!name) {
        console.log(t(state.language, 'mcpUsageDisconnect'));
        return true;
      }
      const config = loadMcpConfig();
      if (config.servers?.[name]) {
        config.servers[name].connected = false;
        saveMcpConfig(config);
        console.log('  ' + t(state.language, 'mcpDisconnectedServer', { name }));
      } else {
        console.log('  ' + t(state.language, 'mcpServerNotFound', { name }));
      }
      return true;
    }

    if (sub === 'tools') {
      const name = rest[0];
      if (!name) {
        console.log(t(state.language, 'mcpUsageTools'));
        return true;
      }
      const config = loadMcpConfig();
      const srv = config.servers?.[name];
      if (!srv) {
        console.log('  ' + t(state.language, 'mcpServerNotFound', { name }));
        return true;
      }
      console.log('  ' + t(state.language, 'mcpToolsFrom', { name, url: srv.url }));
      console.log('  ' + t(state.language, 'mcpToolsNote'));
      return true;
    }

    if (sub === 'import') {
      console.log('  ' + t(state.language, 'mcpAutoDiscover'));
      console.log('  ' + t(state.language, 'mcpAutoDiscoverNote'));
      console.log('  ' + t(state.language, 'mcpAutoDiscoverHint'));
      return true;
    }

    console.log('  ' + t(state.language, 'mcpUsage'));
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
